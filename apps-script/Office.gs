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
 */

const OFFICE_ = {
  dayNames: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  maxPrompt: 2500, maxDirections: 1200, maxTask: 1500, maxTasks: 25,
  newsHours: [1, 2, 4, 6, 8, 12], // القيم التي يقبلها everyHours في Apps Script
  handlers: ["runAutomatedNewsPipeline", "generateWeeklyPlan", "officeRunNews", "officeRunWeeklyPlan", "officeRunScheduler", "officeRunSites"],
  weekDays: () => [ScriptApp.WeekDay.SUNDAY, ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY, ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY],
  sitesAgents: { full: ["راكان", "لمى", "سالم", "ريم", "زياد"], ideas: ["راكان"] },
  newsAgents: ["نواف", "فيصل", "لمى", "سالم"],
  weeklyAgents: ["راكان", "لمى", "سالم"]
};

const OFFICE_DEFAULT_CFG_ = {
  directions: "",
  defaultHours: { days: [0, 1, 2, 3, 4], from: "08:00", to: "17:00" },
  enforceManual: false, // false = ساعات العمل تقيّد العمل الآلي فقط، والتكليف من اللوحة متاح دائماً
  automation: { news: { enabled: true, everyHours: 6 }, weekly: { enabled: true, day: 6, hour: 9 }, sites: { enabled: false, day: 0, hour: 10, mode: "full" } },
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
    } catch (err) {
      officeSaveTaskRun_(t.id, { lastSlot: slot, lastRun: new Date().toISOString(), lastError: String(err.message || err).slice(0, 300) });
    }
  });
}

// نفس مسار «تكليف وكيل» في doPost: الوكيل ثم تدقيق سالم ثم الحفظ في Tasks
function officeExecuteTask_(t) {
  const ss = setupSheets();
  if (!AGENTS_PROMPTS[t.agent] || t.agent === "الباحث") throw appError_("VALIDATION_ERROR", "وكيل غير صالح للمهام المجدولة");
  const output = callGemini(AGENTS_PROMPTS[t.agent], t.task);
  let audit, status = "مكتمل";
  try {
    const a = runAudit_({ type: taskAuditType_(t.agent, t.task), agentName: t.agent, task: t.task, output: output });
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
  if (["office_get", "office_save_agent", "office_reset_agent", "office_save_office", "office_save_automation", "office_save_brand",
    "office_task_save", "office_task_delete", "office_task_run", "content_design_update", "office_save_sites", "sites_run", "office_set_active"].indexOf(a) < 0) return null;
  try {
    officeApply_();
    let out;
    if (a === "office_get") out = {};
    else if (a === "office_save_agent") officeSaveAgent_(data);
    else if (a === "office_reset_agent") { if (!AGENTS_PROMPTS[data.name]) throw appError_("VALIDATION_ERROR", "وكيل غير معروف"); officeProps_().deleteProperty("OFFICE_AGENT_" + data.name); }
    else if (a === "office_save_office") officeSaveOffice_(data);
    else if (a === "office_save_automation") { officeSaveAutomation_(data); officeCache_ = null; officeInstallTriggers_(); }
    else if (a === "office_save_brand") officeSaveBrand_(data);
    else if (a === "office_task_save") { officeSaveTask_(data); officeCache_ = null; officeInstallTriggers_(); }
    else if (a === "office_task_delete") { officeProps_().deleteProperty("OFFICE_TASK_" + String(data.id || "")); officeCache_ = null; officeInstallTriggers_(); }
    else if (a === "office_task_run") {
      const t = officeLoad_().tasks.find(x => x.id === data.id);
      if (!t) throw appError_("NOT_FOUND", "المهمة غير موجودة");
      executionDeadline_ = Date.now() + 270000;
      out = { run: officeExecuteTask_(t) };
      officeSaveTaskRun_(t.id, { lastRun: new Date().toISOString(), lastTaskId: out.run.taskId, lastError: "" });
    }
    else if (a === "content_design_update") return json_(Object.assign({ status: "success" }, officeUpdateDesign_(data)));
    else if (a === "office_set_active") officeSetActive_(data);
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
    tasks: o.tasks
  };
}

function officeSaveAgent_(d) {
  if (!AGENTS_PROMPTS[d.name]) throw appError_("VALIDATION_ERROR", "وكيل غير معروف");
  const prompt = officeText_(d.prompt, "تعليمات الوكيل", OFFICE_.maxPrompt);
  const cfg = { prompt: prompt && prompt !== (officeDefaults_ ? officeDefaults_.prompts[d.name] : "") ? prompt : "",
    directions: officeText_(d.directions, "التوجيهات", OFFICE_.maxDirections), active: d.active !== false, hours: officeValidHours_(d.hours, true) };
  officeProps_().setProperty("OFFICE_AGENT_" + d.name, JSON.stringify(cfg));
}

// يداوم أو لا: لوكيل واحد أو عدة وكلاء أو الكل، دون المساس بتعليماتهم وساعاتهم
function officeSetActive_(d) {
  const names = d.all ? Object.keys(AGENTS_PROMPTS) : (Array.isArray(d.names) ? d.names : [d.name]);
  if (!names.length || names.some(n => !AGENTS_PROMPTS[n])) throw appError_("VALIDATION_ERROR", "وكيل غير معروف");
  const updates = {};
  names.forEach(n => { updates["OFFICE_AGENT_" + n] = JSON.stringify(Object.assign(officeAgentCfg_(n), { active: d.active !== false })); });
  officeProps_().setProperties(updates);
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
  cfg.automation = { news: { enabled: !!n.enabled, everyHours: every }, weekly: { enabled: !!w.enabled, day: day, hour: hour },
    sites: { enabled: !!s.enabled, day: Number.isInteger(sDay) ? sDay : 0, hour: Number.isInteger(sHour) ? sHour : 10, mode: s.mode === "ideas" ? "ideas" : "full" } };
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
