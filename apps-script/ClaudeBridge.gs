/**
 * ClaudeBridge.gs — تشغيل الوكلاء بـ Claude Sonnet عبر اشتراكك بدون API.
 *
 * الفكرة: الخادم لا يستدعي نموذجاً مباشرة؛ يضع الطلب في طابور، وعامل صغير على جهازك
 * (worker/claude-worker.mjs) يسحبه وينفذه بـ Claude Code باشتراكك، ثم يعيد النتيجة.
 * الخادم ينتظر النتيجة (حتى 5 دقائق) فتبقى بقية تدفقات Code.gs كما هي.
 *
 * التركيب في Code.gs (التفاصيل في SETUP.md):
 *  1) أعد تسمية «function callGemini(» إلى «function callGeminiApi_(». هذا الملف يعرّف callGemini
 *     الجديدة بنفس التوقيع، فيمر كل الوكلاء (لمى، فيصل، نواف، سالم، ريم، زياد، راكان…) عبر Claude دون تغيير آخر.
 *  2) في doPost قبل التحقق من المستخدم (العامل له رمزه الخاص):
 *       const worker = handleClaudeWorkerAction_(data); if (worker) return worker;
 *
 * يعتمد على دوال Code.gs: companyProfile_, COMMON_RULES, checkBudget_, executionDeadline_, appError_, getSetting_, MAX_CELL_CHARS
 *
 * Script Properties:
 *   AI_ENGINE        claude لتفعيل الجسر (أي قيمة أخرى = النموذج القديم)
 *   WORKER_TOKEN     رمز طويل عشوائي يعرفه العامل فقط (غير ACCESS_TOKEN)
 *   CLAUDE_MODEL     اختياري، الافتراضي sonnet
 *   CLAUDE_FALLBACK  اختياري: gemini = إن كان العامل غير متصل يُستخدم النموذج القديم بدل الخطأ
 */

const CLAUDE_ = {
  queueKey: "claude_queue",
  seenKey: "claude_worker_seen",
  chunk: 90000,          // حد CacheService للقيمة الواحدة 100KB
  ttl: 21600,            // 6 ساعات
  offlineAfterMs: 90000, // العامل يُعتبر غير متصل إن لم يسأل عن مهام منذ 90 ثانية
  waitMs: 300000,        // أقصى انتظار للنتيجة داخل طلب واحد (حد Apps Script 6 دقائق)
  longPollMs: 20000
};

function claudeEnabled_() {
  return String(PropertiesService.getScriptProperties().getProperty("AI_ENGINE") || "").toLowerCase() === "claude";
}

function claudeFallbackAllowed_() {
  return String(PropertiesService.getScriptProperties().getProperty("CLAUDE_FALLBACK") || "").toLowerCase() === "gemini";
}

// ---------------- بديل callGemini في Code.gs ----------------
// نفس التوقيع: (دور الوكيل، الطلب، asJson). AI_ENGINE=claude → Claude عبر جهازك؛ غير ذلك → Gemini كما كان.
function callGemini(systemRole, userPrompt, asJson) {
  // إدارة المكتب (Office.gs): الوكيل موقوف أو خارج ساعاته، وتعليماته وتوجيهات المدير المعدّلة
  if (typeof officeSystemFor_ === "function") systemRole = officeSystemFor_(systemRole);
  if (!claudeEnabled_()) return callGeminiApi_(systemRole, userPrompt, asJson);
  try {
    return callClaudeAgent_(systemRole, userPrompt, asJson);
  } catch (e) {
    if (e.code === "WORKER_OFFLINE" && claudeFallbackAllowed_() && getSetting_("GEMINI_API_KEY")) return callGeminiApi_(systemRole, userPrompt, asJson);
    throw e;
  }
}

// نفس تعليمات النظام التي كانت تُرسل لـ Gemini: دور الوكيل + القواعد العامة + ملف الشركة
function callClaudeAgent_(systemRole, userPrompt, asJson) {
  checkBudget_(20000);
  const profile = companyProfile_();
  const system = systemRole + "\n" + COMMON_RULES
    + (profile ? "\n\nملف الشركة (المرجع الوحيد لخدماتنا ومنتجاتنا):\n" + profile : "")
    + "\n\nتعمل هنا كنموذج نصي داخل نظام المكتب: أعد المطلوب مباشرة بلا مقدمات ولا تعليق على طريقة عملك."
    + (asJson ? "\nأعد JSON صالحاً فقط، بلا أي نص قبله أو بعده وبلا علامات ```." : "");
  // لا ننتظر أبعد من ميزانية التنفيذ الحالية (doPost وخطة الأسبوع ورصد الأخبار تضبطها)
  const remaining = executionDeadline_ ? executionDeadline_ - Date.now() - 15000 : CLAUDE_.waitMs;
  if (remaining < 20000) throw appError_("BUDGET_EXCEEDED", "اقترب حد التنفيذ؛ حُفظ التقدم ويمكن استكمال المتبقي");
  const text = String(callClaude_(system, userPrompt, { timeoutMs: Math.min(CLAUDE_.waitMs, remaining) }) || "").trim();
  if (!text) throw new Error("رد Claude فارغ");
  if (text.length > MAX_CELL_CHARS) throw appError_("OUTPUT_TOO_LONG", "رد Claude أطول من حد الحفظ؛ لم يُحفظ نص مقتطع");
  return text;
}

// ---------------- الطابور ----------------
// opts: { web: true للسماح بالبحث في الإنترنت, timeoutMs, model }
function callClaude_(systemPrompt, userPrompt, opts) {
  opts = opts || {};
  if (!claudeWorkerOnline_()) throw claudeError_("WORKER_OFFLINE", "عامل Claude على جهازك غير متصل. شغّل start-worker ثم أعد المحاولة.");
  const id = enqueueClaudeJob_(systemPrompt, userPrompt, opts);
  return waitClaudeResult_(id, opts.timeoutMs || CLAUDE_.waitMs);
}

function enqueueClaudeJob_(systemPrompt, userPrompt, opts) {
  opts = opts || {};
  const id = Utilities.getUuid();
  const job = { id: id, system: String(systemPrompt || ""), prompt: String(userPrompt || ""), web: !!opts.web,
    model: opts.model || PropertiesService.getScriptProperties().getProperty("CLAUDE_MODEL") || "sonnet", created: Date.now() };
  putBig_("cj_" + id, JSON.stringify(job));
  withLock_(function () {
    const q = readQueue_();
    q.push(id);
    CacheService.getScriptCache().put(CLAUDE_.queueKey, JSON.stringify(q), CLAUDE_.ttl);
  });
  return id;
}

function waitClaudeResult_(id, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const raw = getBig_("cr_" + id);
    if (raw) {
      const r = JSON.parse(raw);
      if (r.error) throw claudeError_("CLAUDE_ERROR", "Claude: " + r.error);
      return String(r.result || "");
    }
    Utilities.sleep(1500);
  }
  CacheService.getScriptCache().put("cc_" + id, "1", CLAUDE_.ttl); // يتجاهلها العامل إن لم يبدأها
  throw claudeError_("CLAUDE_TIMEOUT", "تأخر رد Claude أكثر من " + Math.round(timeoutMs / 60000) + " دقائق. تحقق من العامل على جهازك.");
}

// ---------------- طلبات العامل ----------------
function handleClaudeWorkerAction_(body) {
  const action = body && body.action;
  if (["claude_next", "claude_done"].indexOf(action) < 0) return null;
  try {
    const expected = PropertiesService.getScriptProperties().getProperty("WORKER_TOKEN");
    if (!expected || !body.workerToken || !safeEqual_(String(body.workerToken), expected)) throw claudeError_("UNAUTHORIZED", "WORKER_TOKEN غير صحيح.");
    if (action === "claude_next") return claudeJson_({ status: "success", job: nextClaudeJob_(Math.min(Number(body.waitMs) || CLAUDE_.longPollMs, 25000)) });
    finishClaudeJob_(String(body.id || ""), body.result, body.error);
    return claudeJson_({ status: "success" });
  } catch (e) {
    return claudeJson_({ status: "error", code: e.code || "ERROR", message: e.message || String(e) });
  }
}

// انتظار قصير (long-poll) حتى تظهر مهمة، فيقل عدد طلبات العامل
function nextClaudeJob_(waitMs) {
  const cache = CacheService.getScriptCache();
  const until = Date.now() + waitMs;
  do {
    cache.put(CLAUDE_.seenKey, String(Date.now()), CLAUDE_.ttl);
    let id = null;
    if (readQueue_().length) {
      id = withLock_(function () {
        const q = readQueue_();
        let picked = null;
        while (q.length && !picked) {
          const next = q.shift();
          if (!cache.get("cc_" + next)) picked = next;
        }
        cache.put(CLAUDE_.queueKey, JSON.stringify(q), CLAUDE_.ttl);
        return picked;
      });
    }
    if (id) {
      const raw = getBig_("cj_" + id);
      if (raw) return JSON.parse(raw);
    }
    if (Date.now() + 1000 >= until) break;
    Utilities.sleep(1000);
  } while (true);
  return null;
}

function finishClaudeJob_(id, result, error) {
  if (!id) throw claudeError_("BAD_REQUEST", "معرّف المهمة مفقود.");
  putBig_("cr_" + id, JSON.stringify({ result: result == null ? "" : String(result), error: error ? String(error) : "" }));
}

function claudeWorkerOnline_() {
  const seen = Number(CacheService.getScriptCache().get(CLAUDE_.seenKey)) || 0;
  return Date.now() - seen < CLAUDE_.offlineAfterMs;
}

function claudeStatus_() {
  const seen = Number(CacheService.getScriptCache().get(CLAUDE_.seenKey)) || 0;
  return { engine: claudeEnabled_() ? "claude" : "default", online: claudeWorkerOnline_(), lastSeen: seen ? new Date(seen).toISOString() : "",
    model: PropertiesService.getScriptProperties().getProperty("CLAUDE_MODEL") || "sonnet", queued: readQueue_().length };
}

// ---------------- أدوات ----------------
function readQueue_() {
  try { return JSON.parse(CacheService.getScriptCache().get(CLAUDE_.queueKey) || "[]"); } catch (e) { return []; }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// يقسّم النص الطويل على عدة مفاتيح في CacheService
function putBig_(key, str) {
  const cache = CacheService.getScriptCache(), parts = {};
  const n = Math.max(1, Math.ceil(str.length / CLAUDE_.chunk));
  for (let i = 0; i < n; i++) parts[key + "_" + i] = str.slice(i * CLAUDE_.chunk, (i + 1) * CLAUDE_.chunk);
  cache.putAll(parts, CLAUDE_.ttl);
  cache.put(key, String(n), CLAUDE_.ttl); // يُكتب العدد أخيراً حتى لا تُقرأ قيمة ناقصة
}

function getBig_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key)) || 0;
  if (!n) return "";
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + "_" + i);
  const got = cache.getAll(keys);
  if (keys.some(function (k) { return got[k] == null; })) return "";
  return keys.map(function (k) { return got[k]; }).join("");
}

function claudeJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function claudeError_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
