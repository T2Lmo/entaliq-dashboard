"use strict";
// القوائم داخل اللوحة الجانبية: المهام والأخبار والبحث والفريق

// ---------------- القوائم داخل اللوحة الجانبية ----------------
const RESEARCH_PENDING = ["queued", "searching", "auditing"];
const RESEARCH_TERMINAL = ["completed", "failed", "partial", "imported"];
const RESEARCH_LABEL = { imported: "منقول من Claude", submitting: "جارٍ حفظ الطلب", unknown: "جارٍ التحقق من استلام الطلب", queued: "بانتظار بدء البحث", searching: "يجري البحث في المصادر", auditing: "اكتمل البحث وجارٍ تدقيقه", completed: "اكتمل البحث", partial: "نتيجة جزئية تحتاج مراجعة", failed: "تعذر إكمال البحث" };
const researchStoreKey = () => KEYS.research + ":" + encodeURIComponent(state.url || "unconfigured");
const researchIsPending = meta => !!meta && !RESEARCH_TERMINAL.includes(meta.status);
function saveResearchIntents() {
  const entries = Object.entries(state.researchIntents);
  const ended = entries.filter(([, v]) => !researchIsPending(v)).sort((a, b) => String(b[1].submittedAt || "").localeCompare(String(a[1].submittedAt || ""))).slice(0, 10);
  const kept = Object.fromEntries(entries.filter(([, v]) => researchIsPending(v)).concat(ended));
  const text = JSON.stringify(kept);
  try { localStorage.setItem(researchStoreKey(), text); return localStorage.getItem(researchStoreKey()) === text; } catch (e) { return false; }
}
function restoreResearchTracking() {
  clearTimeout(state.researchTimer); state.researchPollSeq++; state.researchPolling = false;
  state.researchIntents = {}; state.researchTasks = {}; state.researchFocus = "";
  try {
    const saved = JSON.parse(store.get(researchStoreKey()) || "{}");
    Object.entries(saved).forEach(([id, item]) => {
      if (/^[A-Za-z0-9_-]{16,100}$/.test(id) && item && typeof item.taskText === "string") state.researchIntents[id] = { ...item, requestId: id, status: item.status === "submitting" ? "unknown" : item.status, paused: false, readErrors: 0 };
    });
  } catch (e) {}
  const pending = Object.values(state.researchIntents).filter(researchIsPending);
  if (pending.length) { state.researchFocus = pending[0].requestId; state.resultOwner = "research"; }
  restoreManualDraft(); renderResearchBanner(); scheduleResearchPoll(1000);
}
function researchSafeUrl(value) {
  try { const u = new URL(String(value || "")); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : ""; } catch (e) { return ""; }
}
const manualStoreKey = () => KEYS.manualResearch + ":" + encodeURIComponent(state.url || "unconfigured");
const researchIsManual = meta => !!meta && (meta.sourceMode === "claude_manual" || meta.status === "imported");
const researchLabel = meta => researchIsManual(meta) ? ({ submitting: "جارٍ حفظ التقرير", unknown: "جارٍ التحقق من حفظ التقرير", failed: "تعذر حفظ التقرير", imported: "منقول من Claude" }[meta.status] || "تقرير منقول من Claude") : RESEARCH_LABEL[meta.status] || "بحث جارٍ";
function saveManualDraft() {
  const text = JSON.stringify(state.manualDraft);
  try { localStorage.setItem(manualStoreKey(), text); return localStorage.getItem(manualStoreKey()) === text; } catch (e) { return false; }
}
function restoreManualDraft() {
  let saved = {};
  try { saved = JSON.parse(store.get(manualStoreKey()) || "{}"); } catch (e) {}
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
  state.manualDraft = Object.fromEntries(["task", "report", "sourcesText", "requestId", "payloadKey"].map(k => [k, typeof saved[k] === "string" ? saved[k] : ""]));
  if (state.agent === "الباحث") $("#taskInput").value = state.manualDraft.task;
  $("#manualReport").value = state.manualDraft.report;
  $("#manualSources").value = state.manualDraft.sourcesText;
  renderManualSources();
}
function captureManualDraft() {
  if (state.agent !== "الباحث") return;
  Object.assign(state.manualDraft, { task: $("#taskInput").value, report: $("#manualReport").value, sourcesText: $("#manualSources").value });
  saveManualDraft();
}
function parseManualSources(text) {
  const sources = [], errors = [], seen = new Set();
  String(text || "").split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const split = line.lastIndexOf("|"), raw = (split < 0 ? line : line.slice(split + 1)).trim(), title = split < 0 ? "" : line.slice(0, split).trim();
    const url = /^[\x00-\x20\x7f]|[\s\\\x00-\x1f\x7f]/.test(raw) ? "" : researchSafeUrl(raw);
    if (!url || !/^https?:\/\//i.test(raw)) { errors.push("السطر " + (index + 1) + ": استخدم رابط HTTP أو HTTPS صالحاً دون بيانات دخول."); return; }
    if (raw.length > 2000 || title.length > 250) { errors.push("السطر " + (index + 1) + ": الرابط أو عنوان المصدر أطول من الحد المسموح."); return; }
    if (!seen.has(url)) { seen.add(url); sources.push({ url, title }); }
  });
  if (sources.length > 20) errors.push("اختر حتى 20 مصدراً فقط قبل الحفظ.");
  return { sources, errors };
}
function renderManualSources() {
  const box = $("#manualSourcePreview"); if (!box) return;
  const parsed = parseManualSources(state.manualDraft.sourcesText);
  box.innerHTML = (parsed.errors.length ? '<p class="hint">' + parsed.errors.map(esc).join('<br>') + '</p>' : '')
    + (parsed.sources.length ? '<details class="fold" open><summary>مراجعة المصادر (' + parsed.sources.length + ')</summary><ul>' + parsed.sources.map(s => '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title || s.url.slice(0, 250)) + '</a></li>').join('') + '</ul></details>' : '<p class="hint">لم تُضف مصادر بعد؛ يمكنك كتابتها أو استخراج الروابط من التقرير.</p>');
}
function extractManualSources() {
  captureManualDraft();
  const found = (state.manualDraft.report.match(/https?:\/\/[^\s<>"'\u0060]+/gi) || []).map(u => u.replace(/[)\]}>،,.;:!?]+$/g, ""));
  const existing = state.manualDraft.sourcesText.split(/\r?\n/).filter(s => s.trim());
  const seen = new Set(parseManualSources(state.manualDraft.sourcesText).sources.map(s => s.url));
  found.forEach(raw => { const url = researchSafeUrl(raw); if (url && !seen.has(url)) { seen.add(url); existing.push(url); } });
  state.manualDraft.sourcesText = existing.join("\n"); $("#manualSources").value = state.manualDraft.sourcesText;
  saveManualDraft(); renderManualSources();
  toast(found.length ? "استُخرجت الروابط؛ راجع القائمة وعدّلها قبل الحفظ." : "لم أجد روابط HTTP أو HTTPS في التقرير.", found.length ? "ok" : "warn");
}
async function copyManualResearchPrompt() {
  captureManualDraft(); const task = state.manualDraft.task.trim();
  if (!task || task.length > 6000) { toast("اكتب مهمة بحث بين 1 و6000 حرف.", "warn"); $("#taskInput").focus(); return; }
  const prompt = ["أعد تقرير بحث بالعربية عن المهمة التالية:", task, "", "متطلبات التقرير:", "- استخدم البحث على الإنترنت إن كان متاحاً، وصرّح بوضوح إن لم تستخدمه.", "- اعتمد على المصادر الأصلية والرسمية قدر الإمكان، وافصل الحقائق عن الاستنتاجات.", "- اذكر تاريخ إعداد التقرير وتواريخ المعلومات المهمة؛ وضّح ما لم يمكن التحقق منه.", "- اربط الادعاءات المهمة بمصادرها، ولا تخمّن أرقاماً أو روابط.", "- اختم بخلاصة عملية وحدود البحث ثم قائمة المصادر (حتى 20)؛ لكل مصدر: عنوان المصدر | رابط HTTP أو HTTPS كامل.", "- لا تمنح التقرير درجة دقة آلية. اجعل التقرير كاملاً في حدود 30000 حرف ليسهل حفظه."].join("\n");
  const ok = await copyText(prompt);
  toast(ok ? "نُسخت التعليمات؛ افتح Claude والصقها هناك." : "تعذر النسخ؛ أعد المحاولة من زر النسخ.", ok ? "ok" : "bad");
}
async function submitManualResearch(resumeRequestId) {
  if (state.sending) return;
  if (!state.url || !hasAuth()) { openSettings(); return; }
  const epoch = state.connectionEpoch, url = state.url, token = state.token;
  let payload, payloadKey, requestId = resumeRequestId, previous;
  if (resumeRequestId) {
    previous = state.researchIntents[resumeRequestId];
    if (!previous || !researchIsManual(previous) || previous.status !== "unknown" || !(previous.notFoundCount >= 3) || !previous.payload) return;
    payload = previous.payload; payloadKey = previous.payloadKey;
  } else {
    captureManualDraft();
    const parsed = parseManualSources(state.manualDraft.sourcesText);
    payload = { task: state.manualDraft.task.replace(/\r\n?/g, "\n").trim(), report: state.manualDraft.report.replace(/\r\n?/g, "\n").trim(), sources: parsed.sources };
    if (!payload.task || payload.task.length > 6000) { toast("اكتب مهمة بحث بين 1 و6000 حرف.", "warn"); return; }
    if (!payload.report || payload.report.length > 30000) { toast("الصق تقريراً بين 1 و30000 حرف قبل الحفظ.", "warn"); $("#manualReport").focus(); return; }
    if (parsed.errors.length) { toast(parsed.errors[0], "warn"); $("#manualSources").focus(); return; }
    payloadKey = JSON.stringify(payload);
    previous = Object.values(state.researchIntents).find(i => researchIsManual(i) && i.payloadKey === payloadKey);
    if (previous && researchIsPending(previous)) { await followResearch(previous.requestId); return; }
    requestId = previous ? previous.requestId : state.manualDraft.payloadKey === payloadKey ? state.manualDraft.requestId : "";
    try { if (!requestId) requestId = crypto.randomUUID(); } catch (e) { toast("تعذر إنشاء معرّف آمن للحفظ.", "bad"); return; }
    Object.assign(state.manualDraft, { requestId, payloadKey });
    if (!saveManualDraft()) { toast("تعذر حفظ المسودة في المتصفح؛ فعّل التخزين المحلي ثم حاول مجدداً.", "bad"); return; }
    if (previous && previous.status === "imported") {
      state.researchFocus = requestId; state.resultOwner = "research";
      if (!state.tasks.some(r => r[0] === previous.taskId)) {
        try { const data = await api({ action: "research_status", requestId }); if (!sameConnection(epoch, url, token)) return; if (!data.research || data.research.requestId !== requestId) throw new Error("تعذر مطابقة التقرير المحفوظ."); acceptResearchResult(data); }
        catch (e) { if (sameConnection(epoch, url, token)) toast(e.message, "warn"); }
      }
      if (sameConnection(epoch, url, token)) { renderResearchResult(); toast("هذا التقرير محفوظ بالفعل في المكتب.", "ok"); }
      return;
    }
  }
  const intent = { ...(previous || {}), requestId, taskId: previous ? previous.taskId || "" : "", taskText: payload.task, payload, payloadKey, sourceMode: "claude_manual", submittedAt: previous ? previous.submittedAt : new Date().toISOString(), status: "submitting", error: "", paused: false, readErrors: 0, notFoundCount: 0 };
  state.researchIntents[requestId] = intent;
  if (!saveResearchIntents()) { if (previous) state.researchIntents[requestId] = previous; else delete state.researchIntents[requestId]; toast("تعذر حفظ معلومات المتابعة في المتصفح؛ لم يُرسل التقرير.", "bad"); return; }
  state.researchFocus = requestId; state.resultOwner = "research"; state.sending = true;
  const stop = busy($("#btnSend"), "جارٍ حفظ التقرير"); renderResearchResult();
  try {
    const data = await api({ action: "research_import", requestId, ...payload });
    if (!sameConnection(epoch, url, token)) return;
    if (!data.research || data.research.requestId !== requestId || data.research.status !== "imported") throw new Error("لم يصل تأكيد مطابق للحفظ؛ تابع الحالة للتحقق من استلام التقرير.");
    acceptResearchResult(data); renderResearchResult();
    toast("حُفظ التقرير المنقول من Claude ومصادره في المكتب.", "ok");
    await refresh({ quiet: true });
    if (!sameConnection(epoch, url, token)) return;
    renderResearchResult();
  } catch (e) {
    if (!sameConnection(epoch, url, token)) return;
    const active = state.researchIntents[requestId];
    if (active) { active.status = ["VALIDATION_ERROR", "UNAUTHORIZED", "CONFIG_ERROR", "CONFLICT", "BUSY"].includes(e.code) ? "failed" : "unknown"; active.error = e.message + (active.status === "unknown" ? " المسودة محفوظة؛ المتابعة تتحقق من استلام التقرير دون إعادة إرساله." : " المسودة محفوظة ويمكنك تصحيحها أو إعادة الحفظ."); }
    saveResearchIntents(); renderResearchResult();
  } finally {
    stop();
    if (sameConnection(epoch, url, token)) { state.sending = false; renderCompose(); scheduleResearchPoll(); }
  }
}

function researchSuggestions(html) {
  if (!html || !window.DOMPurify) return "";
  const clean = DOMPurify.sanitize(String(html), { ADD_TAGS: ["style"], FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "base", "meta"], FORBID_ATTR: ["srcdoc"] });
  const policy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; form-action 'none'";
  const doc = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"></head><body>' + clean + '</body></html>';
  return '<div class="by">اقتراحات بحث Google</div><iframe title="اقتراحات بحث Google" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="' + esc(doc) + '" style="width:100%;height:220px;border:0;background:#fff;border-radius:8px"></iframe>';
}
function researchPanelHtml(meta) {
  if (!meta) return '<p class="hint">جارٍ تحميل تفاصيل البحث المحفوظ.</p>';
  const sources = (Array.isArray(meta.sources) ? meta.sources : []).map(s => ({ title: String(s.title || s.url || "المصدر"), url: researchSafeUrl(s.url) })).filter(s => s.url);
  const manual = researchIsManual(meta);
  const queries = (Array.isArray(meta.queries) ? meta.queries : []).map(String);
  const date = meta.importedAt || meta.completedAt || meta.startedAt || meta.createdAt || "";
  const queryCount = Number.isInteger(meta.queryCount) && meta.queryCount >= 0 ? meta.queryCount : queries.length;
  const evidence = manual ? "المصادر مرفقة بالتقرير ولم تُتحقق آلياً" : meta.searchPerformed === true ? "بحث فعلي مسجل على الإنترنت" : researchIsPending(meta) ? "لم يصل دليل البحث بعد" : "لم يثبت إجراء بحث على الإنترنت لهذه النتيجة";
  const links = sources.map(s => '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a></li>').join("");
  const citations = (Array.isArray(meta.citations) ? meta.citations : []).filter(c => c.quote && researchSafeUrl(c.url)).slice(0, 20).map(c => '<li><q>' + esc(c.quote) + '</q> <a href="' + esc(researchSafeUrl(c.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(c.title || "المصدر") + '</a></li>').join("");
  return '<div class="note-box"><div class="tags"><span class="tag">' + esc(researchLabel(meta)) + '</span><span class="tag">' + esc(evidence) + '</span></div>'
    + '<p class="hint">' + (date ? (manual ? 'تاريخ النقل: ' : 'تاريخ البحث: ') + esc(fmtDate(date)) + ' · ' : '') + sources.length + ' مصادر' + (manual ? '' : ' · ' + queryCount + ' عبارات بحث') + '</p>'
    + (!manual && !researchIsPending(meta) && meta.documented !== true ? '<p class="hint">توثيق المصادر غير مكتمل؛ راجع حدود النتيجة قبل الاعتماد عليها.</p>' : '')
    + (meta.error ? '<p>' + esc(meta.error) + '</p>' : '')
    + ((meta.warnings || []).length ? '<ul>' + meta.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '')
    + (links ? '<details class="fold" open><summary>المصادر</summary><ul>' + links + '</ul></details>' : '')
    + (queries.length ? '<details class="fold"><summary>ما الذي جرى البحث عنه؟</summary><ul>' + queries.map(q => '<li>' + esc(q) + '</li>').join('') + '</ul></details>' : '')
    + (citations ? '<details class="fold"><summary>العبارات المرتبطة بالمصادر</summary><ul>' + citations + '</ul></details>' : '')
    + researchSuggestions(meta.searchEntryPointHtml) + '</div>';
}
function renderResearchBanner() {
  const box = $("#researchBanner");
  if (!box) return;
  const pending = Object.values(state.researchIntents).filter(researchIsPending);
  box.hidden = !pending.length;
  box.innerHTML = pending.map(item => '<div><strong>' + esc(researchLabel(item)) + '</strong><p class="hint">' + esc(clip(item.taskText, 130)) + '</p>' + (item.error ? '<p class="hint">' + esc(item.error) + '</p>' : '') + '<button type="button" class="btn btn-line sm" data-research-request="' + esc(item.requestId) + '"><span class="lbl-text">' + (researchIsManual(item) ? 'التحقق من الحفظ' : 'متابعة البحث') + '</span></button>' + (researchIsManual(item) && item.status === 'unknown' && item.notFoundCount >= 3 ? '<button type="button" class="btn btn-line sm" data-research-resend="' + esc(item.requestId) + '"><span class="lbl-text">إعادة حفظ التقرير نفسه</span></button>' : '') + '</div>').join('<hr>');
}
function renderResearchResult() {
  renderResearchBanner();
  if (state.resultOwner !== "research" || !state.researchFocus) return;
  const intent = state.researchIntents[state.researchFocus];
  if (!intent) return;
  const box = $("#result"), row = state.tasks.find(r => r[0] === intent.taskId);
  box.hidden = false; box.className = "result";
  if (row) { state.taskOpenId = row[0]; box.innerHTML = taskItem(row); }
  else box.innerHTML = '<div class="result-body"><strong>' + esc(researchLabel(intent)) + '</strong><p>' + esc(intent.taskText) + '</p><p class="hint">' + esc(intent.error || (researchIsManual(intent) ? "المسودة محفوظة في متصفحك، وجارٍ التحقق من حفظ التقرير في المكتب." : "حُفظ طلبك للمتابعة. قد يستغرق بدء البحث نحو دقيقة، ويستمر العمل بعد إغلاق الصفحة.")) + '</p></div>';
}
function ingestResearchMetadata(map, tasks) {
  Object.entries(map || {}).forEach(([id, meta]) => {
    if (!meta || typeof meta !== "object") return;
    state.researchTasks[id] = meta;
    const rid = String(meta.requestId || "");
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(rid)) return;
    const old = state.researchIntents[rid];
    if (!old && !researchIsPending(meta)) return;
    const row = (tasks || state.tasks).find(r => r[0] === id);
    state.researchIntents[rid] = { ...(old || {}), requestId: rid, taskId: id, taskText: row ? String(row[3] || "") : old ? old.taskText : "بحث محفوظ", status: meta.status, sourceMode: meta.sourceMode || (old && old.sourceMode) || "", submittedAt: old ? old.submittedAt : meta.createdAt, error: meta.error || "", paused: false, readErrors: 0 };
  });
  saveResearchIntents(); renderResearchBanner(); scheduleResearchPoll();
}
function acceptResearchResult(data) {
  if (!data || !Array.isArray(data.task) || !data.research || !data.taskId || data.task[0] !== data.taskId) throw new Error("لم تصل بيانات البحث كاملة؛ استخدم متابعة البحث للتحقق من حالته.");
  const previous = state.researchTasks[data.taskId];
  if (!previous || JSON.stringify(previous) !== JSON.stringify(data.research) || state.taskVersions[data.taskId] !== data.version) state.researchRevision++;
  const at = state.tasks.findIndex(r => r[0] === data.taskId);
  if (at >= 0) state.tasks[at] = data.task; else state.tasks.unshift(data.task);
  if (data.version) state.taskVersions[data.taskId] = data.version;
  ingestResearchMetadata({ [data.taskId]: data.research }, state.tasks);
}
function scheduleResearchPoll(delay) {
  clearTimeout(state.researchTimer);
  if (!state.url || !hasAuth() || !Object.values(state.researchIntents).some(i => researchIsPending(i) && !i.paused)) return;
  state.researchTimer = setTimeout(() => pollResearch(), delay === undefined ? 9000 : delay);
}
async function pollResearch() {
  if (state.researchPolling || !state.url || !hasAuth()) return;
  if (document.visibilityState === "hidden") { scheduleResearchPoll(); return; }
  const pending = Object.values(state.researchIntents).filter(i => researchIsPending(i) && !i.paused);
  if (!pending.length) return;
  const seq = ++state.researchPollSeq, epoch = state.connectionEpoch, url = state.url, token = state.token;
  const current = () => seq === state.researchPollSeq && sameConnection(epoch, url, token);
  state.researchPolling = true;
  let ended = false;
  try {
    for (const intent of pending) {
      if (!current()) return;
      try {
        const data = await api(intent.taskId ? { action: "research_status", id: intent.taskId } : { action: "research_status", requestId: intent.requestId });
        if (!current()) return;
        if (!data.research || data.research.requestId !== intent.requestId || (intent.taskId && data.taskId !== intent.taskId)) throw new Error("رد المتابعة لا يطابق طلب البحث؛ حاول متابعة الحالة مجدداً.");
        acceptResearchResult(data);
        ended = ended || RESEARCH_TERMINAL.includes(data.research.status);
      } catch (e) {
        if (!current()) return;
        const active = state.researchIntents[intent.requestId];
        if (active) { active.readErrors = (active.readErrors || 0) + 1; if (e.code === "NOT_FOUND") active.notFoundCount = (active.notFoundCount || 0) + 1; active.error = e.message + (researchIsManual(active) ? " المتابعة تتحقق من الحفظ دون إعادة إرسال التقرير." : " لن يُنشأ بحث آخر عند المتابعة."); if (e.code === "RESEARCH_MANUAL_MODE") active.status = "failed"; active.paused = active.readErrors >= 3 || ["UNAUTHORIZED", "CONFIG_ERROR", "RESEARCH_MANUAL_MODE"].includes(e.code); }
        saveResearchIntents();
      }
    }
    if (ended) await refresh({ quiet: true });
    if (!current()) return;
    renderResearchResult();
    if (state.view === "tasks" && sheet.open) renderTasksView();
  } finally {
    if (current()) { state.researchPolling = false; scheduleResearchPoll(); }
  }
}
async function followResearch(idOrRequest) {
  let intent = state.researchIntents[idOrRequest] || Object.values(state.researchIntents).find(i => i.taskId === idOrRequest);
  const meta = state.researchTasks[idOrRequest];
  if (!intent && meta) { ingestResearchMetadata({ [idOrRequest]: meta }, state.tasks); intent = state.researchIntents[meta.requestId]; }
  if (!intent) { toast("حدّث قائمة المهام لتحميل بيانات متابعة البحث.", "warn"); return; }
  state.researchFocus = intent.requestId; state.resultOwner = "research"; intent.paused = false; intent.readErrors = 0;
  saveResearchIntents(); renderResearchResult();
  if (researchIsPending(intent)) await pollResearch();
}
async function resendResearch(requestId) {
  const intent = state.researchIntents[requestId];
  if (state.sending || !intent || intent.status !== "unknown" || !(intent.notFoundCount >= 3)) return;
  if (researchIsManual(intent)) await submitManualResearch(requestId);
}
function researchCanAudit(row, meta) {
  return false; // التقارير اليدوية وسجل الباحث لا يستدعيان تدقيقاً مدفوعاً.
}

const AUDIT_HISTORY_MARKER = "<!-- AUDIT_HISTORY_V1 -->";
function splitTaskAudit(audit) {
  const text = String(audit || ""), cut = text.indexOf(AUDIT_HISTORY_MARKER);
  return { current: (cut < 0 ? text : text.slice(0, cut)).trim(), history: cut < 0 ? "" : text.slice(cut + AUDIT_HISTORY_MARKER.length).replace(/^\s*###\s*سجل التدقيق السابق\s*/, "").trim() };
}
function taskAuditHtml(audit) {
  const parts = splitTaskAudit(audit);
  return '<div class="audit"><div class="audit-h">' + avatar("سالم", "xs") + ' التدقيق الحالي</div><div class="md">' + md(parts.current || "لم تُسجل نتيجة تدقيق لهذه المهمة.") + '</div></div>'
    + (parts.history ? '<details class="fold"><summary>سجل التدقيق السابق</summary><div class="fold-body"><div class="md">' + md(parts.history) + '</div></div></details>' : "");
}
function taskItem(row, reason) {
  const [id, date, agent, task, output, audit, status] = row;
  const research = agent === "الباحث", meta = state.researchTasks[id], manual = researchIsManual(meta), researching = research && (!meta || researchIsPending(meta));
  const current = splitTaskAudit(audit).current, score = salemScore(current), pending = state.taskBusyId === id;
  const canAudit = !research || researchCanAudit(row, meta);
  const auditAction = canAudit ? '<button type="button" class="btn btn-line sm" data-task-reaudit="' + esc(id) + '" data-version="' + esc(state.taskVersions[id] || "") + '"' + (state.taskBusyId ? ' disabled' : '') + '><span class="lbl-text">' + (pending ? "جاري إعادة التدقيق…" : "إعادة التدقيق") + '</span></button>' : '';
  const follow = researching ? '<button type="button" class="btn btn-line sm" data-research-follow="' + esc(id) + '"><span class="lbl-text">متابعة البحث</span></button>' : '';
  const badge = manual ? '<span class="badge" data-tone="none">منقول من Claude</span>' : researching ? '<span class="badge" data-tone="none">' + esc(meta ? RESEARCH_LABEL[meta.status] || "بحث جارٍ" : "جارٍ تحميل البحث") + '</span>' : score === null ? '<span class="badge" data-tone="warn">لا تقدير حالي</span>' : scoreBadge(current);
  return '<article class="item"><div class="item-head">' + avatar(agent, "sm")
    + '<div class="item-meta"><strong>' + esc(agent) + '</strong><small>' + esc(fmtDate(date)) + ' · <span class="mono">' + esc(id) + '</span></small></div>'
    + (reason && !researching ? '<span class="badge" data-tone="bad">' + esc(reason) + '</span>' : '')
    + badge + (reason || researching ? '' : statusBadge(status)) + '</div><p class="item-task">' + esc(task) + '</p>'
    + (researching ? '<p class="hint">يستمر البحث بعد إغلاق الصفحة، وستظهر النتيجة ومصادرها عند اكتماله.</p>' : score === null && !research ? '<p class="hint">' + esc(clip(current || "لم تُسجل نتيجة تدقيق؛ يمكنك إعادة تدقيق المخرجات المحفوظة.", 220)) + '</p>' : '')
    + '<details class="fold"' + (state.taskOpenId === id ? ' open' : '') + '><summary>' + (research ? "نتيجة البحث والمصادر" : "المخرجات وتدقيق سالم") + '</summary><div class="fold-body">'
    + (output ? '<div class="md">' + md(output) + '</div>' : '') + (research ? researchPanelHtml(meta) : '')
    + (!manual && !researching && audit ? taskAuditHtml(audit) : '') + '<div class="row-actions">' + (output ? copyButton(output, "نسخ المخرجات") : '') + auditAction + follow + '</div>'
    + (canAudit ? '<p class="hint">إعادة التدقيق تراجع المخرجات المحفوظة فقط؛ لا تعيد إنشاء المهمة.</p>' : '') + '</div></details></article>';
}

function taskFeedback(text, kind) {
  contentFeedback(text, kind, "taskFeedback");
  contentFeedback(text, kind, "alertFeedback");
}
async function reauditTask(btn) {
  if (state.taskBusyId) { toast("انتظر اكتمال إعادة التدقيق الحالية.", "warn"); return; }
  const id = btn.dataset.taskReaudit, version = btn.dataset.version || "";
  const row = state.tasks.find(r => r[0] === id) || (state.alerts || []).filter(a => a.kind === "task").map(a => a.row).find(r => r[0] === id);
  if (!row) { taskFeedback("المهمة غير موجودة في البيانات الحالية؛ حدّث اللوحة.", "warn"); return; }
  if (row[2] === "الباحث" && !researchCanAudit(row, state.researchTasks[id])) { taskFeedback("إعادة التدقيق متاحة بعد انتهاء البحث وحفظ نتيجة موثقة بمصادر.", "warn"); return; }
  if (!version) { taskFeedback("نسخة المهمة غير متوفرة؛ حدّث اللوحة قبل إعادة التدقيق.", "warn"); await refresh({ quiet: true }); return; }
  const epoch = state.connectionEpoch, url = state.url, token = state.token;
  state.taskBusyId = id; state.taskOpenId = id;
  const stop = busy(btn, "سالم يعيد التدقيق");
  taskFeedback("يعيد سالم تدقيق المخرجات المحفوظة للمهمة " + id + "؛ ستُحفظ النتيجة السابقة في سجل التدقيق.", "none");
  try {
    const data = await api({ action: "task_reaudit", id, version });
    if (!sameConnection(epoch, url, token)) return;
    if (!Array.isArray(data.task) || data.task[0] !== id || !data.version) throw new Error("عاد رد غير مكتمل بعد إعادة التدقيق؛ حدّث اللوحة للتحقق قبل المحاولة مجدداً.");
    const at = state.tasks.findIndex(r => r[0] === id);
    if (at >= 0) state.tasks[at] = data.task;
    if (state.alerts) state.alerts.forEach(a => { if (a.kind === "task" && a.row[0] === id) a.row = data.task; });
    state.taskVersions[id] = data.version;
    if (data.research) { state.researchRevision++; ingestResearchMetadata({ [id]: data.research }, state.tasks); }
    const score = salemScore(data.task[5]), warnings = (data.warnings || []).map(String);
    const message = score === null ? "حُفظت نتيجة إعادة التدقيق دون درجة رقمية؛ راجع السبب في التدقيق الحالي." : "أُعيد تدقيق المهمة " + id + "؛ التقدير الحالي " + score + "%.";
    if (!await refresh({ quiet: true })) warnings.push("تعذر تحديث المؤشرات والتنبيهات: " + state.error);
    if (!sameConnection(epoch, url, token)) return;
    const kind = score === null || warnings.length ? "warn" : "ok";
    taskFeedback([message, ...warnings.map(w => "• " + w)].join("\n"), kind);
    toast(message, kind);
  } catch (e) {
    if (!sameConnection(epoch, url, token)) return;
    const message = e.message + (e.code === "CONFLICT" ? " لم تُعد كتابة المهمة؛ حدّث بياناتها ثم أعد التدقيق." : "");
    taskFeedback(message, e.code === "CONFLICT" ? "warn" : "bad");
    toast(message, e.code === "CONFLICT" ? "warn" : "bad");
    if (e.code === "CONFLICT") await refresh({ quiet: true });
  } finally {
    stop();
    if (sameConnection(epoch, url, token)) {
      if (state.taskBusyId === id) state.taskBusyId = null;
      if (["tasks", "alerts"].includes(state.view)) renderView();
    }
  }
}

function newsItem(row, reason) {
  // الأعمدة 8–10 (الخدمة، الصلة، الجمهور) و11–13 (رابط الناشر، نص الخبر، عمق المصدر) موجودة في الأخبار الأحدث فقط
  const [date, title, link, nawaf, faisal, lama, salem, service, relevance, audience, pubUrl, article, depthCell] = row;
  const depth = depthCell || (article ? "نص كامل" : "العنوان فقط");
  const isUrl = v => /^https?:\/\//i.test(String(v ?? ""));
  const href = isUrl(pubUrl) ? String(pubUrl) : isUrl(link) ? String(link) : "";
  const tags = [
    service && `<span class="tag" title="الخدمة المرتبطة">${esc(service)}</span>`,
    audience && `<span class="tag" title="الجمهور">${esc(audience === "وهج" ? "وهج · المنازل" : "انطلق · الشركات والجهات")}</span>`,
    relevance !== undefined && relevance !== "" && `<span class="tag" title="صلة الخبر بخدماتنا كما قدّرها نواف">صلة ${esc(relevance)}%</span>`,
    {
      "نص كامل": `<span class="tag" title="بنى الوكلاء على نص الخبر من موقع الناشر">نص الخبر كاملاً</span>`,
      "مقتطف": `<span class="tag" data-tone="warn" title="تعذر جلب النص الكامل، فبنى الوكلاء على مقتطف من الخبر">مقتطف من الخبر</span>`
    }[depth] || `<span class="tag" data-tone="warn" title="تعذر جلب نص الخبر، فبنى الوكلاء على العنوان فقط">العنوان فقط</span>`
  ].filter(Boolean).join("");
  return `<article class="item">
    <div class="item-head"><small class="muted" style="margin-inline-end:auto">${esc(fmtDate(date))}</small>${reason ? `<span class="badge" data-tone="bad">${esc(reason)}</span>` : ""}${scoreBadge(salem)}</div>
    <h3 class="news-title">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(title)}${ICON.ext}</a>` : esc(title)}</h3>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <div class="by">${avatar("نواف", "xs")} ملخص نواف</div>
    <div class="md">${md(nawaf)}</div>
    ${article ? `<details class="fold"><summary>${ICON.news} ${depth === "مقتطف" ? "مقتطف الخبر" : "نص الخبر"} كما قرأه الوكلاء</summary><div class="fold-body"><p class="article-text">${esc(article)}${String(article).length >= 1500 ? "…" : ""}</p></div></details>` : ""}
    <details class="fold"><summary>${avatar("فيصل", "xs")} تحليل فيصل للسوق</summary><div class="fold-body"><div class="md">${md(faisal)}</div></div></details>
    <details class="fold"><summary>${avatar("لمى", "xs")} منشور لمى (LinkedIn)</summary><div class="fold-body"><div class="md">${md(lama)}</div><div class="row-actions">${copyButton(lama, "نسخ المنشور")}</div></div></details>
    <details class="fold"><summary>${avatar("سالم", "xs")} اعتماد سالم</summary><div class="fold-body"><div class="md">${md(salem)}</div></div></details>
  </article>`;
}

function renderTasksView() {
  const el = $("#taskList");
  if (!state.loaded) { el.innerHTML = notReady(); return; }
  if (!state.tasks.length) { el.innerHTML = empty(ICON.clip, "لا توجد مهام بعد", "كلّف أول وكيل وستظهر النتيجة هنا مع تدقيق سالم."); return; }
  const q = state.query.trim().toLowerCase();
  let rows = state.tasks.filter(r =>
    (!state.filterAgent || r[2] === state.filterAgent) &&
    (!q || [r[0], r[3], r[4]].some(v => String(v ?? "").toLowerCase().includes(q))));
  if (state.sort !== "new") {
    const dir = state.sort === "high" ? -1 : 1;
    rows = rows.slice().sort((a, b) => {
      const sa = salemScore(a[5]), sb = salemScore(b[5]);
      if (sa === null) return sb === null ? 0 : 1;
      if (sb === null) return -1;
      return (sa - sb) * dir;
    });
  }
  el.innerHTML = rows.length ? rows.map(r => taskItem(r)).join("") : empty(ICON.search, "لا نتائج مطابقة", "جرّب كلمة بحث أخرى أو اعرض كل الوكلاء.");
}
function renderNewsView() {
  const el = $("#newsList");
  if (!state.loaded) { el.innerHTML = notReady(); return; }
  el.innerHTML = state.news.length ? state.news.map(r => newsItem(r)).join("")
    : empty(ICON.news, "لا توجد أخبار بعد", "اضغط «رصد الأخبار الآن» ليجلب نواف أحدث الأخبار ويمررها على بقية الفريق.");
}
function renderTeamView() {
  const el = $("#teamList");
  if (!state.loaded) { el.innerHTML = notReady(); return; }
  const m = computeMetrics();
  const list = AGENTS.map(a => m.perAgent[a.name]).sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1));
  el.innerHTML = list.map(p => {
    const t = tone(p.avg);
    return `<button type="button" class="team" data-tone="${t}" data-open="tasks" data-filter-agent="${esc(p.a.name)}" data-sort="new">
      ${avatar(p.a.name)}
      <span class="team-main">
        <span class="team-line"><b>${esc(p.a.name)}</b><span class="m-status"><i></i>${TONE_LABEL[t]}</span></span>
        <span class="team-role">${esc(p.a.role)} · ${tasksWord(p.count)}</span>
        <span class="team-desc">${esc(p.a.desc)}</span>
        ${segbar(p.avg, 24)}
      </span>
      ${valueHtml(p.avg, "m-val")}
    </button>`;
  }).join("");
}
function renderAlertsView() {
  const el = $("#alertList");
  if (!state.loaded) { el.innerHTML = notReady(); return; }
  if (!Array.isArray(state.alerts) || !state.stats || state.stats.range !== state.range) { el.innerHTML = empty(ICON.alert, "تحديث التنبيهات مطلوب", state.error || "حدّث البيانات لعرض جميع تنبيهات الفترة المختارة."); return; }
  const items = Array.isArray(state.alerts) ? state.alerts : [];
  el.innerHTML = items.length ? items.map(x => x.kind === "task" ? taskItem(x.row, x.reason) : newsItem(x.row, x.reason)).join("")
    : empty(ICON.check, "لا توجد تنبيهات", "لا توجد تنبيهات ضمن الفترة المختارة.");
}
function renderCompose() {
  $("#pickGrid").innerHTML = AGENTS.map(a => `
    <button type="button" class="pick" aria-pressed="${a.name === state.agent}" data-pick="${esc(a.name)}">
      ${avatar(a.name, "sm")}<span><b>${esc(a.name)}</b><small>${esc(a.role)}</small></span>
    </button>`).join("");
  const a = AGENT_BY_NAME[state.agent];
  $("#agentInfo").innerHTML = `<b>${esc(a.name)} · ${esc(a.role)}</b> — ${esc(a.desc)}`;
  $("#examples").innerHTML = a.examples.map(x => `<button type="button" class="chip-ex" data-example="${esc(x)}">${esc(x)}</button>`).join("");
  $("#taskInput").placeholder = `اكتب المهمة المطلوبة من ${a.name}…`;
  const manual = a.name === "الباحث";
  $("#manualResearch").hidden = !manual;
  $('label[for="taskInput"]').textContent = manual ? "1. اكتب مهمة البحث" : "المهمة";
  $("#taskInput").value = manual ? state.manualDraft.task : store.get(KEYS.draft);
  if (manual) $("#taskInput").setAttribute("maxlength", "6000"); else $("#taskInput").removeAttribute("maxlength");
  $("#manualReport").value = state.manualDraft.report; $("#manualSources").value = state.manualDraft.sourcesText;
  if (!state.sending) $("#sendLabel").textContent = manual ? "حفظ التقرير في المكتب" : "تكليف " + a.name;
  $("#composeHint").textContent = manual ? "تظل المسودة محفوظة في هذا المتصفح. Ctrl + Enter يحفظ التقرير الملصق فقط." : "يدقق سالم المخرجات بعد التنفيذ · Ctrl + Enter للإرسال";
  renderManualSources();
  renderResearchBanner();
}
