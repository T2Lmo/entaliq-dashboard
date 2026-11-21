/**
 * Digest.gs — ملخص راكان الصباحي إلى بريدك، وتنبيه إن توقف العامل على جهازك.
 *
 * - الملخص الصباحي (الافتراضي 8:00، الأحد–الخميس): ما ينتظر موافقتك (رسائل مازن ومتابعاته، المنشورات، دروس العقل، عروض الصيانة)،
 *   والردود الجديدة، ومواعيد اليوم (زيارات الصيانة، المنافسات القريبة، المستندات التي تقترب من الانتهاء، التجديدات)،
 *   وحالة الفريق (العامل، الموقوفون، الأخطاء)، وآخر خلاصة لراكان. الأرقام من السجلات مباشرة، بلا استدعاء نموذج.
 * - تنبيه العامل: كل ساعة في ساعات العمل، إن لم يتصل العامل منذ 30 دقيقة يصلك بريد واحد لكل انقطاع (ويتكرر بعد 24 ساعة إن استمر).
 * - الإرسال عبر خدمة بريد Google (MailApp) من حساب Google الذي يشغّل الخادم؛ يعمل حتى لو كان جهازك مطفأً.
 *   يحتاج موافقة Google مرة واحدة: من المحرر شغّل الدالة digestAuthorize ثم وافق.
 * - المستلم: البريد المحفوظ في الإعدادات، وإلا بريد حساب Google صاحب الخادم.
 *
 * يعتمد على Code.gs: setupSheets, columnValues_, CONTENT_HEADERS, startOfDay_, toDate_, json_, appError_, CLAUDE_
 * ويعتمد على Office.gs: officeLoad_, officeProps_, officeLog_, officeBy_, officeApply_, officeLogRows_, officeAgentCfg_, AGENTS_PROMPTS
 * ويستخدم إن وُجد: prospectsAll_, prospectsStats_, prospectsCfg_, prospectsMailer_, prospectsInbox_, brainLoad_, tendersAll_, tendersProfile_,
 *   tendersReadiness_, contractsAll_, contractsStats_, execReports_
 */

const DIGEST_ = {
  stateKey: "DIGEST_STATE", watchKey: "WATCHDOG_STATE", dashboard: "https://t2lmo.github.io/entaliq-dashboard/",
  offlineMin: 30, repeatHours: 24, day: 86400000
};
// التواريخ داخل النص العربي تُعرض مقلوبة (20-11-2026) ما لم تُعزل باتجاه من اليسار لليمين
const DIGEST_DATE_RE_ = /\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?/g;
// العدد مع معدوده: 1 يوم، يومين، 3–10 أيام، 11+ يوماً
const digestNum_ = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n + " " + (n >= 3 && n <= 10 ? few : many);
const digestLtr_ = s =>"⁦" + s + "⁩";

function digestCfg_() {
  const c = (officeLoad_().cfg.automation || {}).digest || {};
  const hour = Number(c.hour), days = Array.isArray(c.days) && c.days.length ? c.days.map(Number).filter(d => d >= 0 && d <= 6) : [0, 1, 2, 3, 4];
  const time = (v, def) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : def;
  return { enabled: c.enabled !== false, hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8, days: days,
    to: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.to || "").trim()) ? String(c.to).trim() : "",
    watchdog: c.watchdog !== false, watchFrom: time(c.watchFrom, "08:00"), watchTo: time(c.watchTo, "18:00") };
}

function digestRecipient_(cfg) {
  if (cfg.to) return cfg.to;
  try { return Session.getEffectiveUser().getEmail() || ""; } catch (e) { return ""; }
}

// تستدعيها من المحرر مرة واحدة لتظهر موافقة Google على إرسال البريد
function digestAuthorize() {
  const left = MailApp.getRemainingDailyQuota();
  console.log("الإذن جاهز؛ المتبقي من حصة البريد اليوم: " + left + " — المستلم: " + digestRecipient_(digestCfg_()));
}

// ---------------- العامل: آخر اتصال ----------------
function digestWorkerSeen_() {
  const signals = [];
  try { signals.push(Number(CacheService.getScriptCache().get(CLAUDE_.seenKey)) || 0); } catch (e) {}
  try { if (typeof prospectsMailer_ === "function") signals.push(prospectsMailer_().seen || 0); } catch (e) {}
  try { if (typeof prospectsInbox_ === "function") signals.push(prospectsInbox_().seen || 0); } catch (e) {}
  let st = {};
  try { st = JSON.parse(officeProps_().getProperty(DIGEST_.watchKey) || "{}"); } catch (e) {}
  const now = Math.max.apply(null, signals.concat([0]));
  const last = Math.max(now, Number(st.lastSeen) || 0);
  return { last: last, everSeen: last > 0, state: st };
}

// ---------------- جمع الملخص ----------------
function digestCollect_() {
  const tz = Session.getScriptTimeZone(), now = new Date(), fmt = d => Utilities.formatDate(d, tz, "yyyy-MM-dd HH:mm");
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd"), since = Date.now() - DIGEST_.day;
  const d = { date: today, approvals: [], replies: [], today: [], team: [], headline: "" };
  const safe = fn => { try { fn(); } catch (e) { console.log("تخطي قسم في الملخص: " + e.message); } };

  safe(() => {
    if (typeof prospectsAll_ !== "function") return;
    const all = prospectsAll_(), by = s => all.filter(p => p.status === s).length;
    const ready = by("جاهز للإرسال"), fu = by("متابعة جاهزة"), check = by("تحقق يدوي"), queued = by("في الطابور"), failed = by("تعذر الإرسال");
    if (ready || fu) d.approvals.push("رسائل مازن تنتظر موافقتك: " + ready + (fu ? " · متابعات: " + fu : ""));
    if (check) d.approvals.push("رسائل تحتاج تحققك من البريد: " + check);
    if (queued) d.today.push("في طابور الإرسال: " + queued);
    if (failed) d.approvals.push("رسائل تعذر إرسالها: " + failed);
    all.filter(p => p.replyAtMs >= since && ["مهتم", "يطلب معلومات", "ليس الآن", "تحويل"].indexOf(p.replyKind) >= 0)
      .slice(0, 8).forEach(p => d.replies.push(p.replyKind + ": " + p.company + (p.replySummary ? " — " + String(p.replySummary).slice(0, 120) : "")));
    const other = all.filter(p => p.replyAtMs >= since && ["غير مهتم", "إلغاء المراسلة", "ارتداد"].indexOf(p.replyKind) >= 0).length;
    if (other) d.replies.push("ردود أخرى (غير مهتم، إيقاف، ارتداد): " + other);
  });
  safe(() => {
    const sheet = setupSheets().getSheetByName("Content");
    const st = columnValues_(sheet, 10).map(String);
    const drafts = st.filter(s => s === "مسودة").length;
    if (drafts) d.approvals.push("منشورات جاهزة لمراجعتك: " + drafts);
  });
  safe(() => {
    if (typeof brainLoad_ !== "function") return;
    const n = brainLoad_().filter(x => x.status === "مقترح").length;
    if (n) d.approvals.push("دروس مقترحة في العقل: " + n);
  });
  safe(() => {
    if (typeof contractsAll_ !== "function") return;
    const s = contractsStats_(contractsAll_());
    if (s.offers) d.approvals.push("عروض صيانة شمسية معلقة: " + s.offers);
    s.visitsSoon.filter(v => v.date <= today).forEach(v => d.today.push((v.late ? "زيارة صيانة متأخرة " : "زيارة صيانة اليوم ") + v.date + ": " + v.client + " (" + v.type + ")"));
    s.renewals.forEach(r => d.today.push("تجديد عقد صيانة: " + r.client + " ينتهي " + r.end));
  });
  // مسار المبيعات (Pipeline.gs): خطوات الصفقات التي حان موعدها
  safe(() => {
    if (typeof pipeAll_ !== "function") return;
    pipeDue_(pipeAll_()).slice(0, 6).forEach(x => d.today.push((x.late ? "خطوة صفقة متأخرة " : "خطوة صفقة اليوم ") + x.at + ": " + x.company + " — " + x.step));
  });
  safe(() => {
    if (typeof tendersAll_ !== "function") return;
    const soon = Date.now() + 7 * DIGEST_.day;
    tendersAll_().filter(t => ["جديد", "نتابعها", "نجهز العرض"].indexOf(t.status) >= 0 && t.kind !== "ترسية" && t.verdict !== "تجاهل" && t.bidsMs && t.bidsMs <= soon)
      .sort((a, b) => a.bidsMs - b.bidsMs).slice(0, 5)
      .forEach(t => d.today.push("منافسة تنتهي " + t.bidsBy + ": " + String(t.title).slice(0, 90) + " — " + t.verdict));
    const r = tendersReadiness_(tendersProfile_());
    r.expiring.forEach(x => d.today.push("مستند " + (x.days < 0 ? "منتهٍ" : x.days === 0 ? "ينتهي اليوم" : "ينتهي خلال " + digestNum_(x.days, "يوم", "يومين", "أيام", "يوماً")) + ": " + x.name));
  });
  safe(() => {
    const w = digestWorkerSeen_(), mins = w.last ? Math.round((Date.now() - w.last) / 60000) : null;
    d.team.push(w.last ? (mins <= DIGEST_.offlineMin ? "العامل على جهازك متصل" : "العامل على جهازك متوقف منذ " + fmt(new Date(w.last)) + "؛ الإرسال والبحث وقراءة الوارد متوقفة") : "العامل على جهازك لم يتصل بعد");
    const stopped = Object.keys(AGENTS_PROMPTS).filter(n => officeAgentCfg_(n).active === false);
    if (stopped.length) d.team.push("وكلاء موقوفون: " + stopped.join("، "));
    const from = fmt(new Date(since));
    const errors = officeLogRows_(200).filter(e => e.at >= from && /^تعذر/.test(e.action));
    if (errors.length) d.team.push("أخطاء آخر 24 ساعة: " + errors.length + " (" + Array.from(new Set(errors.map(e => e.action))).slice(0, 3).join("، ") + ")");
  });
  safe(() => {
    if (typeof execReports_ !== "function") return;
    const r = execReports_(1)[0];
    if (r && r.report && Date.now() - (toDate_(r.at) || new Date(0)).getTime() <= 2 * DIGEST_.day) d.headline = String(r.report.headline || "").slice(0, 200);
  });
  return d;
}

function digestHtml_(d) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    .replace(DIGEST_DATE_RE_, m => '<span dir="ltr">' + m + "</span>");
  const section = (title, items, empty) => `<h3 style="color:#0d3b4f;font-size:15px;margin:18px 0 6px">${title}</h3>`
    + (items.length ? `<ul style="margin:0;padding-inline-start:20px">${items.map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join("")}</ul>` : `<p style="color:#666;margin:0">${empty}</p>`);
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.8;color:#111;max-width:640px">
    <div style="border-bottom:3px solid #0d3b4f;padding-bottom:6px;margin-bottom:10px"><b style="font-size:18px;color:#0d3b4f">صباح الخير من راكان</b>
      <span style="color:#666"> · مكتب انطلق الذكي · ${esc(d.date)}</span></div>
    ${d.headline ? `<p style="background:#eef4f6;padding:8px 12px;border-radius:6px;margin:0 0 6px"><b>خلاصة الأمس:</b> ${esc(d.headline)}</p>` : ""}
    ${section("ينتظر موافقتك", d.approvals, "لا شيء ينتظرك الآن.")}
    ${section("ردود العملاء منذ أمس", d.replies, "لا ردود جديدة.")}
    ${section("اليوم", d.today, "لا مواعيد قريبة.")}
    ${section("حالة الفريق", d.team, "")}
    <p style="margin-top:20px"><a href="${DIGEST_.dashboard}" style="background:#0d3b4f;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">افتح اللوحة</a></p>
    <p style="color:#888;font-size:12px">يصلك هذا الملخص من خادم المكتب. تغيير الموعد أو إيقافه: إدارة المكتب ← الأتمتة والهوية.</p></div>`;
}

function digestText_(d) {
  const part = (t, a, e) => t + ":\n" + (a.length ? a.map(x => "- " + x).join("\n") : e);
  return ["صباح الخير من راكان · مكتب انطلق الذكي · " + d.date, d.headline ? "خلاصة الأمس: " + d.headline : "",
    part("ينتظر موافقتك", d.approvals, "لا شيء ينتظرك الآن."), part("ردود العملاء منذ أمس", d.replies, "لا ردود جديدة."),
    part("اليوم", d.today, "لا مواعيد قريبة."), part("حالة الفريق", d.team, ""), "اللوحة: " + DIGEST_.dashboard].filter(Boolean).join("\n\n");
}

function digestSend_(by) {
  const cfg = digestCfg_(), to = digestRecipient_(cfg);
  if (!to) throw appError_("NO_RECIPIENT", "حدد بريد المستلم في إعدادات الملخص الصباحي");
  const d = digestCollect_();
  const waiting = d.approvals.length + d.replies.length;
  const subject = "ملخص الصباح من راكان — " + digestLtr_(d.date) + (waiting ? " · " + digestNum_(waiting, "بند ينتظرك", "بندان ينتظرانك", "بنود تنتظرك", "بنداً ينتظرك") : "");
  MailApp.sendEmail({ to: to, subject: subject, body: digestText_(d), htmlBody: digestHtml_(d), name: "مكتب انطلق الذكي" });
  officeProps_().setProperty(DIGEST_.stateKey, JSON.stringify({ lastSent: Date.now(), to: to }));
  officeLog_("ملخص صباحي", "راكان", "إلى " + to + " — " + (waiting ? digestNum_(waiting, "بند", "بندان", "بنود", "بنداً") + " تنتظرك" : "لا شيء ينتظرك"), by || "آلي");
  return { to: to, subject: subject, sections: { approvals: d.approvals.length, replies: d.replies.length, today: d.today.length } };
}

// ---------------- المشغلات ----------------
function officeRunDigest() {
  const cfg = digestCfg_(), tz = Session.getScriptTimeZone();
  if (!cfg.enabled || cfg.days.indexOf(Number(Utilities.formatDate(new Date(), tz, "u")) % 7) < 0) return;
  let st = {};
  try { st = JSON.parse(officeProps_().getProperty(DIGEST_.stateKey) || "{}"); } catch (e) {}
  if (st.lastSent && Utilities.formatDate(new Date(st.lastSent), tz, "yyyy-MM-dd") === Utilities.formatDate(new Date(), tz, "yyyy-MM-dd")) return; // مرة واحدة في اليوم
  try { digestSend_("آلي"); } catch (err) { officeLog_("تعذر الملخص الصباحي", "راكان", String(err.message || err).slice(0, 300), "آلي"); }
}

// كل ساعة: إن انقطع العامل أكثر من 30 دقيقة في ساعات العمل يصلك تنبيه واحد لكل انقطاع
function officeRunWatchdog() {
  const cfg = digestCfg_();
  if (!cfg.watchdog) return;
  const tz = Session.getScriptTimeZone(), now = new Date(), w = digestWorkerSeen_(), props = officeProps_();
  const st = Object.assign({}, w.state, { lastSeen: w.last || w.state.lastSeen || 0 });
  const online = w.last && Date.now() - w.last <= DIGEST_.offlineMin * 60000;
  if (online) { delete st.alertedAt; delete st.outageSince; props.setProperty(DIGEST_.watchKey, JSON.stringify(st)); return; }
  props.setProperty(DIGEST_.watchKey, JSON.stringify(st));
  if (!w.everSeen) return; // لم يُشغّل العامل أصلاً: لا تنبيه
  const day = Number(Utilities.formatDate(now, tz, "u")) % 7, hm = Utilities.formatDate(now, tz, "HH:mm");
  if (cfg.days.indexOf(day) < 0 || hm < cfg.watchFrom || hm >= cfg.watchTo) return;
  if (st.alertedAt && st.outageSince === w.last && Date.now() - st.alertedAt < DIGEST_.repeatHours * 3600000) return;
  const to = digestRecipient_(cfg);
  if (!to) return;
  const since = Utilities.formatDate(new Date(w.last), tz, "yyyy-MM-dd HH:mm");
  try {
    MailApp.sendEmail({ to: to, subject: "تنبيه: عامل مكتب انطلق متوقف منذ " + digestLtr_(since), name: "مكتب انطلق الذكي",
      body: "العامل على جهازك لم يتصل بخادم المكتب منذ " + since + ".\nمتوقف حتى يعود: Claude للوكلاء، إرسال رسائل مازن، البحث عن العملاء والمنافسات، وقراءة الوارد.\n\n"
        + "ما تفعله: تأكد أن الجهاز يعمل ومتصل بالإنترنت، ثم شغّل worker/start-worker.cmd واتركه مفتوحاً.\nللتشغيل التلقائي مع Windows: ضع اختصاراً لـ start-worker.cmd في مجلد shell:startup.\n\nاللوحة: " + DIGEST_.dashboard });
    st.alertedAt = Date.now(); st.outageSince = w.last;
    props.setProperty(DIGEST_.watchKey, JSON.stringify(st));
    officeLog_("تنبيه توقف العامل", "راكان", "متوقف منذ " + since + " — إلى " + to, "آلي");
  } catch (err) { officeLog_("تعذر تنبيه توقف العامل", "راكان", String(err.message || err).slice(0, 300), "آلي"); }
}

function digestState_() {
  const cfg = digestCfg_(), w = digestWorkerSeen_(), tz = Session.getScriptTimeZone();
  let st = {};
  try { st = JSON.parse(officeProps_().getProperty(DIGEST_.stateKey) || "{}"); } catch (e) {}
  return { status: "success", cfg: cfg, recipient: digestRecipient_(cfg), lastSent: st.lastSent ? Utilities.formatDate(new Date(st.lastSent), tz, "yyyy-MM-dd HH:mm") : "",
    worker: { last: w.last ? Utilities.formatDate(new Date(w.last), tz, "yyyy-MM-dd HH:mm") : "", online: !!w.last && Date.now() - w.last <= DIGEST_.offlineMin * 60000 } };
}

function handleDigestAction_(data, user) {
  try {
    officeApply_();
    if (data.action === "digest_get") return json_(digestState_());
    if (data.action === "digest_preview") return json_(Object.assign(digestState_(), { preview: digestCollect_() }));
    if (data.action === "digest_send") return json_(Object.assign(digestState_(), { sent: digestSend_(officeBy_(user)) }));
    throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
  } catch (err) {
    const msg = /permission|authorization|الإذن|Authorization is required|You do not have permission/i.test(String(err.message))
      ? "يحتاج الخادم إذن Google لإرسال البريد: افتح محرر Apps Script وشغّل الدالة digestAuthorize مرة ووافق، ثم أعد المحاولة." : err.message;
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: msg });
  }
}
