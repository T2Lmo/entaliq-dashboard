"use strict";
// مازن (Prospects.gs): منشآت سعودية تناسب وهج وانطلق، ببريدها الرسمي المنشور ومسودة يدققها سالم؛ أنت ترسل من بريدك

const PROSPECT_TABS = ["جاهز للإرسال", "تحقق يدوي", "بانتظار المسودة", "أُرسل", "ردّوا", "مستبعد", ""];
const PROSPECT_SECTORS = ["فنادق", "مستشفيات", "مولات ومراكز تجارية", "مجمعات سكنية", "شركات ومبانٍ إدارية"];
const PROSPECT_TONE = { "جاهز للإرسال": "ok", "تحقق يدوي": "warn", "بانتظار المسودة": "none", "أُرسل": "none", "ردّوا": "ok", "مستبعد": "bad" };

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
  state.prospects = { items: d.items || [], stats: d.stats || {}, cfg: d.cfg || {}, webReady: !!d.webReady };
  state.prospectsStats = d.stats || null; state.prospectsAt = Date.now();
  if (state.loaded) renderStage(computeMetrics());
}

function prospectMailto(p) {
  return "mailto:" + encodeURIComponent(p.email) + "?subject=" + encodeURIComponent(p.subject) + "&body=" + encodeURIComponent(p.body);
}
function prospectGmail(p) {
  return "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(p.email) + "&su=" + encodeURIComponent(p.subject) + "&body=" + encodeURIComponent(p.body);
}
const safeHref = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "";

function prospectItemHtml(p) {
  const b = (act, label, cls) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-pact="${act}" data-id="${esc(p.id)}"><span class="lbl-text">${label}</span></button>`;
  const editing = state.prospectsEdit === p.id;
  const site = safeHref(p.website), src = safeHref(p.emailSource);
  const verifiedTone = p.verified === "موثّق من الصفحة" || p.verified === "عدّلته يدوياً" ? "ok" : p.verified === "غير موثّق" ? "warn" : "none";
  const score = p.score === null || p.score === undefined ? "" : `<span class="badge" data-tone="${tone(p.score)}" title="تقدير سالم للمسودة">سالم ${p.score}%</span>`;
  const head = `<div class="item-head">${avatar(PROSPECTS_AGENT, "xs")}<b>${esc(p.company)}</b><small class="muted">${esc(p.sector)} · ${esc(p.city)}</small>
      ${p.service ? `<span class="tag">${esc(p.service)}</span>` : ""}${score}
      <span class="badge" data-tone="${PROSPECT_TONE[p.status] || "none"}" style="margin-inline-start:auto">${esc(p.status)}</span></div>`;
  const contact = `<div class="p-line">
      ${site ? `<a class="tag" href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(p.domain || site)}${ICON.ext}</a>` : ""}
      ${p.email ? `<span class="mono ltr">${esc(p.email)}</span>` : `<span class="hint">لا بريد منشوراً</span>`}
      <span class="badge" data-tone="${verifiedTone}">${esc(p.verified || "—")}</span>
      ${src ? `<a class="tag" href="${esc(src)}" target="_blank" rel="noopener noreferrer">${p.email ? "مصدر البريد" : "صفحة التواصل"}${ICON.ext}</a>` : ""}
    </div>${p.note ? `<p class="hint p-note">${esc(p.note)}</p>` : ""}${p.why ? `<p class="hint">${esc(p.why)}</p>` : ""}`;
  let draft = "";
  if (editing) draft = `<div class="office-form" data-pform="${esc(p.id)}">
      <label class="lbl" for="pe-email">البريد</label><input class="input ltr" id="pe-email" value="${esc(p.email)}" placeholder="info@…">
      <label class="lbl" for="pe-subject">الموضوع</label><input class="input" id="pe-subject" maxlength="150" value="${esc(p.subject)}">
      <label class="lbl" for="pe-body">الرسالة</label><textarea class="field" id="pe-body" rows="12" maxlength="6000">${esc(p.body)}</textarea>
      <div class="row-actions">${b("save", "حفظ", "btn-primary")}${b("cancel", "إلغاء")}</div></div>`;
  else if (p.body) draft = `<p class="p-subject"><b>الموضوع:</b> ${esc(p.subject)}</p><div class="p-body">${esc(p.body)}</div>`;
  else draft = `<p class="hint">يكتب مازن المسودة في الدورة القادمة، ثم يدققها سالم.</p>`;
  const send = p.body && p.email && !editing ? `<a class="btn btn-primary sm" href="${esc(prospectMailto(p))}">${ICON.send}<span class="lbl-text">افتح في بريدي</span></a>
      <a class="btn btn-line sm" href="${esc(prospectGmail(p))}" target="_blank" rel="noopener noreferrer">${ICON.ext}<span class="lbl-text">Gmail</span></a>` : "";
  const copy = p.body && !editing ? copyButton(p.subject + "\n\n" + p.body, "نسخ الرسالة") : "";
  const acts = editing ? "" : {
    "جاهز للإرسال": b("sent", "أرسلتها") + b("edit", "تعديل") + b("exclude", "استبعد"),
    "تحقق يدوي": b("sent", "أرسلتها") + b("edit", "تعديل") + b("exclude", "استبعد"),
    "بانتظار المسودة": b("exclude", "استبعد"),
    "أُرسل": b("replied", "ردّوا", "btn-primary") + b("restore", "لم أرسلها"),
    "ردّوا": b("unreply", "إرجاع لـ«أُرسل»"),
    "مستبعد": b("restore", "إرجاع")
  }[p.status] || "";
  return `<article class="item p-item">${head}${contact}${draft}
    ${p.status === "تحقق يدوي" && !editing ? `<p class="hint">افتح مصدر البريد وتأكد منه قبل الإرسال، أو عدّله.</p>` : ""}
    <div class="row-actions">${send}${copy}${acts}</div></article>`;
}

function prospectsCfgHtml(cfg) {
  const sectors = Array.from(new Set(PROSPECT_SECTORS.concat(cfg.sectors || [])));
  return `<div class="sh-pad office-form" data-pcfg>
    <h3 class="news-title">إعدادات مازن</h3>
    <span class="lbl">القطاعات</span><div class="day-checks">${sectors.map(s => `<label><input type="checkbox" data-psector value="${esc(s)}"${(cfg.sectors || []).includes(s) ? " checked" : ""}> ${esc(s)}</label>`).join("")}</div>
    <label class="lbl" for="pc-cities">المدن (افصل بينها بفاصلة)</label>
    <input class="input" id="pc-cities" value="${esc((cfg.cities || []).join("، "))}">
    <div class="row-actions">
      <label class="hint">منشآت في كل دورة <select class="input" id="pc-per">${[1, 2, 3, 4, 5].map(n => `<option${n === cfg.perRun ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="remember"><input type="checkbox" id="pc-on"${cfg.enabled ? " checked" : ""}> يعمل تلقائياً</label>
      <label class="hint">كل <select class="input" id="pc-every">${[2, 4, 6, 8, 12].map(n => `<option value="${n}"${n === cfg.everyHours ? " selected" : ""}>${n} ساعات</option>`).join("")}</select></label>
    </div>
    <p class="hint">يتنقل بين القطاعات والمدن بالتناوب، ولا يعمل إلا ومازن وسالم في دوامهم. كل دورة تُحسب من حدود اشتراكك في Claude.</p>
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-pact="cfg-save"><span class="lbl-text">حفظ الإعدادات</span></button></div>
  </div>`;
}

function renderProspectsView() {
  const box = $("#prospectsBody");
  if (!box || state.view !== "prospects") return;
  const tools = `<div class="sh-pad row-actions">
      <button type="button" class="btn btn-primary sm" data-pact="run"${state.prospectsBusy ? " disabled" : ""}><span class="lbl-text">ابحث واكتب الآن</span></button>
      <button type="button" class="btn btn-line sm" data-pact="cfg-toggle" aria-pressed="${state.prospectsCfgOpen}"><span class="lbl-text">الإعدادات</span></button></div>`;
  if (state.prospectsLoading) { box.innerHTML = tools + skeleton(); return; }
  if (!state.prospects) {
    box.innerHTML = tools + empty(ICON.alert, "تعذر تحميل منشآت مازن", state.prospectsError || "", `<button type="button" class="btn btn-line" data-pact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`);
    return;
  }
  const p = state.prospects, s = p.stats || {}, by = s.byStatus || {};
  const intro = `<p class="hint sh-pad">مازن لا يرسل شيئاً. البريد من الموقع الرسمي لكل منشأة فقط، ويتحقق الخادم أنه مكتوب في الصفحة نفسها؛ ما لم يتحقق يظهر في «تحقق يدوي». أنت ترسل من بريدك، ثم اضغط «أرسلتها». إن ظهرت الرسالة ناقصة في برنامج البريد فاستخدم «Gmail» أو «نسخ الرسالة».</p>
    ${p.webReady ? "" : `<p class="msg bad sh-pad">البحث في الإنترنت يحتاج عامل Claude على جهازك (AI_ENGINE=claude والعامل شغّال). كتابة المسودات للمنشآت المحفوظة تعمل بدونه.</p>`}
    <p class="hint sh-pad">المجموع ${s.total || 0} · جاهز ${by["جاهز للإرسال"] || 0} · أُرسل ${s.sent || 0} · ردّوا ${by["ردّوا"] || 0}${s.replyRate !== null && s.replyRate !== undefined ? ` (${s.replyRate}%)` : ""}${s.draftAvg !== null && s.draftAvg !== undefined ? ` · متوسط تقدير سالم للمسودات ${s.draftAvg}%` : ""}</p>`;
  const tabs = `<div class="seg-ctl office-tabs" role="tablist">${PROSPECT_TABS.map(t => `<button type="button" data-ptab="${esc(t)}" aria-pressed="${state.prospectsFilter === t}">${t || "الكل"}${t ? ` (${by[t] || 0})` : ` (${s.total || 0})`}</button>`).join("")}</div>`;
  const items = p.items.filter(x => !state.prospectsFilter || x.status === state.prospectsFilter);
  box.innerHTML = tools + (state.prospectsCfgOpen ? prospectsCfgHtml(p.cfg) : "") + intro + tabs
    + `<div class="list">${items.map(prospectItemHtml).join("") || empty(ICON.search, "لا توجد منشآت بهذه الحالة", state.prospectsFilter === "جاهز للإرسال" ? "اضغط «ابحث واكتب الآن»، أو انتظر دورة مازن التلقائية." : "")}</div>`;
}

async function prospectsSend(btn, body, okMessage) {
  const stop = busy(btn, "جاري الحفظ");
  try { acceptProspects(await api(body)); if (okMessage) toast(okMessage, "ok"); return true; }
  catch (e) { toast(officeError(e), "bad"); return false; }
  finally { stop(); renderProspectsView(); }
}

async function prospectsAction(btn) {
  const act = btn.dataset.pact, id = btn.dataset.id;
  const item = id && state.prospects ? state.prospects.items.find(x => x.id === id) : null;
  if (act === "reload") return loadProspects();
  if (act === "cfg-toggle") { state.prospectsCfgOpen = !state.prospectsCfgOpen; return renderProspectsView(); }
  if (act === "cfg-save") {
    const f = btn.closest("[data-pcfg]");
    const cfg = { sectors: [...f.querySelectorAll("[data-psector]:checked")].map(i => i.value), cities: field(f, "pc-cities").value.split(/[،,]/).map(s => s.trim()).filter(Boolean),
      perRun: Number(field(f, "pc-per").value), enabled: field(f, "pc-on").checked, everyHours: Number(field(f, "pc-every").value) };
    if (!cfg.sectors.length || !cfg.cities.length) { toast("اختر قطاعاً ومدينة على الأقل", "warn"); return; }
    if (await prospectsSend(btn, { action: "prospects_cfg", cfg }, "حُفظت إعدادات مازن وحُدّث مشغله")) state.prospectsCfgOpen = false;
    return renderProspectsView();
  }
  if (act === "run") {
    if (state.prospectsBusy) return;
    state.prospectsBusy = true;
    const stop = busy(btn, "مازن يبحث ويكتب");
    toast("يبحث مازن في المواقع الرسمية ويتحقق من البريد، ثم يكتب المسودات ويدققها سالم؛ قد يستغرق ثلاث إلى خمس دقائق.", "none");
    try {
      const d = await api({ action: "prospects_run" });
      acceptProspects(d);
      const r = d.run || {};
      toast((r.target ? `${r.target.sector} · ${r.target.city}: ` : "") + `منشآت جديدة ${r.found || 0} · مسودات ${r.drafted || 0}` + (r.pending ? ` · تنتظر المسودة ${r.pending}` : ""), "ok");
    } catch (e) { toast(officeError(e), "bad"); }
    finally { state.prospectsBusy = false; stop(); renderProspectsView(); }
    return;
  }
  if (!item) return;
  if (act === "edit") { state.prospectsEdit = id; renderProspectsView(); const t = $("#pe-body"); if (t) t.focus(); return; }
  if (act === "cancel") { state.prospectsEdit = ""; return renderProspectsView(); }
  if (act === "save") {
    const f = btn.closest("[data-pform]");
    const ok = await prospectsSend(btn, { action: "prospects_update", id, email: field(f, "pe-email").value, subject: field(f, "pe-subject").value, body: field(f, "pe-body").value }, "حُفظت الرسالة");
    if (ok) { state.prospectsEdit = ""; renderProspectsView(); }
    return;
  }
  const status = { sent: "أُرسل", replied: "ردّوا", exclude: "مستبعد", restore: item.status === "مستبعد" || item.status === "أُرسل" ? (item.body ? "جاهز للإرسال" : "تحقق يدوي") : "", unreply: "أُرسل" }[act];
  if (!status) return;
  if (act === "exclude" && !confirm("استبعاد " + item.company + "؟ لن يقترحها مازن مجدداً.")) return;
  const msg = { sent: "سُجّلت كمرسلة", replied: "رائع! سُجّل الرد، واقترح مازن الرسالة مثالاً في العقل", exclude: "استُبعدت", restore: "أُعيدت", unreply: "أُعيدت إلى «أُرسل»" }[act];
  return prospectsSend(btn, { action: "prospects_update", id, status }, msg);
}
