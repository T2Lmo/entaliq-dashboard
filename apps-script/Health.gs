/**
 * Health.gs — صحة المكتب: فحص واحد يقول لك ما يعمل وما تعطّل وكيف تصلحه.
 *
 * يفحص: نسخة الخادم ووحداته، والإعدادات الأساسية (رمز الدخول، رمز العامل، محرك الذكاء)، وإذن Google للبريد وحصته،
 * والمشغلات الآلية مقابل إعدادات الأتمتة، والعامل على جهازك (Claude، إرسال البريد، قراءة الوارد)، والطلبات المنتظرة،
 * ورسائل تعذر إرسالها، وأخطاء الوكلاء في آخر 7 أيام، والوكلاء الموقوفين وتقديراتهم، والملخص الصباحي، وربط LinkedIn وX،
 * وحجم البيانات. لا يرسل شيئاً ولا يغيّر شيئاً؛ الإصلاح الوحيد بزر هو إعادة تثبيت المشغلات.
 *
 * يعتمد على Office.gs ويستخدم إن وُجد: Executive, Brain, Studio, Prospects, Tenders, Contracts, Digest, Voice, ClaudeBridge, Social, Auth
 */

const HEALTH_ = {
  // رقم نسخة الخادم: تزيد مع كل تحديث للخادم، وتقارنه اللوحة بالرقم الذي تتوقعه (SERVER_VERSION في config.js)
  server: 1,
  days: 7, cellLimit: 10000000, logScan: 400,
  // كل وحدة وطريقة التأكد من وجودها في الخادم المنشور
  modules: () => [["الأتمتة وإدارة المكتب", typeof handleOfficeAction_], ["ملخص راكان", typeof handleExecAction_], ["العقل والمرجع", typeof handleBrainAction_],
    ["استوديو المحتوى", typeof handleStudioAction_], ["مازن", typeof handleProspectsAction_], ["بدر", typeof handleTendersAction_], ["عقود الصيانة", typeof handleContractsAction_],
    ["الملخص الصباحي", typeof handleDigestAction_], ["راكان بالصوت", typeof handleVoiceAction_], ["عامل Claude", typeof handleClaudeWorkerAction_],
    ["بريد مازن والوارد", typeof handleMailWorkerAction_], ["LinkedIn وX", typeof handleSocialAction_]]
};

// المشغلات التي يجب أن توجد حسب إعدادات الأتمتة (نفس شروط officeInstallTriggers_)
function healthExpectedTriggers_() {
  const o = officeLoad_(), a = o.cfg.automation, out = [];
  if (a.news.enabled) out.push("officeRunNews");
  if (a.weekly.enabled) out.push("officeRunWeeklyPlan");
  if (o.tasks.some(t => t.enabled)) out.push("officeRunScheduler");
  if (a.sites && a.sites.enabled) out.push("officeRunSites");
  if (typeof officeRunExecDaily === "function" && a.exec) { if (a.exec.daily.enabled) out.push("officeRunExecDaily"); if (a.exec.weekly.enabled) out.push("officeRunExecWeekly"); }
  if (typeof officeRunBrainReview === "function" && a.brain && a.brain.enabled) out.push("officeRunBrainReview");
  if (typeof officeRunStudio === "function" && a.studio && a.studio.enabled) out.push("officeRunStudio");
  if (typeof officeRunProspects === "function" && a.prospects && a.prospects.enabled) out.push("officeRunProspects");
  if (typeof officeRunTenders === "function" && a.tenders && a.tenders.enabled) out.push("officeRunTenders");
  if (typeof officeRunDigest === "function" && a.digest && a.digest.enabled) out.push("officeRunDigest");
  if (typeof officeRunWatchdog === "function" && a.digest && a.digest.watchdog) out.push("officeRunWatchdog");
  return out;
}

const HEALTH_LABELS_ = {
  officeRunNews: "رصد الأخبار", officeRunWeeklyPlan: "خطة الأسبوع", officeRunScheduler: "المهام المجدولة", officeRunSites: "أفكار المواقع",
  officeRunExecDaily: "ملخص راكان اليومي", officeRunExecWeekly: "ملخص راكان الأسبوعي", officeRunBrainReview: "مراجعة العقل", officeRunStudio: "استوديو المحتوى",
  officeRunProspects: "دورة مازن", officeRunTenders: "رصد بدر", officeRunDigest: "الملخص الصباحي", officeRunWatchdog: "تنبيه توقف العامل"
};

function healthCheck_() {
  const props = PropertiesService.getScriptProperties(), tz = Session.getScriptTimeZone(), now = Date.now();
  const fmt = ms => Utilities.formatDate(new Date(ms), tz, "yyyy-MM-dd HH:mm");
  const since = now - HEALTH_.days * 86400000, checks = [];
  const add = (area, title, status, detail, fix, action) => checks.push({ area: area, title: title, status: status, detail: detail || "", fix: fix || "", action: action || "" });
  const safe = (area, title, fn) => { try { fn(); } catch (e) { add(area, title, "warn", "تعذر الفحص: " + String(e.message || e).slice(0, 200)); } };

  // ---------- الخادم ----------
  safe("الخادم", "وحدات الخادم", () => {
    const missing = HEALTH_.modules().filter(([, t]) => t !== "function").map(([label]) => label);
    add("الخادم", "وحدات الخادم", missing.length ? "bad" : "ok", missing.length ? "ناقص: " + missing.join("، ") : "كل الوحدات موجودة (نسخة الخادم " + HEALTH_.server + ")",
      missing.length ? "الصق كود الخادم الكامل الجديد ثم انشر نسخة جديدة (Deploy ← Manage deployments ← Edit ← New version)." : "");
  });
  safe("الخادم", "الدخول إلى اللوحة", () => {
    const token = !!props.getProperty("ACCESS_TOKEN"), emails = !!props.getProperty("ALLOWED_EMAILS");
    add("الخادم", "الدخول إلى اللوحة", token || emails ? "ok" : "bad", (token ? "رمز ACCESS_TOKEN مضبوط" : "بلا رمز مشترك") + (emails ? "، ودخول Google بالبريدات المسموحة" : ""),
      token || emails ? "" : "أضف ACCESS_TOKEN في Script Properties.");
  });
  safe("الخادم", "محرك الذكاء", () => {
    const claude = typeof claudeEnabled_ === "function" && claudeEnabled_();
    if (claude) {
      const worker = !!props.getProperty("WORKER_TOKEN"), fallback = typeof claudeFallbackAllowed_ === "function" && claudeFallbackAllowed_();
      add("الخادم", "محرك الذكاء", worker ? "ok" : "bad", "الوكلاء يعملون بـ Claude عبر العامل على جهازك" + (fallback ? "، ويرجعون إلى Gemini إن توقف" : ""),
        worker ? "" : "أضف WORKER_TOKEN في Script Properties وفي worker/.env بالقيمة نفسها.");
    } else {
      const key = !!props.getProperty("GEMINI_API_KEY");
      add("الخادم", "محرك الذكاء", key ? "ok" : "bad", key ? "الوكلاء يعملون بـ Gemini" : "لا يوجد مفتاح Gemini ولا Claude مفعّل", key ? "" : "أضف GEMINI_API_KEY، أو فعّل Claude بـ AI_ENGINE=claude.");
    }
  });
  safe("الخادم", "إذن Google للبريد", () => {
    let left = null, err = "";
    try { left = MailApp.getRemainingDailyQuota(); } catch (e) { err = String(e.message || e); }
    if (err) add("الخادم", "إذن Google للبريد", "bad", "الخادم لا يقدر يرسل الملخص الصباحي ولا تنبيه توقف العامل", "في محرر Apps Script شغّل الدالة digestAuthorize مرة ووافق على الإذن.");
    else add("الخادم", "إذن Google للبريد", left < 10 ? "warn" : "ok", "المتبقي من حصة اليوم: " + left + " رسالة", left < 10 ? "الحصة قاربت على النفاد؛ تتجدد غداً." : "");
  });
  safe("الخادم", "المشغلات الآلية", () => {
    const want = healthExpectedTriggers_(), have = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
    const missing = want.filter(h => have.indexOf(h) < 0), dup = want.filter(h => have.filter(x => x === h).length > 1);
    const extra = have.filter(h => OFFICE_.handlers.indexOf(h) >= 0 && want.indexOf(h) < 0);
    const label = a => a.map(h => HEALTH_LABELS_[h] || h).join("، ");
    if (!missing.length && !dup.length && !extra.length) add("الخادم", "المشغلات الآلية", "ok", want.length ? "مثبتة كلها (" + want.length + ")" : "لا أتمتة مفعّلة");
    else add("الخادم", "المشغلات الآلية", missing.length ? "bad" : "warn",
      [missing.length ? "غير مثبت: " + label(missing) : "", dup.length ? "مكرر: " + label(dup) : "", extra.length ? "زائد عن الإعدادات: " + label(extra) : ""].filter(Boolean).join(" · "),
      "اضغط «أعد تثبيت المشغلات».", "triggers");
  });

  // ---------- العامل على جهازك ----------
  const claudeOn = typeof claudeEnabled_ === "function" && claudeEnabled_();
  let workerOnline = false;
  safe("العامل", "العامل على جهازك", () => {
    const w = typeof digestWorkerSeen_ === "function" ? digestWorkerSeen_() : { last: Number(CacheService.getScriptCache().get(CLAUDE_.seenKey)) || 0 };
    workerOnline = !!w.last && now - w.last <= 30 * 60000;
    const fix = "شغّل worker/start-worker.cmd واتركه مفتوحاً. وللتشغيل التلقائي مع Windows شغّل worker/install-autostart.cmd مرة واحدة.";
    if (!w.last) add("العامل", "العامل على جهازك", claudeOn ? "bad" : "info", "لم يتصل بالخادم بعد", fix);
    else add("العامل", "العامل على جهازك", workerOnline ? "ok" : "bad", workerOnline ? "متصل (آخر اتصال " + fmt(w.last) + ")" : "متوقف منذ " + fmt(w.last), workerOnline ? "" : fix);
  });
  safe("العامل", "طلبات تنتظر العامل", () => {
    if (typeof readQueue_ !== "function") return;
    const q = readQueue_().length;
    if (q) add("العامل", "طلبات تنتظر العامل", workerOnline ? "warn" : "bad", q + " طلب في الانتظار", workerOnline ? "العامل يعالجها؛ إن بقيت أعد تشغيله." : "تُنفذ حين يعود العامل.");
  });
  safe("العامل", "إرسال بريد مازن", () => {
    if (typeof prospectsMailer_ !== "function") return;
    const m = prospectsMailer_();
    if (!m.seen) add("العامل", "إرسال بريد مازن", "warn", "لم يُضبط إرسال البريد في العامل بعد", "أضف SMTP_* في worker/.env، ثم جرّب: node claude-worker.mjs --mail-test");
    else add("العامل", "إرسال بريد مازن", m.online ? "ok" : workerOnline ? "warn" : "bad", (m.from ? "من " + m.from + " · " : "") + (m.online ? "جاهز" : "آخر اتصال " + fmt(m.seen)),
      m.online ? "" : "تأكد أن بيانات SMTP في worker/.env صحيحة وأن العامل يعمل.");
  });
  safe("العامل", "رسائل تعذر إرسالها", () => {
    if (typeof prospectsAll_ !== "function") return;
    const failed = prospectsAll_().filter(p => p.status === "تعذر الإرسال");
    if (failed.length) add("العامل", "رسائل تعذر إرسالها", "warn", failed.length + " رسالة · آخر سبب: " + String(failed[failed.length - 1].sendError || "غير معروف").slice(0, 160),
      "افتح صفحة مازن ← «تعذر الإرسال»: صحّح البريد أو أعد إرسالها بعد التأكد من صندوق المرسل.", "prospects");
  });
  safe("العامل", "قراءة الوارد", () => {
    if (typeof prospectsInbox_ !== "function") return;
    const ib = prospectsInbox_();
    if (!ib.seen) add("العامل", "قراءة الوارد", "warn", "لم تبدأ قراءة الوارد بعد؛ الردود لا توقف المتابعات تلقائياً", "أضف IMAP_* في worker/.env (أو تُستخدم بيانات SMTP)، ثم جرّب: node claude-worker.mjs --inbox-test");
    else {
      const fresh = now - ib.seen <= 60 * 60000;
      add("العامل", "قراءة الوارد", fresh ? "ok" : workerOnline ? "warn" : "bad", "آخر قراءة " + fmt(ib.seen) + (ib.lastMatched ? " · ردود مطابقة في آخر قراءة: " + ib.lastMatched : ""),
        fresh ? "" : "تأكد من بيانات IMAP في worker/.env وأن العامل يعمل.");
    }
  });

  // ---------- الوكلاء ----------
  const agents = [];
  safe("الوكلاء", "أخطاء آخر 7 أيام", () => {
    const from = fmt(since);
    const errors = officeLogRows_(HEALTH_.logScan).filter(e => e.at >= from && /^تعذر/.test(e.action));
    if (!errors.length) { add("الوكلاء", "أخطاء آخر 7 أيام", "ok", "لا أخطاء مسجلة"); return; }
    const by = {};
    errors.forEach(e => { by[e.action] = by[e.action] || { n: 0, last: e }; by[e.action].n++; if (e.at > by[e.action].last.at) by[e.action].last = e; });
    const top = Object.keys(by).sort((a, b) => by[b].n - by[a].n).slice(0, 3);
    add("الوكلاء", "أخطاء آخر 7 أيام", errors.length > 5 ? "bad" : "warn", errors.length + " خطأ · " + top.map(k => k + " (" + by[k].n + ")").join("، "),
      "آخر تفصيل: " + String(by[top[0]].last.details || "").slice(0, 200), "log");
  });
  safe("الوكلاء", "الوكلاء", () => {
    const sheet = setupSheets().getSheetByName("Tasks");
    const rows = sheet && sheet.getLastRow() > 1 ? sheet.getRange(Math.max(2, sheet.getLastRow() - 499), 1, Math.min(500, sheet.getLastRow() - 1), 7).getValues() : [];
    const names = Object.keys(AGENTS_PROMPTS);
    names.forEach(n => {
      const c = officeAgentCfg_(n), mine = rows.filter(r => String(r[2]) === n);
      const recent = mine.filter(r => { const d = toDate_(r[1]); return d && d.getTime() >= since; });
      const scores = recent.map(r => salemScore_(r[5])).filter(x => x !== null);
      const last = mine.length ? toDate_(mine[mine.length - 1][1]) : null;
      agents.push({ name: n, active: c.active !== false, onDuty: c.active !== false && officeInHours_(officeHoursOf_(n)), tasks: recent.length,
        avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, low: scores.filter(x => x < 70).length, last: last ? fmt(last.getTime()) : "" });
    });
    const stopped = agents.filter(a => !a.active).map(a => a.name), weak = agents.filter(a => a.avg !== null && a.avg < 70).map(a => a.name + " " + a.avg + "%");
    add("الوكلاء", "الوكلاء الموقوفون", stopped.length ? "warn" : "ok", stopped.length ? voiceJoinSafe_(stopped) : "كلهم يداومون", stopped.length ? "من «الوكلاء» أو قل لراكان: خل … يداوم." : "", stopped.length ? "agents" : "");
    if (weak.length) add("الوكلاء", "تقديرات سالم المنخفضة", "warn", "متوسط آخر 7 أيام أقل من 70%: " + weak.join("، "), "راجع مخرجاتهم في سجل المهام، وعلّمهم من «العقل والمرجع».", "brain");
  });

  // ---------- الأتمتة ----------
  safe("الأتمتة", "الملخص الصباحي", () => {
    if (typeof digestCfg_ !== "function") return;
    const c = digestCfg_();
    let st = {};
    try { st = JSON.parse(officeProps_().getProperty(DIGEST_.stateKey) || "{}"); } catch (e) {}
    if (!c.enabled) { add("الأتمتة", "الملخص الصباحي", "info", "متوقف", "فعّله من «الأتمتة والهوية» إن أردته.", "auto"); return; }
    const stale = !st.lastSent || now - st.lastSent > 4 * 86400000;
    add("الأتمتة", "الملخص الصباحي", stale ? "warn" : "ok", (st.lastSent ? "آخر إرسال " + fmt(st.lastSent) : "لم يُرسل بعد") + " · إلى " + (digestRecipient_(c) || "غير محدد"),
      stale ? "جرّب «أرسل ملخص اليوم الآن» من «الأتمتة والهوية»؛ إن فشل فشغّل digestAuthorize." : "", stale ? "auto" : "");
  });
  safe("الأتمتة", "ملخص راكان التنفيذي", () => {
    if (typeof execReports_ !== "function") return;
    const r = execReports_(1)[0], d = r ? toDate_(r.at) : null;
    add("الأتمتة", "ملخص راكان التنفيذي", d && now - d.getTime() <= 3 * 86400000 ? "ok" : "info", d ? "آخر ملخص " + r.at : "لم يُكتب ملخص بعد", d ? "" : "من بطاقة راكان ← «الملخص» ← «ملخص اليوم الآن».");
  });

  // ---------- النشر ----------
  safe("النشر", "LinkedIn وX", () => {
    if (typeof socialStatus_ !== "function") return;
    ["linkedin", "x"].forEach(n => {
      const s = socialStatus_(n), label = n === "x" ? "X" : "LinkedIn";
      if (!s.configured) { add("النشر", label, "info", "غير مضبوط (النشر يدوي)"); return; }
      if (!s.connected) { add("النشر", label, "warn", "غير مربوط أو انتهى الربط", "اربطه من صفحة المحتوى ← النشر."); return; }
      const left = s.expiresAt ? Math.round((new Date(s.expiresAt).getTime() - now) / 86400000) : null;
      add("النشر", label, left !== null && left < 7 ? "warn" : "ok", (s.name ? s.name + " · " : "") + (left !== null ? "ينتهي الربط بعد " + left + " يوماً" : "مربوط"), left !== null && left < 7 ? "أعد الربط قبل انتهائه." : "");
    });
  });

  // ---------- البيانات ----------
  safe("البيانات", "حجم الجدول", () => {
    const cells = SpreadsheetApp.getActiveSpreadsheet().getSheets().reduce((s, sh) => s + sh.getMaxRows() * sh.getMaxColumns(), 0);
    const pct = Math.round(100 * cells / HEALTH_.cellLimit);
    add("البيانات", "حجم الجدول", pct >= 80 ? "bad" : pct >= 60 ? "warn" : "ok", pct + "% من حد Google Sheets (" + cells.toLocaleString("en-US") + " خلية)", pct >= 60 ? "انقل السجلات القديمة إلى ملف أرشيف." : "");
  });

  const count = s => checks.filter(c => c.status === s).length;
  return { status: "success", server: HEALTH_.server, at: fmt(now), checks: checks, agents: agents, summary: { ok: count("ok"), warn: count("warn"), bad: count("bad"), info: count("info") } };
}

const voiceJoinSafe_ = a => typeof voiceJoin_ === "function" ? voiceJoin_(a) : a.join("، ");

function handleHealthAction_(data, user) {
  try {
    officeApply_();
    if (data.action === "health_get") return json_(healthCheck_());
    if (data.action === "health_fix" && data.fix === "triggers") {
      officeCache_ = null; officeInstallTriggers_();
      officeLog_("إعادة تثبيت المشغلات", "", "من صحة المكتب", officeBy_(user));
      return json_(healthCheck_());
    }
    throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
