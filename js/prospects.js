"use strict";
// مازن (Prospects.gs): مرسل بريد محترف — 20 منشأة يومياً، رسائل يدققها سالم، إرسال بعد موافقتك من بريد الشركة، ومتابعة بعد 5 أيام

const PST = { wait: "بانتظار المسودة", ready: "جاهز للإرسال", check: "تحقق يدوي", queued: "في الطابور", sending: "جارٍ الإرسال", sent: "أُرسل",
  fuReady: "متابعة جاهزة", followed: "تمت المتابعة", replied: "ردّوا", excluded: "مستبعد", failed: "تعذر الإرسال" };
const PROSPECT_TABS = [
  { id: "approve", label: "للموافقة", match: [PST.ready, PST.fuReady] },
  { id: "check", label: "تحقق يدوي", match: [PST.check] },
  { id: "wait", label: "بانتظار المسودة", match: [PST.wait] },
  { id: "queue", label: "الطابور", match: [PST.queued, PST.sending] },
  { id: "sent", label: "أُرسل", match: [PST.sent, PST.followed] },
  { id: "replied", label: "ردّوا", match: [PST.replied] },
  { id: "failed", label: "تعذر الإرسال", match: [PST.failed] },
  { id: "excluded", label: "مستبعد", match: [PST.excluded] },
  { id: "all", label: "الكل", match: null }
];
const SELECTABLE = [PST.ready, PST.check, PST.fuReady, PST.failed];
// قراءة الوارد (العامل): نوع الرد ولونه
const REPLY_TONE = { "مهتم": "ok", "يطلب معلومات": "ok", "ليس الآن": "warn", "غير مهتم": "bad", "إلغاء المراسلة": "bad", "تحويل": "none", "ارتداد": "bad" };
function replyHtml(p) {
  if (!p.replyKind) return "";
  return `<div class="p-reply" data-tone="${REPLY_TONE[p.replyKind] || "none"}"><div class="p-line"><span class="badge" data-tone="${REPLY_TONE[p.replyKind] || "none"}">${esc(p.replyKind)}</span>`
    + `${p.replyFrom ? `<span class="mono ltr">${esc(p.replyFrom)}</span>` : ""}${p.replyAt ? `<small class="muted">${ltr(p.replyAt)}</small>` : ""}</div>`
    + `${p.replySummary ? `<p>${esc(p.replySummary)}</p>` : ""}${p.replyText ? `<details class="fold"><summary>نص الرد</summary><div class="p-body">${esc(p.replyText)}</div></details>` : ""}</div>`;
}
const PROSPECT_SECTORS = ["فنادق", "مستشفيات", "مولات ومراكز تجارية", "مجمعات سكنية", "شركات ومبانٍ إدارية", "منشآت لديها ألواح شمسية"];
const PROSPECT_TONE = { [PST.ready]: "ok", [PST.fuReady]: "ok", [PST.check]: "warn", [PST.wait]: "none", [PST.queued]: "none", [PST.sending]: "warn",
  [PST.sent]: "none", [PST.followed]: "none", [PST.replied]: "ok", [PST.excluded]: "bad", [PST.failed]: "bad" };
if (!state.prospectsSel) state.prospectsSel = new Set();
if (!PROSPECT_TABS.some(t => t.id === state.prospectsFilter)) state.prospectsFilter = "approve";

// مؤشرا مازن في البطاقات: قراءة خفيفة كل 5 دقائق على الأكثر
async function syncProspects(force) {
  if (!state.url || !hasAuth() || state.officeUnsupported || state.prospectsUnsupported) return;
  if (!force && state.prospectsStats && Date.now() - state.prospectsAt < 300000) return;
  state.prospectsAt = Date.now();
  try {
    const d = await api({ action: "prospects_get", statsOnly: true });
    state.prospectsStats = d.stats;
    if (state.loaded) renderStage(computeMetrics());
  } catch (e) { if (/نص المهمة فارغ/.test(e.message)) state.prospectsUnsupported = true; }
}

async function loadProspects() {
  if (!state.url || !hasAuth()) { state.prospectsError = "اربط اللوحة بالخادم أولاً."; renderProspectsView(); return; }
  state.prospectsLoading = !state.prospects; renderProspectsView();
  try { acceptProspects(await api({ action: "prospects_get" })); state.prospectsError = ""; }
  catch (e) { state.prospectsError = officeError(e); }
  finally { state.prospectsLoading = false; renderProspectsView(); }
}
function acceptProspects(d) {
  state.prospects = { items: d.items || [], stats: d.stats || {}, cfg: d.cfg || {}, webReady: !!d.webReady, mailer: d.mailer || {}, inbox: d.inbox || {} };
  state.prospectsStats = d.stats || null; state.prospectsAt = Date.now();
  // التحديد يبقى فقط لما يمكن إرساله
  const sendable = new Set(state.prospects.items.filter(p => SELECTABLE.includes(p.status) && p.email).map(p => p.id));
  [...state.prospectsSel].forEach(id => { if (!sendable.has(id)) state.prospectsSel.delete(id); });
  if (state.loaded) renderStage(computeMetrics());
}

const isFollow = p => p.status === PST.fuReady || ((p.status === PST.queued || p.status === PST.sending || p.status === PST.failed) && p.sendKind === "متابعة");
const msgOf = p => isFollow(p) ? { subject: p.fuSubject, body: p.fuBody, score: p.fuScore } : { subject: p.subject, body: p.body, score: p.score };
const prospectMailto = (p, m) => "mailto:" + encodeURIComponent(p.email) + "?subject=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(m.body);
const prospectGmail = (p, m) => "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(p.email) + "&su=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(m.body);
const safeHref = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "";

function prospectItemHtml(p) {
  const b = (act, label, cls) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-pact="${act}" data-id="${esc(p.id)}"><span class="lbl-text">${label}</span></button>`;
  const editing = state.prospectsEdit === p.id, m = msgOf(p), follow = isFollow(p);
  const site = safeHref(p.website), src = safeHref(p.emailSource);
  const verifiedTone = p.verified === "موثّق من الصفحة" || p.verified === "عدّلته يدوياً" ? "ok" : p.verified === "غير موثّق" ? "warn" : "none";
  const score = m.score === null || m.score === undefined ? "" : `<span class="badge" data-tone="${tone(m.score)}" title="تقدير سالم للرسالة">سالم ${m.score}%</span>`;
  const selectable = SELECTABLE.includes(p.status) && p.email && !editing;
  const head = `<div class="item-head">
      ${selectable ? `<input type="checkbox" class="p-sel" data-psel="${esc(p.id)}"${state.prospectsSel.has(p.id) ? " checked" : ""} aria-label="تحديد رسالة ${esc(p.company)}">` : avatar(PROSPECTS_AGENT, "xs")}
      <b>${esc(p.company)}</b><small class="muted">${esc(p.sector)} · ${esc(p.city)}</small>
      ${p.service ? `<span class="tag">${esc(p.service)}</span>` : ""}${follow ? `<span class="badge" data-tone="none">متابعة ${p.followUps + 1}</span>` : ""}${score}
      <span class="badge" data-tone="${PROSPECT_TONE[p.status] || "none"}" style="margin-inline-start:auto">${esc(p.status)}</span></div>`;
  const contact = `<div class="p-line">
      ${site ? `<a class="tag" href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(p.domain || site)}${ICON.ext}</a>` : ""}
      ${p.email ? `<span class="mono ltr">${esc(p.email)}</span>` : `<span class="hint">لا بريد منشوراً</span>`}
      <span class="badge" data-tone="${verifiedTone}">${esc(p.verified || "—")}</span>
      ${src ? `<a class="tag" href="${esc(src)}" target="_blank" rel="noopener noreferrer">${p.email ? "مصدر البريد" : "صفحة التواصل"}${ICON.ext}</a>` : ""}
    </div>${p.note ? `<p class="hint p-note">${esc(p.note)}</p>` : ""}${p.why ? `<p class="hint">${esc(p.why)}</p>` : ""}${p.hook ? `<p class="hint">الخبر المستخدم: ${esc(p.hook)}</p>` : ""}`;
  const times = [p.sentAt ? "أُرسلت الأولى " + ltr(p.sentAt) : "", p.followUps ? "متابعات " + p.followUps + " (آخرها " + ltr(p.lastSent) + ")" : "",
    p.followDueAt && (p.status === PST.sent || p.status === PST.followed) ? "المتابعة القادمة " + ltr(p.followDueAt) : "",
    p.status === PST.queued && p.sendAt ? "موعد الإرسال " + ltr(p.sendAt) : "", p.status === PST.sending ? "يرسلها العامل الآن" : ""].filter(Boolean).join(" · ");
  let draft = "";
  if (editing) draft = `<div class="office-form" data-pform="${esc(p.id)}">
      <label class="lbl" for="pe-email">البريد</label><input class="input ltr" id="pe-email" value="${esc(p.email)}" placeholder="info@…">
      <label class="lbl" for="pe-subject">${follow ? "موضوع المتابعة" : "الموضوع"}</label><input class="input" id="pe-subject" maxlength="150" value="${esc(m.subject)}">
      <label class="lbl" for="pe-body">${follow ? "نص المتابعة" : "الرسالة"}</label><textarea class="field" id="pe-body" rows="12" maxlength="6000">${esc(m.body)}</textarea>
      <div class="row-actions">${b("save", "حفظ", "btn-primary")}${b("cancel", "إلغاء")}</div></div>`;
  else if (m.body) draft = (follow && p.subject ? `<p class="hint">الرسالة الأولى: ${esc(p.subject)}</p>` : "")
    + `<p class="p-subject"><b>الموضوع:</b> ${esc(m.subject)}</p><details class="fold"${p.status === PST.ready || p.status === PST.fuReady || p.status === PST.check ? " open" : ""}><summary>نص الرسالة</summary><div class="p-body">${esc(m.body)}</div></details>`;
  else draft = `<p class="hint">يكتب مازن المسودة في الدورة القادمة، ثم يدققها سالم.</p>`;
  const manual = m.body && p.email && !editing && SELECTABLE.includes(p.status)
    ? `<a class="btn btn-line sm" href="${esc(prospectMailto(p, m))}">${ICON.send}<span class="lbl-text">افتح في بريدي</span></a>`
      + `<a class="btn btn-line sm" href="${esc(prospectGmail(p, m))}" target="_blank" rel="noopener noreferrer">${ICON.ext}<span class="lbl-text">Gmail</span></a>` + copyButton(m.subject + "\n\n" + m.body, "نسخ") : "";
  const acts = editing ? "" : {
    [PST.ready]: b("send1", "أرسلها الآن", "btn-primary") + b("edit", "تعديل") + b("exclude", "استبعد"),
    [PST.check]: b("send1", "أرسلها", "btn-primary") + b("edit", "تعديل") + b("exclude", "استبعد"),
    [PST.fuReady]: b("send1", "أرسل المتابعة", "btn-primary") + b("edit", "تعديل") + b("replied", "ردّوا") + b("exclude", "أوقف المتابعة"),
    [PST.wait]: b("exclude", "استبعد"),
    [PST.queued]: b("unqueue", "إلغاء من الطابور"),
    [PST.sent]: b("replied", "ردّوا", "btn-primary") + b("exclude", "أوقف المتابعة"),
    [PST.followed]: b("replied", "ردّوا", "btn-primary") + b("exclude", "أوقف المتابعة"),
    [PST.replied]: `<button type="button" class="btn btn-primary sm" data-to-contract="${esc(p.id)}"><span class="lbl-text">اعمل عرض صيانة شمسية</span></button>`,
    [PST.excluded]: b("restore", "إرجاع"),
    [PST.failed]: b("send1", "أعد المحاولة", "btn-primary") + b("sentManual", "أرسلتها يدوياً") + b("exclude", "استبعد")
  }[p.status] || "";
  const manualSent = [PST.ready, PST.check].includes(p.status) && !editing ? b("sentManual", "أرسلتها يدوياً") : "";
  return `<article class="item p-item${state.prospectsSel.has(p.id) ? " p-picked" : ""}">${head}${contact}
    ${times ? `<p class="hint">${times}</p>` : ""}${replyHtml(p)}${p.status === PST.failed && p.sendError ? `<p class="msg bad">${esc(p.sendError)}</p>` : ""}${draft}
    ${p.status === PST.check && !editing ? `<p class="hint">افتح مصدر البريد وتأكد منه قبل الإرسال، أو عدّله.</p>` : ""}
    <div class="row-actions">${acts}${manual}${manualSent}</div></article>`;
}

function prospectsCfgHtml(cfg) {
  const sectors = Array.from(new Set(PROSPECT_SECTORS.concat(cfg.sectors || [])));
  const sel = (id, opts, cur, fmt) => `<select class="input" id="${id}">${opts.map(n => `<option value="${n}"${n === cur ? " selected" : ""}>${fmt ? fmt(n) : n}</option>`).join("")}</select>`;
  return `<div class="sh-pad office-form" data-pcfg>
    <h3 class="news-title">إعدادات مازن</h3>
    <span class="lbl">القطاعات</span><div class="day-checks">${sectors.map(s => `<label><input type="checkbox" data-psector value="${esc(s)}"${(cfg.sectors || []).includes(s) ? " checked" : ""}> ${esc(s)}</label>`).join("")}</div>
    <label class="lbl" for="pc-cities">المدن (افصل بينها بفاصلة)</label>
    <input class="input" id="pc-cities" value="${esc((cfg.cities || []).join("، "))}">
    <div class="row-actions">
      <label class="hint">الهدف اليومي ${sel("pc-target", [5, 10, 15, 20, 25, 30, 40], cfg.dailyTarget, n => n + " منشأة")}</label>
      <label class="hint">في كل دورة ${sel("pc-per", [1, 2, 3, 4, 5], cfg.perRun)}</label>
      <label class="remember"><input type="checkbox" id="pc-on"${cfg.enabled ? " checked" : ""}> يعمل تلقائياً</label>
      <label class="hint">كل ${sel("pc-every", [1, 2, 4, 6, 8, 12], cfg.everyHours, n => n + " ساعة")}</label>
    </div>
    <h3 class="news-title">المتابعة</h3>
    <div class="row-actions">
      <label class="hint">بعد ${sel("pc-fudays", [3, 4, 5, 6, 7, 10, 14], cfg.followUpDays, n => n + " أيام")} بلا رد</label>
      <label class="hint">عدد المتابعات ${sel("pc-fumax", [0, 1, 2], cfg.maxFollowUps, n => n === 0 ? "بلا متابعة" : n)}</label>
    </div>
    <h3 class="news-title">الإرسال من بريد الشركة</h3>
    <span class="lbl">أيام الإرسال</span>${dayChecks("pcd", cfg.sendDays || [0, 1, 2, 3, 4])}
    <div class="row-actions">
      <label class="hint">من <input class="input" type="time" id="pc-from" value="${esc(cfg.sendFrom || "09:00")}"></label>
      <label class="hint">إلى <input class="input" type="time" id="pc-to" value="${esc(cfg.sendTo || "16:00")}"></label>
      <label class="hint">فاصل ${sel("pc-gap", [2, 3, 5, 10, 15], cfg.gapMin, n => n + " دقائق")}</label>
      <label class="hint">حد يومي ${sel("pc-cap", [20, 30, 40, 60, 80], cfg.dailyCap, n => n + " رسالة")}</label>
    </div>
    <label class="lbl" for="pc-sig">التوقيع (يختم به مازن كل رسالة)</label>
    <textarea class="field" id="pc-sig" rows="4" maxlength="400">${esc(cfg.signature || "")}</textarea>
    <p class="hint">التباعد ونافذة الإرسال والحد اليومي تحمي سمعة بريد الشركة من التصنيف كرسائل مزعجة. يعمل مازن وسالم في دوامهم فقط، وكل دورة تُحسب من حدود اشتراكك في Claude.</p>
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-pact="cfg-save"><span class="lbl-text">حفظ الإعدادات</span></button></div>
  </div>`;
}

function renderProspectsView() {
  const box = $("#prospectsBody");
  if (!box || state.view !== "prospects") return;
  const tools = `<div class="sh-pad row-actions">
      <button type="button" class="btn btn-line sm" data-pact="run"${state.prospectsBusy ? " disabled" : ""}><span class="lbl-text">ابحث واكتب الآن</span></button>
      <button type="button" class="btn btn-line sm" data-pact="cfg-toggle" aria-pressed="${state.prospectsCfgOpen}"><span class="lbl-text">الإعدادات</span></button></div>`;
  if (state.prospectsLoading) { box.innerHTML = tools + skeleton(); return; }
  if (!state.prospects) {
    box.innerHTML = tools + empty(ICON.alert, "تعذر تحميل منشآت مازن", state.prospectsError || "", `<button type="button" class="btn btn-line" data-pact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`);
    return;
  }
  const p = state.prospects, s = p.stats || {}, by = s.byStatus || {}, t = s.today || {}, mailer = p.mailer || {}, inbox = p.inbox || {};
  const count = tab => tab.match ? tab.match.reduce((n, st) => n + (by[st] || 0), 0) : s.total || 0;
  const tab = PROSPECT_TABS.find(x => x.id === state.prospectsFilter) || PROSPECT_TABS[0];
  const items = p.items.filter(x => !tab.match || tab.match.includes(x.status));
  const sendable = items.filter(x => SELECTABLE.includes(x.status) && x.email).map(x => x.id);
  const picked = [...state.prospectsSel];
  const progress = `<div class="sh-pad p-progress">
      <div class="x-nums">
        <div class="x-num"><b>${t.found || 0} / ${s.dailyTarget || 20}</b><span>منشآت اليوم</span></div>
        <div class="x-num" data-tone="${count(PROSPECT_TABS[0]) ? "ok" : ""}"><b>${count(PROSPECT_TABS[0])}</b><span>تنتظر موافقتك</span></div>
        <div class="x-num"><b>${count(PROSPECT_TABS[3])}</b><span>في الطابور</span></div>
        <div class="x-num"><b>${t.sent || 0}</b><span>أُرسل اليوم</span></div>
        <div class="x-num" data-tone="${s.followDue ? "warn" : ""}"><b>${s.followDue || 0}</b><span>متابعات مستحقة</span></div>
        <div class="x-num" data-tone="${s.repliesToday ? "ok" : ""}"><b>${s.repliesToday || 0}</b><span>ردود اليوم</span></div>
        <div class="x-num"><b>${s.replyRate === null || s.replyRate === undefined ? "—" : s.replyRate + "%"}</b><span>معدل الرد</span></div>
      </div>
      <p class="hint">${mailer.online ? `البريد: يرسل من <span class="mono ltr">${esc(mailer.from)}</span> عبر العامل على جهازك.` : mailer.from
        ? `<span class="p-note">عامل البريد غير متصل الآن؛ ما توافق عليه ينتظر في الطابور حتى يتصل.</span>`
        : `<span class="p-note">لم يتصل عامل البريد بعد: أضف SMTP_* في worker/.env وشغّل start-worker. يمكنك الإرسال يدوياً حتى ذلك الحين.</span>`}
        ${p.webReady ? "" : ` <span class="p-note">البحث في الإنترنت يحتاج عامل Claude (AI_ENGINE=claude والعامل شغّال).</span>`}</p>
      <p class="hint">${inbox.online ? `الوارد: يقرأ العامل ردود رسائل مازن تلقائياً (آخر قراءة ${ltr(inbox.seen)})؛ الرد يوقف المتابعة، وطلب الإيقاف والارتداد يُستبعدان.`
        : inbox.seen ? `<span class="p-note">قراءة الوارد متوقفة منذ ${ltr(inbox.seen)}؛ تأكد أن العامل شغّال. حتى ذلك الحين اضغط «ردّوا» عند وصول رد.</span>`
        : `<span class="p-note">قراءة الوارد غير مفعلة بعد: تعمل تلقائياً ببيانات SMTP في worker/.env (أو IMAP_*). حتى ذلك الحين اضغط «ردّوا» عند وصول رد.</span>`}</p>
    </div>`;
  const intro = `<p class="hint sh-pad">لا يُرسل شيء قبل موافقتك. البريد من الموقع الرسمي لكل منشأة فقط ويتحقق الخادم أنه مكتوب في الصفحة؛ والرسائل يكتبها مازن من مستجدات السوق التي يرصدها نواف وفيصل، ويدققها سالم. بعد ${esc(String((p.cfg || {}).followUpDays || 5))} أيام بلا رد يكتب مازن متابعة في نفس المحادثة تنتظر موافقتك.</p>`;
  const tabs = `<div class="seg-ctl office-tabs" role="tablist">${PROSPECT_TABS.map(x => `<button type="button" data-ptab="${x.id}" aria-pressed="${tab.id === x.id}">${x.label} (${count(x)})</button>`).join("")}</div>`;
  const bulk = sendable.length ? `<div class="sh-pad row-actions p-bulk">
      <label class="remember"><input type="checkbox" data-psel-all${sendable.every(id => state.prospectsSel.has(id)) ? " checked" : ""}> تحديد الكل (${sendable.length})</label>
      <button type="button" class="btn btn-primary sm" data-pact="send-picked"${picked.length ? "" : " disabled"}>${ICON.send}<span class="lbl-text">أرسل المحدد (${picked.length}) من بريد الشركة</span></button>
    </div>` : "";
  box.innerHTML = tools + (state.prospectsCfgOpen ? prospectsCfgHtml(p.cfg) : "") + progress + intro + tabs + bulk
    + `<div class="list">${items.map(prospectItemHtml).join("") || empty(ICON.search, "لا توجد منشآت هنا", tab.id === "approve" ? "يجهز مازن منشآت اليوم تلقائياً في دوامه، أو اضغط «ابحث واكتب الآن»." : "")}</div>`;
}

async function prospectsSend(btn, body, okMessage) {
  const stop = btn ? busy(btn, "جاري الحفظ") : () => {};
  try { const d = await api(body); acceptProspects(d); if (okMessage) toast(typeof okMessage === "function" ? okMessage(d) : okMessage, "ok"); return d; }
  catch (e) { toast(officeError(e), "bad"); return null; }
  finally { stop(); renderProspectsView(); }
}

async function prospectsQueue(btn, ids) {
  if (!ids.length) return;
  const mailer = (state.prospects && state.prospects.mailer) || {};
  const from = mailer.from ? "من " + mailer.from : "من بريد الشركة";
  if (!confirm(`إرسال ${ids.length} ${ids.length === 1 ? "رسالة" : "رسائل"} ${from}؟\nتُرسل متباعدة في أيام وساعات الإرسال، ويمكنك إلغاء أي رسالة من «الطابور» قبل موعدها.`)) return;
  const d = await prospectsSend(btn, { action: "prospects_queue", ids }, d => {
    const q = d.queue || {};
    return q.queued ? `أُضيفت ${q.queued} إلى طابور الإرسال: من ${q.first} إلى ${q.last}` + (q.skipped ? ` · تُخطّيت ${q.skipped}` : "") : "لم تُضف أي رسالة";
  });
  if (d) { ids.forEach(id => state.prospectsSel.delete(id)); renderProspectsView(); }
}

async function prospectsAction(btn) {
  const act = btn.dataset.pact, id = btn.dataset.id;
  const item = id && state.prospects ? state.prospects.items.find(x => x.id === id) : null;
  if (act === "reload") return loadProspects();
  if (act === "cfg-toggle") { state.prospectsCfgOpen = !state.prospectsCfgOpen; return renderProspectsView(); }
  if (act === "send-picked") return prospectsQueue(btn, [...state.prospectsSel]);
  if (act === "cfg-save") {
    const f = btn.closest("[data-pcfg]"), n = k => Number(field(f, k).value);
    const cfg = { sectors: [...f.querySelectorAll("[data-psector]:checked")].map(i => i.value), cities: field(f, "pc-cities").value.split(/[،,]/).map(s => s.trim()).filter(Boolean),
      dailyTarget: n("pc-target"), perRun: n("pc-per"), enabled: field(f, "pc-on").checked, everyHours: n("pc-every"),
      followUpDays: n("pc-fudays"), maxFollowUps: n("pc-fumax"), sendDays: readDays(f, "pcd"), sendFrom: field(f, "pc-from").value, sendTo: field(f, "pc-to").value,
      gapMin: n("pc-gap"), dailyCap: n("pc-cap"), signature: field(f, "pc-sig").value };
    if (!cfg.sectors.length || !cfg.cities.length) { toast("اختر قطاعاً ومدينة على الأقل", "warn"); return; }
    if (!cfg.sendDays.length) { toast("اختر يوم إرسال واحداً على الأقل", "warn"); return; }
    if (await prospectsSend(btn, { action: "prospects_cfg", cfg }, "حُفظت إعدادات مازن وحُدّث مشغله")) state.prospectsCfgOpen = false;
    return renderProspectsView();
  }
  if (act === "run") {
    if (state.prospectsBusy) return;
    state.prospectsBusy = true;
    const stop = busy(btn, "مازن يعمل");
    toast("يكتب مازن المتابعات والمسودات المنتظرة ويدققها سالم، ثم يبحث عن منشآت جديدة حتى هدف اليوم؛ قد يستغرق ثلاث إلى خمس دقائق.", "none");
    try {
      const d = await api({ action: "prospects_run" });
      acceptProspects(d);
      const r = d.run || {};
      toast((r.target ? `${r.target.sector} · ${r.target.city}: ` : "") + `منشآت جديدة ${r.found || 0} · مسودات ${r.drafted || 0} · متابعات ${r.followUps || 0}`
        + (r.today ? ` · اليوم ${r.today.found}/${(d.stats || {}).dailyTarget || 20}` : ""), "ok");
    } catch (e) { toast(officeError(e), "bad"); }
    finally { state.prospectsBusy = false; stop(); renderProspectsView(); }
    return;
  }
  if (!item) return;
  if (act === "send1") return prospectsQueue(btn, [id]);
  if (act === "unqueue") return prospectsSend(btn, { action: "prospects_unqueue", id }, "أُلغيت من الطابور");
  if (act === "edit") { state.prospectsEdit = id; renderProspectsView(); const t = $("#pe-body"); if (t) t.focus(); return; }
  if (act === "cancel") { state.prospectsEdit = ""; return renderProspectsView(); }
  if (act === "save") {
    const f = btn.closest("[data-pform]");
    const ok = await prospectsSend(btn, { action: "prospects_update", id, email: field(f, "pe-email").value, subject: field(f, "pe-subject").value, body: field(f, "pe-body").value }, "حُفظت الرسالة");
    if (ok) { state.prospectsEdit = ""; renderProspectsView(); }
    return;
  }
  const status = { sentManual: PST.sent, replied: PST.replied, exclude: PST.excluded, restore: item.body ? PST.ready : PST.check }[act];
  if (!status) return;
  if (act === "exclude" && !confirm((item.sentAt ? "إيقاف المتابعة مع " : "استبعاد ") + item.company + "؟ لن يراسلها مازن مجدداً.")) return;
  const msg = { sentManual: "سُجّلت كمرسلة؛ تبدأ مدة المتابعة من الآن", replied: "رائع! سُجّل الرد، واقترح مازن الرسالة مثالاً في العقل", exclude: "استُبعدت", restore: "أُعيدت" }[act];
  return prospectsSend(btn, { action: "prospects_update", id, status }, msg);
}

// التحديد: مربع لكل رسالة، و«تحديد الكل» للرسائل القابلة للإرسال في التبويب الحالي
function prospectsSelect(input) {
  if (input.hasAttribute("data-psel-all")) {
    const tab = PROSPECT_TABS.find(x => x.id === state.prospectsFilter) || PROSPECT_TABS[0];
    state.prospects.items.filter(x => (!tab.match || tab.match.includes(x.status)) && SELECTABLE.includes(x.status) && x.email)
      .forEach(x => { if (input.checked) state.prospectsSel.add(x.id); else state.prospectsSel.delete(x.id); });
  } else if (input.checked) state.prospectsSel.add(input.dataset.psel); else state.prospectsSel.delete(input.dataset.psel);
  renderProspectsView();
}
