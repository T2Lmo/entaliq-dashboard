/**
 * ClaudeBridge.gs — تشغيل الوكلاء بـ Claude Sonnet عبر اشتراكك بدون API.
 *
 * الفكرة: الخادم لا يستدعي نموذجاً مباشرة؛ يضع الطلب في طابور، وعامل صغير على جهازك
 * (worker/claude-worker.mjs) يسحبه وينفذه بـ Claude Code باشتراكك، ثم يعيد النتيجة.
 * الخادم ينتظر النتيجة (حتى 5 دقائق) فتبقى بقية تدفقات Code.gs كما هي.
 *
 * التركيب:
 *  1) في doPost قبل authorize_ (العامل له رمزه الخاص وليس مستخدماً):
 *       const worker = handleClaudeWorkerAction_(body); if (worker) return worker;
 *  2) استبدل استدعاء Gemini في Code.gs بـ callClaude_(systemPrompt, userPrompt):
 *       مثال: const text = callClaude_(AGENTS_PROMPTS[agent], task);
 *     أو غلّف الدالة الحالية حتى لا تغيّر كل الاستدعاءات (عدّل الأسماء حسب كودك):
 *       function callGemini_(system, prompt, opts) {
 *         if (claudeEnabled_()) {
 *           try { return callClaude_(system, prompt, opts); }
 *           catch (e) { if (e.code !== "WORKER_OFFLINE" || !claudeFallbackAllowed_()) throw e; }
 *         }
 *         return callGeminiOriginal_(system, prompt, opts);   // الدالة القديمة بعد إعادة تسميتها
 *       }
 *  3) اختياري: أضف claude_status لقائمة الإجراءات بعد authorize_:
 *       if (body.action === "claude_status") return claudeJson_(Object.assign({ status: "success" }, claudeStatus_()));
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

// ---------------- الاستدعاء من Code.gs ----------------
// opts: { web: true للسماح بالبحث في الإنترنت (لنواف والباحث), timeoutMs, model }
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
