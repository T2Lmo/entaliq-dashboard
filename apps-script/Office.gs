/**
 * Office.gs — إدارة المكتب من اللوحة: تعليمات كل وكيل وتوجيهاته، ساعات العمل، المهام المجدولة،
 * الأتمتة (رصد الأخبار وخطة الأسبوع)، وهوية التصاميم، وتعديل تصميم منشور ونسخة X.
 *
 * التركيب: في doPost بعد authorizeUser_ أضف:
 *     const office = handleOfficeAction_(data, user); if (office) return office;
 * ثم من اللوحة: إدارة المكتب ← الأتمتة ← حفظ (ينشئ المشغلات بدل installNewsTrigger).
 *
 * يعتمد على Code.gs: AGENTS_PROMPTS, BRAND_LOOKS, setupSheets, runAudit_, taskAuditType_, cell_, json_, appError_,
 * runAutomatedNewsPipeline, generateWeeklyPlan, contentRow_, contentItem_, commitContent_, readContentSnapshot_,
 * parseDesign_, brandOf_, xLength_, assertSupportedNumbers_, X_MAX_CHARS, PLAN_BUDGET_MS, executionDeadline_
 *
 * التخزين: Script Properties (OFFICE_CFG، OFFICE_AGENT_<اسم>، OFFICE_TASK_<معرف>).
 * سجل المكتب: ورقة OfficeLog (التاريخ، الإجراء، الوكيل، التفاصيل، بواسطة) — كل إيقاف وتشغيل وتغيير دوام وتكليف وجدولة،
 * ليعرف راكان (المدير التنفيذي) ما حدث في الفريق.
 */

const OFFICE_ = {
  dayNames: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  maxPrompt: 2500, maxDirections: 1200, maxTask: 1500, maxTasks: 25,
  logSheet: "OfficeLog", logHeaders: ["التاريخ", "الإجراء", "الوكيل", "التفاصيل", "بواسطة"], logShown: 40,
  newsHours: [1, 2, 4, 6, 8, 12], // القيم التي يقبلها everyHours في Apps Script
  handlers: ["runAutomatedNewsPipeline", "generateWeeklyPlan", "officeRunNews", "officeRunWeeklyPlan", "officeRunScheduler", "officeRunSites", "officeRunExecDaily", "officeRunExecWeekly", "officeRunBrainReview", "officeRunStudio", "officeRunProspects", "officeRunTenders", "officeRunDigest", "officeRunWatchdog"],
  weekDays: () => [ScriptApp.WeekDay.SUNDAY, ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY, ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY],
  sitesAgents: { full: ["راكان", "لمى", "سالم", "ريم", "زياد"], ideas: ["راكان"] },
  newsAgents: ["نواف", "فيصل", "لمى", "سالم"],
  weeklyAgents: ["راكان", "لمى", "سالم"]
};

const OFFICE_DEFAULT_CFG_ = {
  directions: "",
  defaultHours: { days: [0, 1, 2, 3, 4], from: "08:00", to: "17:00" },
  enforceManual: false, // false = ساعات العمل تقيّد العمل الآلي فقط، والتكليف من اللوحة متاح دائماً
  automation: { news: { enabled: true, everyHours: 6 }, weekly: { enabled: true, day: 6, hour: 9 }, sites: { enabled: false, day: 0, hour: 10, mode: "full" },
    // ملخص راكان: يومي قبل نهاية الدوام (16:00–17:00)، وأسبوعي الخميس 14:00
    exec: { daily: { enabled: true, hour: 16 }, weekly: { enabled: true, day: 4, hour: 14 } },
    // مراجعة العقل (Brain.gs): راكان يقترح دروساً من الأسبوعين الأخيرين، الخميس 15:00
    brain: { enabled: true, day: 4, hour: 15 },
    // استوديو المحتوى (Studio.gs): الوكلاء يكملون الكتابة والتصميم ونسخة X كل ساعة، منشوران في كل دورة
    studio: { enabled: true, everyHours: 1, perRun: 2 },
    // مازن (Prospects.gs): كل ساعة حتى 5 منشآت في الدورة وهدف 20 يومياً؛ بقية الإعدادات الافتراضية في prospectsCfg_
    prospects: { enabled: true, everyHours: 1, perRun: 5, dailyTarget: 20 },
    // بدر (Tenders.gs): رصد يومي للمنافسات والترسيات الساعة 10
    tenders: { enabled: true, hour: 10, perRun: 5, awards: 3 },
    // الملخص الصباحي وتنبيه توقف العامل (Digest.gs): 8:00 الأحد–الخميس؛ التنبيه في 08:00–18:00
    digest: { enabled: true, hour: 8, days: [0, 1, 2, 3, 4], to: "", watchdog: true, watchFrom: "08:00", watchTo: "18:00" } },
  brandLooks: {}
};

let officeApplied_ = false, officeManual_ = false, officeDefaults_ = null, officeCache_ = null;

// ---------------- القراءة والتطبيق ----------------
function officeProps_() { return PropertiesService.getScriptProperties(); }

function officeLoad_() {
  if (officeCache_) return officeCache_;
  const all = officeProps_().getProperties();
  let cfg = {};
  try { cfg = JSON.parse(all.OFFICE_CFG || "{}"); } catch (e) {}
  cfg = Object.assign(JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_)), cfg);
  cfg.automation = Object.assign(JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation)), cfg.automation || {});
  if (!cfg.automation.sites) cfg.automation.sites = JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation.sites));
  if (!cfg.automation.exec) cfg.automation.exec = JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation.exec));
  if (!cfg.automation.brain) cfg.automation.brain = JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation.brain));
  if (!cfg.automation.studio) cfg.automation.studio = JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation.studio));
  if (!cfg.automation.prospects) cfg.automation.prospects = JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation.prospects));
  if (!cfg.automation.tenders) cfg.automation.tenders = JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation.tenders));
  if (!cfg.automation.digest) cfg.automation.digest = JSON.parse(JSON.stringify(OFFICE_DEFAULT_CFG_.automation.digest));
  const agents = {}, tasks = [];
  Object.keys(all).forEach(k => {
    try {
      if (k.indexOf("OFFICE_AGENT_") === 0) agents[k.slice(13)] = JSON.parse(all[k]);
      else if (k.indexOf("OFFICE_TASK_") === 0) tasks.push(JSON.parse(all[k]));
    } catch (e) {}
  });
  tasks.sort((a, b) => String(a.created || "").localeCompare(String(b.created || "")));
  officeCache_ = { cfg: cfg, agents: agents, tasks: tasks };
  return officeCache_;
}

function officeAgentCfg_(name) {
  return Object.assign({ prompt: "", directions: "", active: true, hours: null }, officeLoad_().agents[name] || {});
}

// يطبّق التعديلات على AGENTS_PROMPTS و BRAND_LOOKS مرة واحدة في كل تنفيذ، مع حفظ الأصل للمقارنة والاسترجاع
function officeApply_() {
  if (officeApplied_) return;
  officeApplied_ = true;
  officeDefaults_ = { prompts: Object.assign({}, AGENTS_PROMPTS), looks: Object.assign({}, BRAND_LOOKS) };
  const o = officeLoad_();
  Object.keys(AGENTS_PROMPTS).forEach(name => { const p = officeAgentCfg_(name).prompt; if (p) AGENTS_PROMPTS[name] = p; });
  Object.keys(BRAND_LOOKS).forEach(b => { if (o.cfg.brandLooks[b]) BRAND_LOOKS[b] = o.cfg.brandLooks[b]; });
}

// تستدعيها authorizeUser_: الطلب من اللوحة (يدوي)، وتُطبَّق التعديلات قبل أي استدعاء
function officeMarkManual_() { officeManual_ = true; officeApply_(); }

function officeAgentOf_(systemRole) {
  const s = String(systemRole || "");
  const names = Object.keys(AGENTS_PROMPTS);
  for (const n of names) if (s === AGENTS_PROMPTS[n] || (officeDefaults_ && s === officeDefaults_.prompts[n])) return n;
  const m = s.match(/^أنت\s+([^\s،,]+)/);
  return m && names.indexOf(m[1]) >= 0 ? m[1] : "";
}

// تستدعيها callGemini في ClaudeBridge.gs قبل كل استدعاء نموذج: الحضور والساعات، ثم التعليمات والتوجيهات
function officeSystemFor_(systemRole) {
  officeApply_();
  const o = officeLoad_(), agent = officeAgentOf_(systemRole);
  let system = String(systemRole || "");
  if (agent) {
    const a = officeAgentCfg_(agent);
    if (a.active === false) throw appError_("OFF_DUTY", agent + " موقوف حالياً من إدارة المكتب.");
    if (!officeManual_ || o.cfg.enforceManual) {
      const h = officeHoursOf_(agent);
      if (!officeInHours_(h)) throw appError_("OFF_HOURS", agent + " خارج ساعات العمل (" + officeHoursText_(h) + "). غيّر الساعات من إدارة المكتب.");
    }
    if (officeDefaults_ && system === officeDefaults_.prompts[agent] && a.prompt) system = a.prompt;
  }
  const dirs = [o.cfg.directions, agent ? officeAgentCfg_(agent).directions : ""].map(s => String(s || "").trim()).filter(Boolean);
  if (dirs.length) system += "\n\nتوجيهات المدير (التزم بها ما لم تتعارض مع القواعد العامة):\n" + dirs.join("\n");
  // عقل المكتب (Brain.gs): الدروس المعتمدة لهذا الوكيل وللجميع، ومثال معتمد من عمله
  // أسلوب السوق السعودي للمى وزياد، والتزام ريم بهويتي انطلق ووهج (Studio.gs)
  if (agent && typeof studioStyleFor_ === "function") { const st = studioStyleFor_(agent); if (st) system += "\n\n" + st; }
  if (agent && typeof brainFor_ === "function") {
    try { const b = brainFor_(agent); if (b) system += "\n\n" + b; }
    catch (e) { console.log("تعذر تحميل عقل المكتب: " + e.message); }
  }
  return system;
}

// ---------------- ساعات العمل ----------------
function officeHoursOf_(agent) {
  const h = officeAgentCfg_(agent).hours;
  return h === "always" ? "always" : h && h.days ? h : officeLoad_().cfg.defaultHours;
}

function officeNow_() {
  const tz = Session.getScriptTimeZone(), d = new Date();
  return { day: Number(Utilities.formatDate(d, tz, "u")) % 7, time: Utilities.formatDate(d, tz, "HH:mm"), hour: Number(Utilities.formatDate(d, tz, "H")),
    date: Utilities.formatDate(d, tz, "yyyy-MM-dd"), tz: tz };
}

function officeInHours_(h) {
  if (h === "always") return true;
  const n = officeNow_();
  if (h.from === h.to) return h.days.indexOf(n.day) >= 0;
  if (h.from < h.to) return h.days.indexOf(n.day) >= 0 && n.time >= h.from && n.time < h.to;
  // دوام ليلي يتجاوز منتصف الليل: الجزء الأول في يومه، والثاني في اليوم التالي
  return (h.days.indexOf(n.day) >= 0 && n.time >= h.from) || (h.days.indexOf((n.day + 6) % 7) >= 0 && n.time < h.to);
}

function officeHoursText_(h) {
  if (h === "always") return "دائماً";
  return h.days.map(d => OFFICE_.dayNames[d]).join("، ") + " " + h.from + "–" + h.to;
}

function officeValidHours_(h, allowInherit) {
  if (h === "always") return "always";
  if (h === null || h === undefined || h === "") { if (allowInherit) return null; throw appError_("VALIDATION_ERROR", "ساعات العمل مطلوبة"); }
  const days = Array.isArray(h.days) ? Array.from(new Set(h.days.map(Number))).filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort() : [];
  const time = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ""));
  if (!days.length) throw appError_("VALIDATION_ERROR", "اختر يوماً واحداً على الأقل");
  if (!time(h.from) || !time(h.to)) throw appError_("VALIDATION_ERROR", "الوقت بصيغة HH:MM مثل 08:00");
  return { days: days, from: h.from, to: h.to };
}

function officeText_(v, name, max) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw appError_("VALIDATION_ERROR", name + " يجب أن يكون نصاً");
  const t = v.trim();
  if (t.length > max) throw appError_("VALIDATION_ERROR", name + " أطول من " + max + " حرف");
  return t;
}

// ---------------- سجل المكتب ----------------
// من نفّذ الإجراء: بريد Google إن وُجد، وإلا «اللوحة» (الرمز المشترك)، و«آلي» للمشغلات
function officeBy_(user) { return user && user.email ? user.email : user ? "اللوحة" : "آلي"; }

function officeLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(OFFICE_.logSheet);
  if (!sh) { sh = ss.insertSheet(OFFICE_.logSheet); sh.appendRow(OFFICE_.logHeaders); sh.setFrozenRows(1); }
  return sh;
}

// لا يُفشل الإجراء الأصلي إن تعذر التسجيل
function officeLog_(action, agent, details, by) {
  try {
    officeLogSheet_().appendRow([new Date(), action, agent || "", String(details || "").slice(0, 1000), by || "آلي"].map(cell_));
  } catch (e) { console.log("تعذر تسجيل حدث المكتب: " + e.message); }
}

// أحدث الأحداث أولاً
function officeLogRows_(limit) {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OFFICE_.logSheet);
    if (!sh || sh.getLastRow() < 2) return [];
    const n = Math.min(limit, sh.getLastRow() - 1), tz = Session.getScriptTimeZone();
    return sh.getRange(sh.getLastRow() - n + 1, 1, n, 5).getValues().reverse().map(r => ({
      at: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, "yyyy-MM-dd HH:mm") : String(r[0]),
      action: String(r[1]), agent: String(r[2]), details: String(r[3]), by: String(r[4])
    }));
  } catch (e) { return []; }
}

function officeHoursLabel_(h) {
  return h === null || h === undefined ? "ساعات المكتب (" + officeHoursText_(officeLoad_().cfg.defaultHours) + ")" : officeHoursText_(h);
}

function officeTaskLabel_(t) {
  return t.days.map(d => OFFICE_.dayNames[d]).join("، ") + " " + String(t.hour).padStart(2, "0") + ":00" + (t.enabled ? "" : " (متوقفة)") + " — " + String(t.task).slice(0, 200);
}

// ---------------- المشغلات والأتمتة ----------------
function officeInstallTriggers_() {
  const o = officeLoad_(), a = o.cfg.automation;
  ScriptApp.getProjectTriggers().filter(t => OFFICE_.handlers.indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  if (a.news.enabled) ScriptApp.newTrigger("officeRunNews").timeBased().everyHours(a.news.everyHours).create();
  if (a.weekly.enabled) ScriptApp.newTrigger("officeRunWeeklyPlan").timeBased()
    .onWeekDay(OFFICE_.weekDays()[a.weekly.day])
    .atHour(a.weekly.hour).create();
  if (o.tasks.some(t => t.enabled)) ScriptApp.newTrigger("officeRunScheduler").timeBased().everyHours(1).create();
  if (a.sites && a.sites.enabled) ScriptApp.newTrigger("officeRunSites").timeBased().onWeekDay(OFFICE_.weekDays()[a.sites.day]).atHour(a.sites.hour).create();
  if (typeof officeRunExecDaily === "function" && a.exec) {
    if (a.exec.daily.enabled) ScriptApp.newTrigger("officeRunExecDaily").timeBased().everyDays(1).atHour(a.exec.daily.hour).create();
    if (a.exec.weekly.enabled) ScriptApp.newTrigger("officeRunExecWeekly").timeBased().onWeekDay(OFFICE_.weekDays()[a.exec.weekly.day]).atHour(a.exec.weekly.hour).create();
  }
  if (typeof officeRunBrainReview === "function" && a.brain && a.brain.enabled)
    ScriptApp.newTrigger("officeRunBrainReview").timeBased().onWeekDay(OFFICE_.weekDays()[a.brain.day]).atHour(a.brain.hour).create();
  if (typeof officeRunStudio === "function" && a.studio && a.studio.enabled) ScriptApp.newTrigger("officeRunStudio").timeBased().everyHours(a.studio.everyHours).create();
  if (typeof officeRunProspects === "function" && a.prospects && a.prospects.enabled) ScriptApp.newTrigger("officeRunProspects").timeBased().everyHours(a.prospects.everyHours).create();
  if (typeof officeRunTenders === "function" && a.tenders && a.tenders.enabled) ScriptApp.newTrigger("officeRunTenders").timeBased().everyDays(1).atHour(a.tenders.hour).create();
  if (typeof officeRunDigest === "function" && a.digest && a.digest.enabled) ScriptApp.newTrigger("officeRunDigest").timeBased().everyDays(1).atHour(a.digest.hour).create();
  if (typeof officeRunWatchdog === "function" && a.digest && a.digest.watchdog) ScriptApp.newTrigger("officeRunWatchdog").timeBased().everyHours(1).create();
}

function officeTriggerList_() {
  return ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).filter(h => OFFICE_.handlers.indexOf(h) >= 0);
}

// يعمل الرصد الآلي فقط إن كان فريق الأخبار كله في دوامه وغير موقوف
function officeTeamReady_(team) {
  officeApply_();
  const off = team.filter(n => officeAgentCfg_(n).active === false || !officeInHours_(officeHoursOf_(n)));
  if (off.length) { console.log("تخطي التشغيل الآلي: خارج الدوام أو موقوف — " + off.join("، ")); return false; }
  return true;
}

function officeRunNews() { if (officeTeamReady_(OFFICE_.newsAgents)) runAutomatedNewsPipeline(); }
function officeRunWeeklyPlan() { if (officeTeamReady_(OFFICE_.weeklyAgents)) generateWeeklyPlan(); }
function officeRunSites() {
  const mode = (officeLoad_().cfg.automation.sites || {}).mode === "ideas" ? "ideas" : "full";
  if (!officeTeamReady_(OFFICE_.sitesAgents[mode])) return;
  executionDeadline_ = Date.now() + PLAN_BUDGET_MS;
  console.log(JSON.stringify(sitesRun_(mode)));
}

// كل ساعة: ينفذ المهام المجدولة لهذه الساعة واليوم، مرة واحدة لكل موعد
function officeRunScheduler() {
  executionDeadline_ = Date.now() + PLAN_BUDGET_MS;
  officeApply_();
  const n = officeNow_(), slot = n.date + " " + n.hour;
  officeLoad_().tasks.filter(t => t.enabled && t.days.indexOf(n.day) >= 0 && t.hour === n.hour && t.lastSlot !== slot).forEach(t => {
    try {
      if (Date.now() + 60000 > executionDeadline_) return;
      const r = officeExecuteTask_(t);
      officeSaveTaskRun_(t.id, { lastSlot: slot, lastRun: new Date().toISOString(), lastTaskId: r.taskId, lastError: "" });
      officeLog_("تنفيذ مهمة مجدولة", t.agent, r.taskId + " — " + String(t.task).slice(0, 200), "آلي");
    } catch (err) {
      officeSaveTaskRun_(t.id, { lastSlot: slot, lastRun: new Date().toISOString(), lastError: String(err.message || err).slice(0, 300) });
      officeLog_("تعذر تنفيذ مهمة مجدولة", t.agent, String(err.message || err).slice(0, 300), "آلي");
    }
  });
}

// نفس مسار «تكليف وكيل» في doPost: الوكيل ثم تدقيق سالم ثم الحفظ في Tasks
function officeExecuteTask_(t) {
  const ss = setupSheets();
  if (!AGENTS_PROMPTS[t.agent] || t.agent === "الباحث") throw appError_("VALIDATION_ERROR", "وكيل غير صالح للمهام المجدولة");
  // راكان يرى «مرجع الفريق» مع مهمته (Executive.gs)، ويراه سالم عند التدقيق؛ سجل المهام يحفظ النص الأصلي
  const input = typeof execTaskContext_ === "function" ? execTaskContext_(t.agent, t.task) : t.task;
  const output = callGemini(AGENTS_PROMPTS[t.agent], input);
  let audit, status = "مكتمل";
  try {
    const a = runAudit_({ type: taskAuditType_(t.agent, t.task), agentName: t.agent, task: input, output: output });
    audit = a.text; if (a.score === null) status = "بانتظار التدقيق";
  } catch (err) { audit = "تعذر التدقيق: " + err.message; status = "بانتظار التدقيق"; }
  const taskId = "TSK-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  ss.getSheetByName("Tasks").appendRow([taskId, new Date(), t.agent, "[مهمة مجدولة] " + t.task, output, audit, status].map(cell_));
  return { taskId: taskId, agent: t.agent, output: output, audit: audit };
}

function officeSaveTaskRun_(id, patch) {
  const key = "OFFICE_TASK_" + id, raw = officeProps_().getProperty(key);
  if (!raw) return;
  officeProps_().setProperty(key, JSON.stringify(Object.assign(JSON.parse(raw), patch)));
}

// ---------------- إجراءات اللوحة ----------------
function handleOfficeAction_(data, user) {
  const a = data && data.action;
  if (typeof a === "string" && a.indexOf("exec_") === 0 && typeof handleExecAction_ === "function") return handleExecAction_(data, user);
  if (typeof a === "string" && a.indexOf("brain_") === 0 && typeof handleBrainAction_ === "function") return handleBrainAction_(data, user);
  if (typeof a === "string" && a.indexOf("studio_") === 0 && typeof handleStudioAction_ === "function") return handleStudioAction_(data, user);
  if (typeof a === "string" && a.indexOf("prospects_") === 0 && typeof handleProspectsAction_ === "function") return handleProspectsAction_(data, user);
  if (typeof a === "string" && a.indexOf("tenders_") === 0 && typeof handleTendersAction_ === "function") return handleTendersAction_(data, user);
  if (typeof a === "string" && a.indexOf("contracts_") === 0 && typeof handleContractsAction_ === "function") return handleContractsAction_(data, user);
  if (typeof a === "string" && a.indexOf("digest_") === 0 && typeof handleDigestAction_ === "function") return handleDigestAction_(data, user);
  if (typeof a === "string" && a.indexOf("voice_") === 0 && typeof handleVoiceAction_ === "function") return handleVoiceAction_(data, user);
  if (typeof a === "string" && a.indexOf("health_") === 0 && typeof handleHealthAction_ === "function") return handleHealthAction_(data, user);
  if (["office_get", "office_save_agent", "office_reset_agent", "office_save_office", "office_save_automation", "office_save_brand",
    "office_task_save", "office_task_delete", "office_task_run", "content_design_update", "office_save_sites", "sites_run", "office_set_active",
    "office_set_hours"].indexOf(a) < 0) return null;
  try {
    officeApply_();
    const by = officeBy_(user);
    let out;
    if (a === "office_get") out = {};
    else if (a === "office_save_agent") { const changed = officeSaveAgent_(data); if (changed) officeLog_("تعديل إعدادات الوكيل", data.name, changed, by); }
    else if (a === "office_reset_agent") {
      if (!AGENTS_PROMPTS[data.name]) throw appError_("VALIDATION_ERROR", "وكيل غير معروف");
      officeProps_().deleteProperty("OFFICE_AGENT_" + data.name);
      officeLog_("إرجاع الوكيل للأصل", data.name, "التعليمات والتوجيهات والدوام والحضور", by);
    }
    else if (a === "office_save_office") { officeSaveOffice_(data); officeLog_("تعديل توجيهات المكتب وساعاته", "", "ساعات المكتب: " + officeHoursText_(officeLoad_().cfg.defaultHours), by); }
    else if (a === "office_save_automation") { officeSaveAutomation_(data); officeCache_ = null; officeInstallTriggers_(); officeLog_("تعديل الأتمتة", "", "", by); }
    else if (a === "office_save_brand") { officeSaveBrand_(data); officeLog_("تعديل هوية العلامة", "", data.brand, by); }
    else if (a === "office_task_save") {
      const r = officeSaveTask_(data); officeCache_ = null; officeInstallTriggers_();
      officeLog_(r.created ? "جدولة مهمة" : "تعديل مهمة مجدولة", r.task.agent, officeTaskLabel_(r.task), by);
    }
    else if (a === "office_task_delete") {
      const t = officeLoad_().tasks.find(x => x.id === String(data.id || ""));
      officeProps_().deleteProperty("OFFICE_TASK_" + String(data.id || "")); officeCache_ = null; officeInstallTriggers_();
      if (t) officeLog_("حذف مهمة مجدولة", t.agent, String(t.task).slice(0, 200), by);
    }
    else if (a === "office_task_run") {
      const t = officeLoad_().tasks.find(x => x.id === data.id);
      if (!t) throw appError_("NOT_FOUND", "المهمة غير موجودة");
      executionDeadline_ = Date.now() + 270000;
      out = { run: officeExecuteTask_(t) };
      officeSaveTaskRun_(t.id, { lastRun: new Date().toISOString(), lastTaskId: out.run.taskId, lastError: "" });
      officeLog_("تشغيل مهمة مجدولة الآن", t.agent, out.run.taskId + " — " + String(t.task).slice(0, 200), by);
    }
    else if (a === "content_design_update") return json_(Object.assign({ status: "success" }, officeUpdateDesign_(data)));
    else if (a === "office_set_active") {
      const names = officeSetActive_(data), on = data.active !== false;
      officeLog_(on ? "تشغيل" : "إيقاف", data.all ? "الكل" : names.join("، "), on ? "يداوم ويقبل المهام" : "لا ينفذ مهاماً يدوية ولا آلية", by);
    }
    else if (a === "office_set_hours") { const h = officeSetHours_(data); officeLog_("تغيير الدوام", data.name, officeHoursLabel_(h), by); }
    else if (a === "office_save_sites") { const cfg = officeLoad_().cfg; cfg.sites = sitesValidate_(data.sites); officeProps_().setProperty("OFFICE_CFG", JSON.stringify(cfg)); }
    else if (a === "sites_run") {
      executionDeadline_ = Date.now() + 270000;
      return json_(Object.assign({ status: "success" }, sitesRun_(data.mode === "ideas" ? "ideas" : "full")));
    }
    officeCache_ = null;
    return json_(Object.assign({ status: "success" }, out || {}, officeState_()));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}

function officeState_() {
  officeApply_();
  const o = officeLoad_(), n = officeNow_();
  return {
    office: { directions: o.cfg.directions, defaultHours: o.cfg.defaultHours, enforceManual: !!o.cfg.enforceManual, automation: o.cfg.automation,
      brandLooks: Object.keys(officeDefaults_.looks).map(b => ({ brand: b, look: o.cfg.brandLooks[b] || "", defaultLook: officeDefaults_.looks[b] })),
      timezone: n.tz, now: n.date + " " + n.time, today: n.day, triggers: officeTriggerList_(),
      sites: typeof sitesList_ === "function" ? sitesList_() : [] },
    agents: Object.keys(officeDefaults_.prompts).map(name => {
      const c = officeAgentCfg_(name), h = officeHoursOf_(name);
      return { name: name, defaultPrompt: officeDefaults_.prompts[name], prompt: c.prompt, directions: c.directions, active: c.active !== false,
        hours: c.hours, hoursText: officeHoursText_(h), onDuty: c.active !== false && officeInHours_(h) };
    }),
    tasks: o.tasks,
    log: officeLogRows_(OFFICE_.logShown)
  };
}

// يعيد وصف ما تغيّر (للسجل)، أو "" إن لم يتغير شيء
function officeSaveAgent_(d) {
  if (!AGENTS_PROMPTS[d.name]) throw appError_("VALIDATION_ERROR", "وكيل غير معروف");
  const before = officeAgentCfg_(d.name);
  const prompt = officeText_(d.prompt, "تعليمات الوكيل", OFFICE_.maxPrompt);
  const cfg = { prompt: prompt && prompt !== (officeDefaults_ ? officeDefaults_.prompts[d.name] : "") ? prompt : "",
    directions: officeText_(d.directions, "التوجيهات", OFFICE_.maxDirections), active: d.active !== false, hours: officeValidHours_(d.hours, true) };
  officeProps_().setProperty("OFFICE_AGENT_" + d.name, JSON.stringify(cfg));
  const changes = [];
  if (before.active !== cfg.active) changes.push(cfg.active ? "تشغيل" : "إيقاف");
  if (JSON.stringify(before.hours || null) !== JSON.stringify(cfg.hours)) changes.push("الدوام: " + officeHoursLabel_(cfg.hours));
  if ((before.prompt || "") !== cfg.prompt) changes.push("تعليمات الدور");
  if ((before.directions || "") !== cfg.directions) changes.push("التوجيهات" + (cfg.directions ? ": " + cfg.directions.slice(0, 200) : " (حُذفت)"));
  return changes.join(" · ");
}

// يداوم أو لا: لوكيل واحد أو عدة وكلاء أو الكل، دون المساس بتعليماتهم وساعاتهم. يعيد الأسماء
function officeSetActive_(d) {
  const names = d.all ? Object.keys(AGENTS_PROMPTS) : (Array.isArray(d.names) ? d.names : [d.name]);
  if (!names.length || names.some(n => !AGENTS_PROMPTS[n])) throw appError_("VALIDATION_ERROR", "وكيل غير معروف");
  const updates = {};
  names.forEach(n => { updates["OFFICE_AGENT_" + n] = JSON.stringify(Object.assign(officeAgentCfg_(n), { active: d.active !== false })); });
  officeProps_().setProperties(updates);
  return names;
}

// ساعات وكيل واحد من بطاقته في اللوحة، دون المساس بتعليماته وتوجيهاته. null = ساعات المكتب
function officeSetHours_(d) {
  if (!AGENTS_PROMPTS[d.name] || d.name === "الباحث") throw appError_("VALIDATION_ERROR", "وكيل غير معروف");
  const hours = officeValidHours_(d.hours, true);
  officeProps_().setProperty("OFFICE_AGENT_" + d.name, JSON.stringify(Object.assign(officeAgentCfg_(d.name), { hours: hours })));
  return hours;
}

function officeSaveOffice_(d) {
  const cfg = officeLoad_().cfg;
  cfg.directions = officeText_(d.directions, "توجيهات المكتب", OFFICE_.maxDirections);
  cfg.defaultHours = officeValidHours_(d.defaultHours, false);
  cfg.enforceManual = !!d.enforceManual;
  officeProps_().setProperty("OFFICE_CFG", JSON.stringify(cfg));
}

function officeSaveAutomation_(d) {
  const cfg = officeLoad_().cfg, n = d.news || {}, w = d.weekly || {};
  const every = Number(n.everyHours), day = Number(w.day), hour = Number(w.hour);
  if (OFFICE_.newsHours.indexOf(every) < 0) throw appError_("VALIDATION_ERROR", "تكرار الرصد يجب أن يكون " + OFFICE_.newsHours.join(" أو ") + " ساعات");
  if (!(Number.isInteger(day) && day >= 0 && day <= 6 && Number.isInteger(hour) && hour >= 0 && hour <= 23)) throw appError_("VALIDATION_ERROR", "يوم أو ساعة خطة الأسبوع غير صالحة");
  const s = d.sites || {}, sDay = Number(s.day), sHour = Number(s.hour);
  if (s.enabled && !(Number.isInteger(sDay) && sDay >= 0 && sDay <= 6 && Number.isInteger(sHour) && sHour >= 0 && sHour <= 23)) throw appError_("VALIDATION_ERROR", "يوم أو ساعة أفكار المواقع غير صالحة");
  // الملخص التنفيذي (Executive.gs): يومي بساعة، وأسبوعي بيوم وساعة. بدون قيم من اللوحة يبقى كما هو
  const prev = cfg.automation.exec || OFFICE_DEFAULT_CFG_.automation.exec, x = d.exec || prev;
  const xd = x.daily || {}, xw = x.weekly || {}, okHour = v => Number.isInteger(v) && v >= 0 && v <= 23, okDay = v => Number.isInteger(v) && v >= 0 && v <= 6;
  const exec = { daily: { enabled: !!xd.enabled, hour: Number(xd.hour) }, weekly: { enabled: !!xw.enabled, day: Number(xw.day), hour: Number(xw.hour) } };
  if (!okHour(exec.daily.hour) || !okHour(exec.weekly.hour) || !okDay(exec.weekly.day)) throw appError_("VALIDATION_ERROR", "يوم أو ساعة الملخص التنفيذي غير صالحة");
  // مراجعة العقل (Brain.gs): أسبوعية بيوم وساعة
  const bx = d.brain || cfg.automation.brain || OFFICE_DEFAULT_CFG_.automation.brain;
  const brain = { enabled: !!bx.enabled, day: Number(bx.day), hour: Number(bx.hour) };
  if (!okHour(brain.hour) || !okDay(brain.day)) throw appError_("VALIDATION_ERROR", "يوم أو ساعة مراجعة العقل غير صالحة");
  // استوديو المحتوى (Studio.gs): كل 1/2/4/6 ساعات، 1–4 منشورات في الدورة. إعدادات مازن تُحفظ من نافذته وتبقى كما هي هنا
  const sx = d.studio || cfg.automation.studio || OFFICE_DEFAULT_CFG_.automation.studio;
  const studio = { enabled: !!sx.enabled, everyHours: Number(sx.everyHours), perRun: Number(sx.perRun) };
  if ([1, 2, 4, 6].indexOf(studio.everyHours) < 0 || !(studio.perRun >= 1 && studio.perRun <= 4)) throw appError_("VALIDATION_ERROR", "تكرار الاستوديو 1 أو 2 أو 4 أو 6 ساعات، ومن 1 إلى 4 منشورات");
  // الملخص الصباحي وتنبيه العامل (Digest.gs)
  const gx = d.digest || cfg.automation.digest || OFFICE_DEFAULT_CFG_.automation.digest, tm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ""));
  const digest = { enabled: !!gx.enabled, hour: Number(gx.hour), days: Array.isArray(gx.days) ? Array.from(new Set(gx.days.map(Number))).filter(okDay).sort() : [0, 1, 2, 3, 4],
    to: String(gx.to || "").trim().slice(0, 120), watchdog: gx.watchdog !== false, watchFrom: String(gx.watchFrom || "08:00"), watchTo: String(gx.watchTo || "18:00") };
  if (!okHour(digest.hour) || !digest.days.length) throw appError_("VALIDATION_ERROR", "ساعة الملخص الصباحي وأيامه غير صالحة");
  if (digest.to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digest.to)) throw appError_("VALIDATION_ERROR", "بريد مستلم الملخص غير صالح");
  if (!tm(digest.watchFrom) || !tm(digest.watchTo) || digest.watchFrom >= digest.watchTo) throw appError_("VALIDATION_ERROR", "نافذة تنبيه العامل غير صالحة");
  cfg.automation = { news: { enabled: !!n.enabled, everyHours: every }, weekly: { enabled: !!w.enabled, day: day, hour: hour },
    sites: { enabled: !!s.enabled, day: Number.isInteger(sDay) ? sDay : 0, hour: Number.isInteger(sHour) ? sHour : 10, mode: s.mode === "ideas" ? "ideas" : "full" },
    exec: exec, brain: brain, studio: studio, prospects: cfg.automation.prospects || OFFICE_DEFAULT_CFG_.automation.prospects,
    tenders: cfg.automation.tenders || OFFICE_DEFAULT_CFG_.automation.tenders, digest: digest };
  officeProps_().setProperty("OFFICE_CFG", JSON.stringify(cfg));
}

function officeSaveBrand_(d) {
  officeApply_();
  if (!officeDefaults_.looks[d.brand]) throw appError_("VALIDATION_ERROR", "علامة غير معروفة");
  const cfg = officeLoad_().cfg, look = officeText_(d.look, "وصف الهوية", 600);
  if (look && look !== officeDefaults_.looks[d.brand]) cfg.brandLooks[d.brand] = look; else delete cfg.brandLooks[d.brand];
  officeProps_().setProperty("OFFICE_CFG", JSON.stringify(cfg));
}

function officeSaveTask_(d) {
  const t = d.task || {};
  if (!AGENTS_PROMPTS[t.agent] || t.agent === "الباحث") throw appError_("VALIDATION_ERROR", "اختر وكيلاً (الباحث يعمل يدوياً فقط)");
  const text = officeText_(t.task, "نص المهمة", OFFICE_.maxTask);
  if (!text) throw appError_("VALIDATION_ERROR", "اكتب نص المهمة");
  const hour = Number(t.hour);
  if (!(Number.isInteger(hour) && hour >= 0 && hour <= 23)) throw appError_("VALIDATION_ERROR", "ساعة التنفيذ من 0 إلى 23");
  const days = officeValidHours_({ days: t.days, from: "00:00", to: "00:00" }, false).days;
  const existing = t.id ? officeLoad_().tasks.find(x => x.id === t.id) : null;
  if (t.id && !existing) throw appError_("NOT_FOUND", "المهمة غير موجودة");
  if (!existing && officeLoad_().tasks.length >= OFFICE_.maxTasks) throw appError_("VALIDATION_ERROR", "الحد " + OFFICE_.maxTasks + " مهمة مجدولة");
  const id = existing ? existing.id : "OT" + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
  const rec = Object.assign(existing || { id: id, created: new Date().toISOString() }, { agent: t.agent, task: text, days: days, hour: hour, enabled: t.enabled !== false });
  officeProps_().setProperty("OFFICE_TASK_" + id, JSON.stringify(rec));
  return { task: rec, created: !existing };
}

// تعديل نصوص تصميم ريم ونسخة زياد يدوياً، بنفس فحوص Code.gs (الأطوال والأرقام الموجودة في المنشور)
function officeUpdateDesign_(data) {
  const ss = setupSheets(), sheet = ss.getSheetByName("Content");
  const r = readContentSnapshot_(sheet, data);
  const text = String(r[7] || "").trim();
  if (!text) throw appError_("VALIDATION_ERROR", "اكتب المنشور أولاً");
  const brands = Object.keys(BRAND_LOOKS);
  const brand = brands.indexOf(data.brand) >= 0 ? data.brand : brandOf_(r[4], r[5]);
  const warnings = [];
  const design = parseDesign_(JSON.stringify(data.design || {}), brand, text, warnings);
  let tweet = String(r[13] || "");
  if (data.tweet !== undefined) {
    tweet = officeText_(data.tweet, "نسخة X", 1000);
    if (tweet && xLength_(tweet) > X_MAX_CHARS) throw appError_("VALIDATION_ERROR", "التغريدة أطول من " + X_MAX_CHARS + " حرفاً");
    if (tweet) assertSupportedNumbers_(tweet, text, "تغريدة X");
  }
  const result = commitContent_(sheet, data, current => { current[12] = JSON.stringify(design); current[13] = tweet; return current; });
  result.warnings = warnings;
  return result;
}
