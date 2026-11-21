/**
 * Executive.gs — راكان المدير التنفيذي: يعرف ما فعله كل وكيل ويلخّص نتائجهم.
 *
 * - الملخص التنفيذي (يومي / أسبوعي / شهري): من المهام وتدقيق سالم، والأخبار، والمحتوى، وسجل المكتب.
 *   الأرقام يحسبها الخادم من السجلات، وراكان يكتب القراءة والتوصيات ومقترحات التكليف فقط.
 *   يُحفظ في ورقة Reports ويظهر في اللوحة (بطاقة راكان ← «الملخص»).
 * - عند تكليف راكان مباشرة يُضاف للمهمة «مرجع الفريق» (آخر 7 أيام) ليعرف ما فعله كل وكيل.
 * - المواعيد: إدارة المكتب ← الأتمتة والهوية (ملخص يومي وأسبوعي)، ويعمل فقط وراكان في دوامه.
 *
 * يُستدعى من Office.gs: handleOfficeAction_ يمرر إجراءات exec_* إلى handleExecAction_.
 * يعتمد على Code.gs: setupSheets, callGemini, AGENTS_PROMPTS, CONTENT_HEADERS, NEWS_EXTRA_HEADERS, RESEARCH_TASK_STATES, salemScore_, average_,
 *   startOfDay_, toDate_, stripFences_, cell_, json_, appError_, executionDeadline_, PLAN_BUDGET_MS
 * ويعتمد على Office.gs: officeLog_, officeLogRows_, officeBy_, officeAgentCfg_, officeHoursOf_, officeInHours_, officeHoursText_, officeTeamReady_
 */

const EXEC_ = {
  sheet: "Reports",
  headers: ["ID", "التاريخ", "النوع", "من", "إلى", "الملخص", "الأرقام", "بواسطة"],
  kinds: { day: { label: "يومي", days: 1 }, week: { label: "أسبوعي", days: 7 }, month: { label: "شهري", days: 30 } },
  agent: "راكان",
  perAgentTasks: 6, maxDigest: 16000, shown: 12, logScan: 300,
  ownEvents: /^(?:ملخص تنفيذي|تخطي الملخص التنفيذي|تعذر الملخص التنفيذي)/
};

// ---------------- جمع ما حدث في الفترة ----------------
function execRows_(sheet, width, dateCol, start) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const dates = sheet.getRange(2, dateCol + 1, sheet.getLastRow() - 1, 1).getValues().map(r => toDate_(r[0]));
  const idx = dates.map((d, i) => d && d >= start ? i : -1).filter(i => i >= 0);
  if (!idx.length) return [];
  const first = idx[0], last = idx[idx.length - 1];
  const rows = sheet.getRange(first + 2, 1, last - first + 1, width).getValues();
  return idx.map(i => rows[i - first]);
}

const execCut_ = (v, n) => { const s = String(v === undefined || v === null ? "" : v).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

function execCollect_(days) {
  const ss = setupSheets(), tz = Session.getScriptTimeZone(), now = new Date();
  const start = startOfDay_(now, days - 1);
  const fmt = d => Utilities.formatDate(d, tz, "yyyy-MM-dd HH:mm");
  const names = Object.keys(AGENTS_PROMPTS);
  const agents = {};
  names.forEach(n => {
    const c = officeAgentCfg_(n), h = officeHoursOf_(n);
    agents[n] = { tasks: 0, scheduled: 0, scored: 0, avg: null, low: 0, pending: 0, news: 0, content: 0, events: 0,
      active: c.active !== false, onDuty: c.active !== false && officeInHours_(h), hours: officeHoursText_(h), list: [] };
  });

  // المهام: مباشرة ومجدولة، مع تقدير سالم
  const tasks = execRows_(ss.getSheetByName("Tasks"), 7, 1, start).map(r => ({
    id: String(r[0]), at: toDate_(r[1]), agent: String(r[2]), task: String(r[3]), output: String(r[4]),
    score: salemScore_(r[5]), status: String(r[6] || "")
  }));
  tasks.forEach(t => {
    const a = agents[t.agent];
    if (!a) return;
    a.tasks++;
    if (/^\[مهمة مجدولة\]/.test(t.task)) a.scheduled++;
    if (t.score !== null) a.scored++;
    if (t.score !== null && t.score < 70) a.low++;
    if (t.status && t.status !== "مكتمل" && t.status !== RESEARCH_TASK_STATES.imported) a.pending++;
    a.list.push(t);
  });
  names.forEach(n => { agents[n].avg = average_(agents[n].list.map(t => t.score)); });

  // الأخبار: نواف يرصد، فيصل يحلل، لمى تكتب، سالم يدقق
  const news = execRows_(ss.getSheetByName("News"), 7 + NEWS_EXTRA_HEADERS.length, 0, start).map(r => ({
    at: toDate_(r[0]), title: String(r[1] || ""), service: String(r[7] || ""), score: salemScore_(r[6]), post: String(r[5] || "").trim()
  }));
  news.forEach(n => {
    if (agents["نواف"]) agents["نواف"].news++;
    if (agents["فيصل"]) agents["فيصل"].news++;
    if (agents["لمى"] && n.post) agents["لمى"].news++;
    if (agents["سالم"] && n.score !== null) agents["سالم"].news++;
  });

  // المحتوى الذي أُنشئ في الفترة: لمى تكتب، ريم تصمم، زياد ينسخ لـ X، سالم يدقق
  const content = execRows_(ss.getSheetByName("Content"), CONTENT_HEADERS.length, 1, start).map(r => ({
    status: String(r[9] || ""), written: !!String(r[7] || "").trim(), designed: !!String(r[12] || "").trim(), tweet: !!String(r[13] || "").trim(),
    audited: !!String(r[8] || "").trim(), idea: String(r[6] || "")
  }));
  const byStatus = {};
  content.forEach(c => {
    byStatus[c.status || "بلا حالة"] = (byStatus[c.status || "بلا حالة"] || 0) + 1;
    if (c.written && agents["لمى"]) agents["لمى"].content++;
    if (c.designed && agents["ريم"]) agents["ريم"].content++;
    if (c.tweet && agents["زياد"]) agents["زياد"].content++;
    if (c.audited && agents["سالم"]) agents["سالم"].content++;
  });

  // سجل المكتب: إيقاف وتشغيل ودوام وتكليفات وجدولة
  const from = fmt(start);
  // أحداث الملخص نفسه (كتابته أو تخطيه) ليست نشاطاً للفريق
  const events = officeLogRows_(EXEC_.logScan).filter(e => e.at >= from && !EXEC_.ownEvents.test(e.action)).reverse();
  events.forEach(e => String(e.agent).split("، ").forEach(n => { if (agents[n]) agents[n].events++; }));

  const scores = tasks.map(t => t.score).concat(news.map(n => n.score));
  const totals = {
    tasks: tasks.length, scored: tasks.filter(t => t.score !== null).length, avg: average_(tasks.map(t => t.score)),
    low: tasks.filter(t => t.score !== null && t.score < 70).length, pending: tasks.filter(t => t.status && t.status !== "مكتمل" && t.status !== RESEARCH_TASK_STATES.imported).length,
    news: news.length, newsAvg: average_(news.map(n => n.score)), content: content.length, contentByStatus: byStatus,
    events: events.length, overallAvg: average_(scores),
    stopped: names.filter(n => !agents[n].active), working: names.filter(n => agents[n].onDuty)
  };
  return { start: start, now: now, from: Utilities.formatDate(start, tz, "yyyy-MM-dd"), to: fmt(now), agents: agents, tasks: tasks, news: news, content: content, events: events, totals: totals, fmt: fmt };
}

// الأرقام المحفوظة مع الملخص (بلا نصوص طويلة) لتعرضها اللوحة كما هي
function execStats_(c) {
  const agents = {};
  Object.keys(c.agents).forEach(n => {
    const a = c.agents[n];
    agents[n] = { tasks: a.tasks, scheduled: a.scheduled, scored: a.scored, avg: a.avg, low: a.low, pending: a.pending, news: a.news, content: a.content,
      events: a.events, active: a.active, onDuty: a.onDuty, hours: a.hours };
  });
  return { totals: c.totals, agents: agents };
}

function execDigest_(c, kindLabel) {
  const t = c.totals, lines = [];
  const pct = v => v === null ? "بلا تقدير" : v + "%";
  lines.push("الفترة: ملخص " + kindLabel + " من " + c.from + " حتى " + c.to + ".");
  lines.push("الأرقام (محسوبة من السجلات؛ استخدمها كما هي ولا تحسب غيرها):");
  lines.push("- المهام: " + t.tasks + " (مدققة " + t.scored + "، متوسط تقدير سالم " + pct(t.avg) + "، أقل من 70%: " + t.low + "، غير مكتملة: " + t.pending + ")");
  lines.push("- الأخبار المرصودة: " + t.news + " (متوسط تقدير سالم " + pct(t.newsAvg) + ")");
  lines.push("- المحتوى المُنشأ: " + t.content + (t.content ? " (" + Object.keys(t.contentByStatus).map(k => k + " " + t.contentByStatus[k]).join("، ") + ")" : ""));
  lines.push("- أحداث المكتب: " + t.events + (t.stopped.length ? " · موقوفون الآن: " + t.stopped.join("، ") : ""));
  // بدر (Tenders.gs): المنافسات والمواعيد القريبة وجاهزية المكتب
  if (typeof tendersBrief_ === "function") { const tb = tendersBrief_(c.start); if (tb) lines.push(tb); }
  // عقود الصيانة الشمسية (Contracts.gs): الزيارات القريبة والتجديدات
  if (typeof contractsBrief_ === "function") { const cb = contractsBrief_(); if (cb) lines.push(cb); }
  // ردود العملاء على رسائل مازن (قراءة الوارد في Prospects.gs)
  if (typeof prospectsRepliesBrief_ === "function") { const rb = prospectsRepliesBrief_(c.start); if (rb) lines.push(rb); }
  // مسار المبيعات (Pipeline.gs): المفتوحة والمتوقع والربح وخطوات اليوم
  if (typeof pipelineBrief_ === "function") { const pb = pipelineBrief_(); if (pb) lines.push(pb); }
  // عروض تدقيق الطاقة (Audits.gs)
  if (typeof auditsBrief_ === "function") { const ab = auditsBrief_(); if (ab) lines.push(ab); }
  lines.push("");
  lines.push("لكل وكيل:");
  Object.keys(c.agents).forEach(n => {
    const a = c.agents[n];
    const state = !a.active ? "موقوف" : a.onDuty ? "في الدوام" : "خارج الدوام";
    const parts = [];
    if (a.tasks) parts.push("مهام " + a.tasks + (a.scheduled ? " (مجدولة " + a.scheduled + ")" : "") + "، متوسط " + pct(a.avg) + (a.low ? "، أقل من 70%: " + a.low : "") + (a.pending ? "، غير مكتملة: " + a.pending : ""));
    if (a.news) parts.push("شارك في " + a.news + " خبر");
    if (a.content) parts.push("شارك في " + a.content + " منشور");
    if (a.events) parts.push("أحداث " + a.events);
    lines.push("## " + n + " — " + state + " (" + a.hours + "): " + (parts.length ? parts.join(" · ") : "لا نشاط في الفترة"));
    a.list.slice(-EXEC_.perAgentTasks).forEach(x => {
      lines.push("  - [" + x.id + "، " + pct(x.score) + (x.status && x.status !== "مكتمل" ? "، " + x.status : "") + "] المهمة: " + execCut_(x.task, 160) + " ← المخرجات: " + execCut_(x.output, 220));
    });
  });
  if (c.news.length) {
    lines.push("");
    lines.push("الأخبار:");
    c.news.slice(-8).forEach(n => lines.push("- " + execCut_(n.title, 140) + (n.service ? " (" + execCut_(n.service, 50) + ")" : "") + " · " + pct(n.score)));
  }
  if (c.events.length) {
    lines.push("");
    lines.push("سجل المكتب:");
    c.events.slice(-25).forEach(e => lines.push("- " + e.at.slice(5) + " " + e.action + (e.agent ? " · " + e.agent : "") + (e.details ? " — " + execCut_(e.details, 120) : "")));
  }
  const text = lines.join("\n");
  return text.length > EXEC_.maxDigest ? text.slice(0, EXEC_.maxDigest) + "\n…[اختُصر السجل]" : text;
}

// ---------------- كتابة الملخص ----------------
function execParse_(raw, names) {
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  const str = (v, n) => typeof v === "string" ? execCut_(v, n) : "";
  const list = (v, n, max) => Array.isArray(v) ? v.map(x => str(x, n)).filter(Boolean).slice(0, max) : [];
  if (!j || typeof j !== "object" || Array.isArray(j)) return { parsed: false, headline: "ملخص راكان", summary: execCut_(raw, 4000), agents: [], wins: [], issues: [], suggestions: [] };
  return {
    parsed: true,
    headline: str(j.headline, 200) || "ملخص راكان",
    summary: str(j.summary, 1500),
    agents: (Array.isArray(j.agents) ? j.agents : []).filter(a => a && names.indexOf(a.name) >= 0)
      .map(a => ({ name: a.name, did: str(a.did, 400), result: str(a.result, 300), note: str(a.note, 300) })).slice(0, names.length),
    wins: list(j.wins, 300, 5),
    issues: list(j.issues, 300, 5),
    suggestions: (Array.isArray(j.suggestions) ? j.suggestions : []).filter(s => s && names.indexOf(s.agent) >= 0 && s.agent !== "الباحث" && typeof s.task === "string" && s.task.trim())
      .map(s => ({ agent: s.agent, task: execCut_(s.task, 600), why: str(s.why, 300) })).slice(0, 4)
  };
}

function execRun_(kind, by, auto) {
  const k = EXEC_.kinds[kind] ? kind : "day", meta = EXEC_.kinds[k];
  const c = execCollect_(meta.days), t = c.totals;
  const names = Object.keys(AGENTS_PROMPTS);
  let report;
  if (!t.tasks && !t.news && !t.content && !t.events) {
    if (auto) { officeLog_("تخطي الملخص التنفيذي", EXEC_.agent, "لا نشاط في الفترة", "آلي"); return null; }
    report = { parsed: true, headline: "لا نشاط في هذه الفترة", summary: "لم يسجّل الفريق مهاماً أو أخباراً أو محتوى أو أحداثاً في الفترة.", agents: [], wins: [], issues: [], suggestions: [] };
  } else {
    const prompt = "اكتب الملخص التنفيذي للإدارة عن عمل فريق الوكلاء في الفترة أدناه.\n"
      + "قواعد: استخدم الأرقام المذكورة كما هي فقط ولا تحسب أو تخترع أرقاماً أخرى. لا تذكر إلا ما في السجل. كن مباشراً ومختصراً بالعربية.\n"
      + "agents: وكيل لكل من له نشاط أو حالة تستحق الذكر (موقوف، تقدير ضعيف)، بالاسم كما هو. "
      + "suggestions: من 0 إلى 4 تكليفات عملية جاهزة للتنفيذ لوكلاء الفريق (ليس الباحث) تخدم انطلق ووهج، كل منها نص مهمة كامل يفهمه الوكيل وحده.\n"
      + 'أعد JSON فقط: {"headline": "جملة واحدة تلخص الفترة", "summary": "3 إلى 5 جمل", "agents": [{"name": "اسم الوكيل", "did": "ماذا أنجز", "result": "جودة النتيجة وأثرها", "note": "ملاحظة أو توصية قصيرة أو نص فارغ"}], '
      + '"wins": ["أبرز نتيجة"], "issues": ["ما يحتاج انتباه المدير"], "suggestions": [{"agent": "اسم الوكيل", "task": "نص التكليف", "why": "السبب"}]}\n\n'
      + execDigest_(c, meta.label);
    report = execParse_(callGemini(AGENTS_PROMPTS[EXEC_.agent], prompt, true), names);
  }
  const id = "RPT-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  const stats = execStats_(c);
  execSheet_().appendRow([id, c.now, meta.label, c.from, c.to, JSON.stringify(report), JSON.stringify(stats), by || "آلي"].map(cell_));
  officeLog_("ملخص تنفيذي " + meta.label, EXEC_.agent, id + " — " + report.headline, by || "آلي");
  return { id: id, at: c.fmt(c.now), kind: meta.label, from: c.from, to: c.to, report: report, stats: stats, by: by || "آلي" };
}

function execSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(EXEC_.sheet);
  if (!sh) { sh = ss.insertSheet(EXEC_.sheet); sh.appendRow(EXEC_.headers); sh.setFrozenRows(1); }
  return sh;
}

function execReports_(limit) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EXEC_.sheet);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(limit, sh.getLastRow() - 1), tz = Session.getScriptTimeZone();
  const parse = v => { try { return JSON.parse(String(v)); } catch (e) { return null; } };
  return sh.getRange(sh.getLastRow() - n + 1, 1, n, EXEC_.headers.length).getValues().reverse().map(r => ({
    id: String(r[0]), at: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, "yyyy-MM-dd HH:mm") : String(r[1]),
    kind: String(r[2]), from: r[3] instanceof Date ? Utilities.formatDate(r[3], tz, "yyyy-MM-dd") : String(r[3]), to: String(r[4]),
    report: parse(r[5]), stats: parse(r[6]), by: String(r[7])
  })).filter(r => r.report);
}

// ---------------- راكان يعرف ما فعله الفريق عند تكليفه ----------------
// يُضاف لنص مهمة راكان المباشرة والمجدولة (ويراه سالم عند التدقيق)، ولا يُحفظ في سجل المهام
function execTaskContext_(agent, task) {
  // مازن (Prospects.gs) مطلع على مستجدات السوق من أخبار نواف وتحليل فيصل وآخر ملخص لراكان
  if (agent === "مازن" && typeof prospectsMarketBrief_ === "function") {
    const brief = prospectsMarketBrief_();
    return brief ? task + "\n\n---\nمستجدات السوق من فريق المكتب (استخدمها إن كان لها صلة، ولا تنقل أرقاماً غير مكتوبة فيها):\n" + brief : task;
  }
  if (agent !== EXEC_.agent) return task;
  try {
    const c = execCollect_(7), t = c.totals;
    const pct = v => v === null ? "بلا تقدير" : v + "%";
    const lines = ["مهام الأسبوع: " + t.tasks + " (متوسط " + pct(t.avg) + "، أقل من 70%: " + t.low + ") · أخبار: " + t.news + " · محتوى: " + t.content
      + (t.stopped.length ? " · موقوفون: " + t.stopped.join("، ") : "")];
    Object.keys(c.agents).forEach(n => {
      const a = c.agents[n];
      if (!a.tasks && !a.news && !a.content) return;
      const last = a.list.length ? " · آخر مهمة: " + execCut_(a.list[a.list.length - 1].task, 90) : "";
      lines.push("- " + n + ": مهام " + a.tasks + " (" + pct(a.avg) + ")" + (a.news ? "، أخبار " + a.news : "") + (a.content ? "، محتوى " + a.content : "") + last);
    });
    if (typeof tendersBrief_ === "function") { const tb = tendersBrief_(); if (tb) lines.push(tb); }
    if (typeof contractsBrief_ === "function") { const cb = contractsBrief_(); if (cb) lines.push(cb); }
    if (typeof pipelineBrief_ === "function") { const pb = pipelineBrief_(); if (pb) lines.push(pb); }
    if (typeof auditsBrief_ === "function") { const ab = auditsBrief_(); if (ab) lines.push(ab); }
    const latest = execReports_(1)[0];
    if (latest) lines.push("آخر ملخص تنفيذي (" + latest.kind + " " + latest.at + "): " + execCut_(latest.report.headline + " — " + latest.report.summary, 400));
    return task + "\n\n---\nمرجع الفريق (آخر 7 أيام، من سجلات المكتب؛ استخدمه إن كان له صلة بالمهمة ولا تخترع غيره):\n" + lines.join("\n").slice(0, 2500);
  } catch (e) {
    console.log("تعذر تجهيز مرجع الفريق: " + e.message);
    return task;
  }
}

// ---------------- المشغلات والإجراءات ----------------
function officeRunExecDaily() { execAuto_("day"); }
function officeRunExecWeekly() { execAuto_("week"); }
function execAuto_(kind) {
  if (!officeTeamReady_([EXEC_.agent])) return;
  executionDeadline_ = Date.now() + PLAN_BUDGET_MS;
  try { execRun_(kind, "آلي", true); }
  catch (err) { officeLog_("تعذر الملخص التنفيذي", EXEC_.agent, String(err.message || err).slice(0, 300), "آلي"); }
}

function handleExecAction_(data, user) {
  try {
    officeApply_();
    if (data.action === "exec_get") return json_({ status: "success", reports: execReports_(EXEC_.shown) });
    if (data.action === "exec_run") {
      executionDeadline_ = Date.now() + 270000;
      const report = execRun_(data.kind, officeBy_(user), false);
      return json_({ status: "success", report: report, reports: execReports_(EXEC_.shown) });
    }
    throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
