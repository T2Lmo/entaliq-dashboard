/**
 * Brain.gs — عقل المكتب ومرجعه: دروس وقواعد وأمثلة يقرؤها كل وكيل قبل كل مهمة ليتحسن مع الوقت.
 *
 * - كل سطر في ورقة Brain: درس أو قاعدة أو تفضيل أو ملاحظة من المدير أو «مثال جيد»، لوكيل معيّن أو «الكل».
 * - المعتمد فقط يُستخدم. ملاحظاتك ودروسك اليدوية تُعتمد مباشرة؛ مقترحات راكان والأمثلة التلقائية تنتظر اعتمادك.
 * - مصادر التعلم: ملاحظاتك عند رفض منشور أو طلب إعادة كتابته، «علّم الوكيل» من سجل المهام،
 *   ومراجعة راكان الأسبوعية لتدقيقات سالم المنخفضة (يقترح دروساً عامة) والمخرجات العالية (أمثلة مرجعية).
 * - الحقن: officeSystemFor_ (Office.gs) يضيف «مرجع الخبرة» لتعليمات الوكيل قبل كل استدعاء.
 * - القياس: متوسط تقدير سالم لكل وكيل في آخر 14 يوماً مقابل الـ14 يوماً التي قبلها.
 *
 * يُستدعى من Office.gs: handleOfficeAction_ يمرر إجراءات brain_* إلى handleBrainAction_.
 * يعتمد على Code.gs: setupSheets, callGemini, AGENTS_PROMPTS, salemScore_, average_, startOfDay_, toDate_, columnValues_,
 *   stripFences_, cell_, json_, appError_, executionDeadline_, PLAN_BUDGET_MS
 * ويعتمد على Office.gs: officeLog_, officeBy_, officeApply_, officeTeamReady_
 */

const BRAIN_ = {
  sheet: "Brain",
  headers: ["ID", "التاريخ", "الوكيل", "النوع", "النص", "المصدر", "الحالة", "بواسطة", "آخر تعديل"],
  all: "الكل", reviewer: "راكان", writer: "لمى",
  types: ["قاعدة", "ملاحظة المدير", "تفضيل", "درس", "مثال جيد"], // بترتيب الأولوية عند الحقن
  statuses: ["معتمد", "مقترح", "موقوف", "مرفوض"],
  maxText: 600, maxExample: 1200, maxInject: 1800, maxPerAgent: 10, exampleInject: 700,
  reviewDays: 14, lowScore: 75, highScore: 90, maxLow: 15, maxProposals: 6, listed: 400
};

let brainCache_ = null;

// ---------------- التخزين ----------------
function brainSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BRAIN_.sheet);
  if (!sh) { sh = ss.insertSheet(BRAIN_.sheet); sh.appendRow(BRAIN_.headers); sh.setFrozenRows(1); }
  return sh;
}

function brainLoad_() {
  if (brainCache_) return brainCache_;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BRAIN_.sheet);
  if (!sh || sh.getLastRow() < 2) return (brainCache_ = []);
  const tz = Session.getScriptTimeZone();
  const at = v => v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm") : String(v || "");
  brainCache_ = sh.getRange(2, 1, sh.getLastRow() - 1, BRAIN_.headers.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[0]), at: at(r[1]), agent: String(r[2]), type: String(r[3]), text: String(r[4]), source: String(r[5]),
    status: String(r[6]), by: String(r[7]), updated: at(r[8])
  })).filter(x => x.id);
  return brainCache_;
}

function brainValidate_(item) {
  const agent = String(item.agent || "");
  if (agent !== BRAIN_.all && (!AGENTS_PROMPTS[agent] || agent === "الباحث")) throw appError_("VALIDATION_ERROR", "اختر وكيلاً أو «الكل»");
  const type = BRAIN_.types.indexOf(item.type) >= 0 ? item.type : "درس";
  if (type === "مثال جيد" && agent === BRAIN_.all) throw appError_("VALIDATION_ERROR", "المثال الجيد لوكيل معيّن");
  const max = type === "مثال جيد" ? BRAIN_.maxExample : BRAIN_.maxText;
  const text = typeof item.text === "string" ? item.text.trim() : "";
  if (text.length < 3) throw appError_("VALIDATION_ERROR", "اكتب نص الدرس");
  if (text.length > max) throw appError_("VALIDATION_ERROR", "النص أطول من " + max + " حرف");
  const status = BRAIN_.statuses.indexOf(item.status) >= 0 ? item.status : "معتمد";
  return { agent: agent, type: type, text: text, status: status, source: String(item.source || "").slice(0, 300) };
}

// يضيف أو يعدّل سطراً. by = من أنشأه (بريدك، «اللوحة»، أو «راكان» للمقترحات)
function brainSave_(item, by) {
  const v = brainValidate_(item), sh = brainSheet_(), now = new Date();
  if (item.id) {
    const cur = brainLoad_().find(x => x.id === item.id);
    if (!cur) throw appError_("NOT_FOUND", "الدرس غير موجود");
    sh.getRange(cur.row, 3, 1, 7).setValues([[v.agent, v.type, v.text, v.source || cur.source, v.status, cur.by, now].map(cell_)]);
    brainCache_ = null;
    return Object.assign({ id: item.id }, v);
  }
  const id = "BRN-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  sh.appendRow([id, now, v.agent, v.type, v.text, v.source, v.status, by || "اللوحة", now].map(cell_));
  brainCache_ = null;
  return Object.assign({ id: id }, v);
}

function brainSetStatus_(id, status) {
  if (BRAIN_.statuses.indexOf(status) < 0) throw appError_("VALIDATION_ERROR", "حالة غير معروفة");
  const cur = brainLoad_().find(x => x.id === id);
  if (!cur) throw appError_("NOT_FOUND", "الدرس غير موجود");
  brainSheet_().getRange(cur.row, 7, 1, 3).setValues([[status, cur.by, new Date()]]);
  brainCache_ = null;
  return cur;
}

function brainDelete_(id) {
  const cur = brainLoad_().find(x => x.id === id);
  if (!cur) throw appError_("NOT_FOUND", "الدرس غير موجود");
  brainSheet_().deleteRow(cur.row);
  brainCache_ = null;
  return cur;
}

// ---------------- الحقن في تعليمات الوكيل ----------------
// تستدعيها officeSystemFor_ قبل كل استدعاء نموذج: الدروس المعتمدة للوكيل و«الكل»، ثم مثال واحد معتمد
function brainFor_(agent) {
  if (!agent || agent === "الباحث") return "";
  const items = brainLoad_().filter(x => x.status === "معتمد" && (x.agent === agent || x.agent === BRAIN_.all));
  if (!items.length) return "";
  const rank = t => { const i = BRAIN_.types.indexOf(t); return i < 0 ? 9 : i; };
  const lessons = items.filter(x => x.type !== "مثال جيد")
    .sort((a, b) => rank(a.type) - rank(b.type) || String(b.updated).localeCompare(String(a.updated)));
  const lines = [];
  let size = 0;
  for (const x of lessons) {
    const line = "- [" + x.type + (x.agent === BRAIN_.all ? "، للجميع" : "") + "] " + x.text.replace(/\s+/g, " ");
    if (lines.length >= BRAIN_.maxPerAgent || size + line.length > BRAIN_.maxInject) break;
    lines.push(line); size += line.length;
  }
  const example = items.filter(x => x.type === "مثال جيد" && x.agent === agent).sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0];
  let out = "";
  if (lines.length) out += "مرجع الخبرة (من عقل المكتب: دروس معتمدة من عملك السابق وملاحظات المدير؛ طبّقها حين تنطبق، ما لم تتعارض مع القواعد العامة أو المهمة الحالية):\n" + lines.join("\n");
  if (example) out += (out ? "\n\n" : "") + "مثال سابق معتمد من عملك (للأسلوب والبنية فقط؛ لا تنقل منه أرقاماً أو أسماء أو حقائق):\n" + example.text.slice(0, BRAIN_.exampleInject);
  return out;
}

// ---------------- مصادر التعلم ----------------
// ملاحظتك على منشور (رفض أو إعادة كتابة) تصير «ملاحظة المدير» معتمدة للمى
function brainNote_(contentId, note, rejected, by) {
  const text = String(note || "").trim();
  if (!text) throw appError_("VALIDATION_ERROR", "الملاحظة فارغة");
  const sheet = setupSheets().getSheetByName("Content");
  const ids = columnValues_(sheet, 1).map(String), i = ids.indexOf(String(contentId || ""));
  if (i < 0) throw appError_("NOT_FOUND", "المنشور غير موجود");
  const r = sheet.getRange(i + 2, 1, 1, 7).getValues()[0];
  if (brainLoad_().some(x => x.source === String(r[0]) && x.text.indexOf(text.slice(0, 120)) >= 0)) return null; // نفس الملاحظة محفوظة
  const idea = String(r[6] || "").replace(/\s+/g, " ").slice(0, 120);
  return brainSave_({ agent: BRAIN_.writer, type: "ملاحظة المدير", status: "معتمد", source: String(r[0]),
    text: (rejected ? "رفض المدير منشوراً" : "طلب المدير إعادة كتابة منشور") + (idea ? " عن «" + idea + "»" + (r[4] ? " (" + r[4] + ")" : "") : "") + ": " + text.slice(0, 450) }, by);
}

function brainTaskRow_(taskId) {
  const sheet = setupSheets().getSheetByName("Tasks");
  const ids = columnValues_(sheet, 1).map(String), i = ids.indexOf(String(taskId || ""));
  if (i < 0) throw appError_("NOT_FOUND", "المهمة غير موجودة");
  const r = sheet.getRange(i + 2, 1, 1, 7).getValues()[0];
  return { id: String(r[0]), agent: String(r[2]), task: String(r[3]), output: String(r[4]), score: salemScore_(r[5]) };
}

// «علّم الوكيل» من سجل المهام: درس معتمد مصدره المهمة
function brainFromTask_(d, by) {
  const t = brainTaskRow_(d.taskId);
  return brainSave_({ agent: d.scope === "all" ? BRAIN_.all : t.agent, type: d.type, text: d.text, status: "معتمد", source: t.id }, by);
}

// «احفظه مثالاً»: المهمة ومخرجاتها مرجعاً معتمداً لنفس الوكيل
function brainExampleText_(t) {
  const out = String(t.output).replace(/\n{3,}/g, "\n\n").trim();
  return ("المهمة: " + String(t.task).replace(/^\[مهمة مجدولة\]\s*/, "").replace(/\s+/g, " ").slice(0, 200) + "\nالمخرجات:\n" + out).slice(0, BRAIN_.maxExample);
}
function brainExample_(taskId, by) {
  const t = brainTaskRow_(taskId);
  if (!AGENTS_PROMPTS[t.agent] || t.agent === "الباحث") throw appError_("VALIDATION_ERROR", "لا تُحفظ أمثلة لهذا الوكيل");
  if (brainLoad_().some(x => x.type === "مثال جيد" && x.source === t.id)) throw appError_("VALIDATION_ERROR", "هذه المهمة محفوظة مثالاً من قبل");
  return brainSave_({ agent: t.agent, type: "مثال جيد", status: "معتمد", source: t.id, text: brainExampleText_(t) }, by);
}

// ---------------- مراجعة راكان: يقترح دروساً من تدقيقات سالم وملاحظاتك ----------------
function brainReview_(by, auto) {
  const ss = setupSheets(), now = new Date(), start = startOfDay_(now, BRAIN_.reviewDays - 1);
  const sheet = ss.getSheetByName("Tasks");
  const dates = columnValues_(sheet, 2).map(toDate_);
  const idx = dates.map((d, i) => d && d >= start ? i : -1).filter(i => i >= 0);
  const rows = idx.length ? sheet.getRange(idx[0] + 2, 1, idx[idx.length - 1] - idx[0] + 1, 7).getValues() : [];
  const tasks = idx.map(i => rows[i - idx[0]]).map(r => ({ id: String(r[0]), agent: String(r[2]), task: String(r[3]), output: String(r[4]), audit: String(r[5] || ""), score: salemScore_(r[5]) }))
    .filter(t => AGENTS_PROMPTS[t.agent] && t.agent !== "الباحث");
  const brain = brainLoad_();
  const known = new Set(brain.map(x => x.source).filter(Boolean));

  // أمثلة مرجعية مقترحة: أعلى مخرج لكل وكيل (90% فأكثر) لم يُحفظ من قبل — بلا استدعاء نموذج
  const best = {};
  tasks.filter(t => t.score !== null && t.score >= BRAIN_.highScore && !known.has(t.id) && t.output.trim())
    .forEach(t => { if (!best[t.agent] || t.score > best[t.agent].score) best[t.agent] = t; });
  let examples = 0;
  Object.keys(best).forEach(a => {
    if (brain.some(x => x.type === "مثال جيد" && x.agent === a && x.status === "مقترح")) return; // مقترح واحد معلّق لكل وكيل
    brainSave_({ agent: a, type: "مثال جيد", status: "مقترح", source: best[a].id, text: brainExampleText_(best[a]) }, BRAIN_.reviewer);
    examples++;
  });

  const low = tasks.filter(t => t.score !== null && t.score < BRAIN_.lowScore).slice(-BRAIN_.maxLow);
  const notes = brain.filter(x => x.type === "ملاحظة المدير" && x.at >= Utilities.formatDate(start, Session.getScriptTimeZone(), "yyyy-MM-dd"));
  let added = 0;
  if (low.length || notes.length) {
    const existing = brain.filter(x => x.type !== "مثال جيد" && x.status !== "موقوف")
      .map(x => "- [" + x.status + "] " + x.agent + ": " + x.text.replace(/\s+/g, " ").slice(0, 160)).slice(-60).join("\n");
    const cut = (s, n) => String(s).replace(/\s+/g, " ").trim().slice(0, n);
    const prompt = "أنت تراجع أداء فريق الوكلاء لتستخرج دروساً تمنع تكرار الأخطاء في المهام القادمة.\n"
      + "من تدقيقات سالم المنخفضة وملاحظات المدير أدناه، اقترح حتى " + BRAIN_.maxProposals + " دروس عامة قابلة للتطبيق في مهام مستقبلية (ليست خاصة بمهمة واحدة)، "
      + "كل درس جملة أو جملتان (أقل من 200 حرف)، موجّه لوكيل بالاسم أو «الكل» إن كان مشتركاً. "
      + "لا تكرر درساً موجوداً (معتمداً أو مقترحاً أو مرفوضاً)، ولا تخترع حقائق أو أرقاماً، ولا تقترح إلا ما تدعمه السجلات أدناه.\n"
      + 'أعد JSON فقط: {"lessons": [{"agent": "اسم الوكيل أو الكل", "type": "قاعدة أو درس أو تفضيل", "text": "نص الدرس", "source": "رقم المهمة أو المنشور", "why": "السبب باختصار"}]}\n\n'
      + "الوكلاء: " + Object.keys(AGENTS_PROMPTS).filter(n => n !== "الباحث").join("، ") + "\n\n"
      + "تدقيقات منخفضة (أقل من " + BRAIN_.lowScore + "%):\n" + (low.map(t => "- [" + t.id + "، " + t.agent + "، " + t.score + "%] المهمة: " + cut(t.task, 150) + "\n  تدقيق سالم: " + cut(t.audit.split("\n\n---")[0], 500)).join("\n") || "لا يوجد")
      + "\n\nملاحظات المدير:\n" + (notes.map(x => "- [" + x.source + "] " + cut(x.text, 300)).join("\n") || "لا يوجد")
      + "\n\nالدروس الحالية:\n" + (existing || "لا يوجد");
    const raw = callGemini(AGENTS_PROMPTS[BRAIN_.reviewer], prompt, true);
    let j = null;
    try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
    const lessons = j && Array.isArray(j.lessons) ? j.lessons : [];
    const seen = new Set(brain.map(x => x.text.replace(/\s+/g, " ").trim()));
    lessons.slice(0, BRAIN_.maxProposals).forEach(l => {
      if (!l || typeof l.text !== "string") return;
      const agent = l.agent === BRAIN_.all || (AGENTS_PROMPTS[l.agent] && l.agent !== "الباحث") ? l.agent : "";
      const text = l.text.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!agent || text.length < 8 || seen.has(text)) return;
      const source = [String(l.source || "").slice(0, 40), String(l.why || "").replace(/\s+/g, " ").slice(0, 200)].filter(Boolean).join(" — ");
      try { brainSave_({ agent: agent, type: ["قاعدة", "درس", "تفضيل"].indexOf(l.type) >= 0 ? l.type : "درس", status: "مقترح", text: text, source: source }, BRAIN_.reviewer); added++; seen.add(text); }
      catch (e) { console.log("تخطي درس غير صالح: " + e.message); }
    });
  }
  if (added || examples || !auto) officeLog_("مراجعة العقل", BRAIN_.reviewer, "دروس مقترحة: " + added + " · أمثلة مقترحة: " + examples + " · تدقيقات منخفضة: " + low.length + " · ملاحظات: " + notes.length, by || "آلي");
  return { added: added, examples: examples, low: low.length, notes: notes.length };
}

// ---------------- أثر العقل: هل تحسّن الوكيل؟ ----------------
function brainImpact_() {
  const sheet = setupSheets().getSheetByName("Tasks"), now = new Date();
  const recent = startOfDay_(now, 13), before = startOfDay_(now, 27);
  const dates = columnValues_(sheet, 2).map(toDate_), agents = columnValues_(sheet, 3), audits = columnValues_(sheet, 6);
  const brain = brainLoad_(), out = {};
  Object.keys(AGENTS_PROMPTS).filter(n => n !== "الباحث").forEach(n => {
    const a = [], b = [];
    dates.forEach((d, i) => {
      if (!d || agents[i] !== n) return;
      const s = salemScore_(audits[i]);
      if (s === null) return;
      if (d >= recent) a.push(s); else if (d >= before) b.push(s);
    });
    const mine = brain.filter(x => x.agent === n);
    out[n] = { lessons: mine.filter(x => x.status === "معتمد" && x.type !== "مثال جيد").length, examples: mine.filter(x => x.status === "معتمد" && x.type === "مثال جيد").length,
      proposed: mine.filter(x => x.status === "مقترح").length, recent: average_(a), previous: average_(b), recentCount: a.length, previousCount: b.length };
  });
  out[BRAIN_.all] = { lessons: brain.filter(x => x.agent === BRAIN_.all && x.status === "معتمد").length, proposed: brain.filter(x => x.agent === BRAIN_.all && x.status === "مقترح").length };
  return out;
}

// ---------------- المشغل والإجراءات ----------------
function officeRunBrainReview() {
  if (!officeTeamReady_([BRAIN_.reviewer])) return;
  executionDeadline_ = Date.now() + PLAN_BUDGET_MS;
  try { brainReview_("آلي", true); }
  catch (err) { officeLog_("تعذرت مراجعة العقل", BRAIN_.reviewer, String(err.message || err).slice(0, 300), "آلي"); }
}

function brainState_() {
  const items = brainLoad_().slice(-BRAIN_.listed).reverse().map(x => ({ id: x.id, at: x.at, agent: x.agent, type: x.type, text: x.text, source: x.source, status: x.status, by: x.by, updated: x.updated }));
  return { status: "success", items: items, impact: brainImpact_() };
}

function handleBrainAction_(data, user) {
  try {
    officeApply_();
    const by = officeBy_(user), a = data.action;
    let extra = {};
    if (a === "brain_get") { /* القراءة فقط */ }
    else if (a === "brain_save") {
      const item = data.item || {}, isNew = !item.id;
      const r = brainSave_(Object.assign({}, item, { status: item.status || "معتمد" }), by);
      officeLog_(isNew ? "إضافة للعقل" : "تعديل في العقل", r.agent, "[" + r.type + "، " + r.status + "] " + r.text.slice(0, 200), by);
    }
    else if (a === "brain_status") {
      const r = brainSetStatus_(String(data.id || ""), data.status);
      officeLog_({ "معتمد": "اعتماد درس", "موقوف": "إيقاف درس", "مرفوض": "رفض درس", "مقترح": "إرجاع درس للمقترحات" }[data.status] || "تعديل في العقل", r.agent, "[" + r.type + "] " + r.text.slice(0, 200), by);
    }
    else if (a === "brain_delete") { const r = brainDelete_(String(data.id || "")); officeLog_("حذف من العقل", r.agent, "[" + r.type + "] " + r.text.slice(0, 200), by); }
    else if (a === "brain_note") { const r = brainNote_(data.contentId, data.note, !!data.rejected, by); extra = { saved: !!r }; if (r) officeLog_("ملاحظة المدير للعقل", r.agent, r.text.slice(0, 200), by); }
    else if (a === "brain_from_task") { const r = brainFromTask_(data, by); officeLog_("تعليم الوكيل", r.agent, "[" + r.type + "] " + r.text.slice(0, 200) + " — " + r.source, by); }
    else if (a === "brain_example") { const r = brainExample_(data.taskId, by); officeLog_("حفظ مثال مرجعي", r.agent, r.source, by); }
    else if (a === "brain_review") { executionDeadline_ = Date.now() + 270000; extra = { review: brainReview_(by, false) }; }
    else throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    return json_(Object.assign(brainState_(), extra));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
