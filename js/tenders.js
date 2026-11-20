"use strict";
// بدر (Tenders.gs): المنافسات والمناقصات — فرص حكومية وخاصة وترسيات، بحكم يناسب وضع المكتب، ولوحة جاهزية

const TENDER_TABS = [
  { id: "open", label: "فرص مفتوحة" },
  { id: "awards", label: "ترسيات للشراكة" },
  { id: "work", label: "نجهزها وقدّمنا" },
  { id: "closed", label: "منتهية ومستبعدة" },
  { id: "all", label: "الكل" },
  { id: "ready", label: "الجاهزية" }
];
const T_OPEN = ["جديد", "نتابعها", "نجهز العرض"];
const VERDICT_TONE = { "تقدّم مباشرة": "ok", "بعد التسجيل في اعتماد": "warn", "كمقاول باطن أو شريك": "none", "تجاهل": "bad" };
const tenderTab = t => {
  if (t.kind === "ترسية") return T_OPEN.includes(t.status) ? "awards" : "closed";
  if (["نجهز العرض", "قُدّم", "فزنا", "لم نفز"].includes(t.status)) return "work";
  if (T_OPEN.includes(t.status) && t.verdict !== "تجاهل") return "open";
  return "closed";
};

// مؤشرا بدر في البطاقات: قراءة خفيفة كل 5 دقائق على الأكثر
async function syncTenders(force) {
  if (!state.url || !hasAuth() || state.officeUnsupported || state.tendersUnsupported) return;
  if (!force && state.tendersStats && Date.now() - state.tendersAt < 300000) return;
  state.tendersAt = Date.now();
  try {
    const d = await api({ action: "tenders_get", statsOnly: true });
    state.tendersStats = d.stats;
    if (state.loaded) renderStage(computeMetrics());
  } catch (e) { if (/نص المهمة فارغ/.test(e.message)) state.tendersUnsupported = true; }
}

async function loadTenders() {
  if (!state.url || !hasAuth()) { state.tendersError = "اربط اللوحة بالخادم أولاً."; renderTendersView(); return; }
  state.tendersLoading = !state.tenders; renderTendersView();
  try { acceptTenders(await api({ action: "tenders_get" })); state.tendersError = ""; }
  catch (e) { state.tendersError = officeError(e); }
  finally { state.tendersLoading = false; renderTendersView(); }
}
function acceptTenders(d) {
  state.tenders = { items: d.items || [], stats: d.stats || {}, cfg: d.cfg || {}, profile: d.profile || {}, readiness: d.readiness || {}, webReady: !!d.webReady };
  state.tendersStats = d.stats || null; state.tendersAt = Date.now();
  if (state.loaded) renderStage(computeMetrics());
}

function tenderItemHtml(t) {
  const b = (act, label, cls) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-tact="${act}" data-id="${esc(t.id)}"><span class="lbl-text">${label}</span></button>`;
  const link = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "";
  const days = t.daysLeft, urgent = days !== null && days !== undefined && days <= 3 && days >= 0 && T_OPEN.includes(t.status);
  const dates = [t.questionsBy ? "الاستفسارات حتى " + ltr(t.questionsBy) : "", t.bidsBy ? "العروض حتى " + ltr(t.bidsBy) + (days !== null && days !== undefined && days >= 0 ? " (بعد " + days + " " + (days === 1 ? "يوم" : "أيام") + ")" : "") : "",
    t.openingAt ? "فتح العروض " + ltr(t.openingAt) : ""].filter(Boolean).join(" · ");
  const facts = [t.ref ? "الرقم " + t.ref : "", t.booklet ? "الكراسة " + t.booklet : "", t.value ? "القيمة التقديرية " + Number(t.value).toLocaleString("en-US") + " ريال" : "",
    t.worksType && t.worksType !== "غير محدد" ? t.worksType : "", t.needsEtimad === "نعم" ? "يحتاج اعتماد" : "", t.needsClass === "نعم" ? "يحتاج تصنيف" : t.needsClass === "غير معروف" ? "التصنيف غير معروف" : ""].filter(Boolean).join(" · ");
  const award = t.kind === "ترسية";
  const acts = {
    "جديد": award ? (t.prospectId ? "" : b("mazen", "حوّلها لمازن", "btn-primary")) + b("exclude", "استبعد")
      : b("follow", "نتابعها") + b("prepare", "نجهز العرض", "btn-primary") + b("sultan", "اطلب من سلطان المستندات والعرض") + b("exclude", "استبعد"),
    "نتابعها": award ? (t.prospectId ? "" : b("mazen", "حوّلها لمازن", "btn-primary")) + b("exclude", "استبعد")
      : b("prepare", "نجهز العرض", "btn-primary") + b("sultan", "اطلب من سلطان المستندات والعرض") + b("exclude", "استبعد"),
    "نجهز العرض": b("submitted", "قدّمنا العرض", "btn-primary") + b("sultan", "اطلب من سلطان المستندات والعرض") + b("exclude", "استبعد"),
    "قُدّم": b("won", "فزنا", "btn-primary") + b("lost", "لم نفز"),
    "مستبعدة": b("restore", "إرجاع"),
    "انتهت": ""
  }[t.status] || "";
  return `<article class="item t-item${urgent ? " t-urgent" : ""}">
    <div class="item-head">${avatar(TENDERS_AGENT, "xs")}<b>${esc(t.title)}</b>
      <span class="badge" data-tone="${VERDICT_TONE[t.verdict] || "none"}" style="margin-inline-start:auto">${esc(t.verdict)}</span></div>
    <div class="p-line"><span class="tag">${esc(t.kind)}</span>${t.entity ? `<span>${esc(t.entity)}</span>` : ""}${t.city ? `<small class="muted">${esc(t.city)}</small>` : ""}
      ${t.fit !== null && t.fit !== undefined ? `<span class="badge" data-tone="${tone(t.fit)}" title="ملاءمة لخدماتنا">ملاءمة ${t.fit}%</span>` : ""}
      <span class="badge" data-tone="none">${esc(t.status)}</span>
      ${link(t.url) ? `<a class="tag" href="${esc(link(t.url))}" target="_blank" rel="noopener noreferrer">${esc(t.source || "الإعلان")}${ICON.ext}</a>` : t.source ? `<small class="muted">${esc(t.source)}</small>` : ""}</div>
    ${dates ? `<p class="hint${urgent ? " t-due" : ""}">${dates}</p>` : ""}${facts ? `<p class="hint">${esc(facts)}</p>` : ""}
    ${award && t.winner ? `<p class="p-line"><b>الفائز:</b> ${esc(t.winner)}${link(t.winnerSite) ? ` <a class="tag" href="${esc(link(t.winnerSite))}" target="_blank" rel="noopener noreferrer">موقعه${ICON.ext}</a>` : ""}${t.winnerEmail ? ` <span class="mono ltr">${esc(t.winnerEmail)}</span>` : ""}${t.prospectId ? ` <span class="badge" data-tone="ok">عند مازن</span>` : ""}</p>` : ""}
    ${t.services ? `<p class="hint"><b>خدماتنا:</b> ${esc(t.services)}</p>` : ""}${t.requirements ? `<p class="hint"><b>المتطلبات:</b> ${esc(t.requirements)}</p>` : ""}
    ${t.why ? `<p class="hint">${esc(t.why)}</p>` : ""}${t.next ? `<p class="hint"><b>الخطوة التالية:</b> ${esc(t.next)}</p>` : ""}${t.note ? `<p class="hint p-note">${esc(t.note)}</p>` : ""}
    <div class="row-actions">${acts}</div></article>`;
}

function tendersReadyHtml(p, r) {
  const docs = (r.docs || p.docs || []);
  const item = (key, label, hint) => `<label class="t-check"><input type="checkbox" data-tprof="${key}"${p[key] ? " checked" : ""}> <span><b>${label}</b><small class="hint">${hint}</small></span></label>`;
  return `<div class="sh-pad office-form" data-tready>
    <div class="x-nums"><div class="x-num" data-tone="${r.percent >= 70 ? "ok" : r.percent >= 40 ? "warn" : "bad"}"><b>${r.percent || 0}%</b><span>جاهزية المكتب للمناقصات</span></div>
      <div class="x-num" data-tone="${(r.expiring || []).length ? "warn" : ""}"><b>${(r.expiring || []).length}</b><span>مستندات تنتهي خلال 30 يوماً</span></div>
      <div class="x-num" data-tone="${(r.missing || []).length ? "warn" : ""}"><b>${(r.missing || []).length}</b><span>مستندات بلا تاريخ</span></div></div>
    <h3 class="news-title">الخطوات</h3>
    ${item("etimad", "حساب مورد في اعتماد", "شرط شراء الكراسات وتقديم العروض الحكومية؛ يحتاج عادة السجل التجاري والزكاة والضريبة والتأمينات ونطاقات والغرفة وخطاب الآيبان.")}
    ${item("aramco", "التسجيل كمورد لدى أرامكو والجهات الكبرى", "يفتح طلبات عروض القطاع الخاص الكبيرة.")}
    ${item("tarshid", "التأهل لدى ترشيد", "شركة خدمات الطاقة الحكومية؛ مشاريع كفاءة الطاقة في المباني الحكومية تمر عبرها.")}
    ${item("esco", "رخصة تدقيق الطاقة / تأهيل شركات خدمات الطاقة", "تدقيق الطاقة للمباني يتطلب رخصة.")}
    ${item("classified", "تصنيف المقاولين", "إلزامي للمشاريع الحكومية بعقد 500 ألف ريال فأكثر؛ بدونه ادخلها مع مقاول مصنّف.")}
    <input class="input" id="tp-class" placeholder="درجة التصنيف ومجاله إن وجد" value="${esc(p.classNote || "")}">
    <p class="hint">روابط: <a href="https://etimad.sa" target="_blank" rel="noopener noreferrer">اعتماد</a> · <a href="https://www.aramco.com/ar/what-we-do/suppliers/become-a-supplier" target="_blank" rel="noopener noreferrer">الموردون لدى أرامكو</a> · <a href="https://balady.gov.sa" target="_blank" rel="noopener noreferrer">بلدي (تصنيف المقاولين)</a>. تحقق من المتطلبات الحالية في كل منصة.</p>
    <h3 class="news-title">مستندات الشركة وتواريخ انتهائها</h3>
    <div class="t-docs">${docs.map((d, i) => {
      const tn = d.days === null || d.days === undefined ? "none" : d.days < 0 ? "bad" : d.days <= 30 ? "warn" : "ok";
      const label = d.days === null || d.days === undefined ? "بلا تاريخ" : d.days < 0 ? "منتهية" : "باقي " + d.days + " يوماً";
      return `<div class="t-doc" data-tdoc="${i}"><input class="input" data-tdoc-name value="${esc(d.name)}"><input class="input" type="date" data-tdoc-exp value="${esc(d.expires || "")}"><span class="badge" data-tone="${tn}">${label}</span></div>`;
    }).join("")}</div>
    <div class="row-actions"><button type="button" class="btn btn-line sm" data-tact="doc-add"><span class="lbl-text">+ مستند</span></button>
      <button type="button" class="btn btn-primary sm" data-tact="ready-save"><span class="lbl-text">حفظ الجاهزية</span></button></div>
    <p class="hint">بعد الحفظ يعيد بدر الحكم على الفرص المفتوحة حسب وضعكم الجديد، وتظهر المستندات القريبة من الانتهاء في ملخص راكان.</p>
  </div>`;
}

function renderTendersView() {
  const box = $("#tendersBody");
  if (!box || state.view !== "tenders") return;
  const tools = `<div class="sh-pad row-actions">
      <button type="button" class="btn btn-primary sm" data-tact="run"${state.tendersBusy ? " disabled" : ""}><span class="lbl-text">ارصد الآن</span></button>
      <button type="button" class="btn btn-line sm" data-tact="add-toggle" aria-pressed="${state.tendersAddOpen}"><span class="lbl-text">أضف منافسة</span></button>
      <button type="button" class="btn btn-line sm" data-tact="cfg-toggle" aria-pressed="${state.tendersCfgOpen}"><span class="lbl-text">الإعدادات</span></button></div>`;
  if (state.tendersLoading) { box.innerHTML = tools + skeleton(); return; }
  if (!state.tenders) {
    box.innerHTML = tools + empty(ICON.alert, "تعذر تحميل منافسات بدر", state.tendersError || "", `<button type="button" class="btn btn-line" data-tact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`);
    return;
  }
  const d = state.tenders, s = d.stats || {}, cfg = d.cfg || {};
  const add = state.tendersAddOpen ? `<div class="sh-pad office-form" data-tadd>
      <label class="lbl" for="ta-text">انسخ نص المنافسة من اعتماد أو من موقع الجهة والصقه هنا</label>
      <textarea class="field" id="ta-text" rows="7" maxlength="12000" placeholder="العنوان، الجهة، الرقم المرجعي، المواعيد، المتطلبات…"></textarea>
      <label class="lbl" for="ta-url">الرابط (اختياري)</label><input class="input ltr" id="ta-url" placeholder="https://…">
      <div class="row-actions"><button type="button" class="btn btn-primary sm" data-tact="add"><span class="lbl-text">حلّل وأضف</span></button></div></div>` : "";
  const settings = state.tendersCfgOpen ? `<div class="sh-pad office-form" data-tcfg>
      <div class="row-actions"><label class="remember"><input type="checkbox" id="tc-on"${cfg.enabled ? " checked" : ""}> رصد يومي</label>
        <label class="hint">الساعة ${hourSelect("tc-hour", cfg.hour)}</label>
        <label class="hint">فرص ${`<select class="input" id="tc-per">${[3, 4, 5, 6, 8].map(n => `<option${n === cfg.perRun ? " selected" : ""}>${n}</option>`).join("")}</select>`}</label>
        <label class="hint">ترسيات ${`<select class="input" id="tc-aw">${[0, 1, 2, 3, 5].map(n => `<option${n === cfg.awards ? " selected" : ""}>${n}</option>`).join("")}</select>`}</label></div>
      <label class="lbl" for="tc-kw">كلمات إضافية للبحث (اختياري)</label><input class="input" id="tc-kw" value="${esc(cfg.keywords || "")}" placeholder="مثل: صيانة محطات، عدادات ذكية للمدارس">
      <p class="hint">يتنقل بدر يومياً بين خمسة مجالات: الطاقة الشمسية وصيانتها، كفاءة الطاقة وتدقيقها، التكييف والتبريد، إدارة المباني والعدادات، الإنارة الموفرة. يعمل فقط وهو في دوامه، والرصد يحتاج عامل Claude.</p>
      <div class="row-actions"><button type="button" class="btn btn-primary sm" data-tact="cfg-save"><span class="lbl-text">حفظ</span></button></div></div>` : "";
  const counts = {};
  d.items.forEach(t => { const k = tenderTab(t); counts[k] = (counts[k] || 0) + 1; });
  counts.all = d.items.length;
  const tab = TENDER_TABS.find(x => x.id === state.tendersTab) || TENDER_TABS[0];
  const tabs = `<div class="seg-ctl office-tabs" role="tablist">${TENDER_TABS.map(x => `<button type="button" data-ttab="${x.id}" aria-pressed="${tab.id === x.id}">${x.label}${x.id === "ready" ? ` (${(d.readiness || {}).percent || 0}%)` : ` (${counts[x.id] || 0})`}</button>`).join("")}</div>`;
  const summary = `<div class="sh-pad"><div class="x-nums">
      <div class="x-num" data-tone="${s.open ? "ok" : ""}"><b>${s.open || 0}</b><span>فرص مفتوحة مناسبة</span></div>
      <div class="x-num" data-tone="${s.dueSoon ? "warn" : ""}"><b>${s.dueSoon || 0}</b><span>مواعيد خلال 7 أيام</span></div>
      <div class="x-num"><b>${s.awards || 0}</b><span>ترسيات للشراكة</span></div>
      <div class="x-num"><b>${s.fitAvg === null || s.fitAvg === undefined ? "—" : s.fitAvg + "%"}</b><span>متوسط الملاءمة</span></div>
    </div>${d.webReady ? "" : `<p class="hint p-note">الرصد اليومي يحتاج عامل Claude (AI_ENGINE=claude والعامل شغّال). إضافة منافسة بلصق نصها تعمل دائماً.</p>`}</div>`;
  const intro = `<p class="hint sh-pad">منصة اعتماد محمية من القراءة الآلية؛ يرصد بدر ما تنشره الجهات علناً والأخبار، وتستطيع لصق أي منافسة تراها في اعتماد. الحكم يُحسب من «الجاهزية»: ما يحتاج تصنيفاً أو كان ترسية يُقترح عبر الشراكة مع مقاول مصنّف، وما يحتاج اعتماد يظهر «بعد التسجيل في اعتماد».</p>`;
  const body = tab.id === "ready" ? tendersReadyHtml(d.profile || {}, d.readiness || {})
    : `<div class="list">${d.items.filter(t => tab.id === "all" || tenderTab(t) === tab.id).sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)).map(tenderItemHtml).join("")
      || empty(ICON.search, "لا توجد فرص هنا", tab.id === "open" ? "اضغط «ارصد الآن» أو «أضف منافسة»، أو انتظر رصد بدر اليومي." : "")}</div>`;
  box.innerHTML = tools + add + settings + summary + intro + tabs + body;
}

async function tendersSend(btn, body, okMessage) {
  const stop = btn ? busy(btn, "جاري الحفظ") : () => {};
  try { const d = await api(body); acceptTenders(d); if (okMessage) toast(typeof okMessage === "function" ? okMessage(d) : okMessage, "ok"); return d; }
  catch (e) { toast(officeError(e), "bad"); return null; }
  finally { stop(); renderTendersView(); }
}

async function tendersAction(btn) {
  const act = btn.dataset.tact, id = btn.dataset.id;
  const t = id && state.tenders ? state.tenders.items.find(x => x.id === id) : null;
  if (act === "reload") return loadTenders();
  if (act === "add-toggle") { state.tendersAddOpen = !state.tendersAddOpen; return renderTendersView(); }
  if (act === "cfg-toggle") { state.tendersCfgOpen = !state.tendersCfgOpen; return renderTendersView(); }
  if (act === "run" || act === "add") {
    if (state.tendersBusy) return;
    const body = act === "run" ? { action: "tenders_run" } : { action: "tenders_add", text: field($("[data-tadd]"), "ta-text").value, url: field($("[data-tadd]"), "ta-url").value };
    if (act === "add" && body.text.trim().length < 60 && !/^https?:\/\//i.test(body.url.trim())) { toast("الصق نص المنافسة (60 حرفاً على الأقل) أو رابطها", "warn"); return; }
    state.tendersBusy = true;
    const stop = busy(btn, act === "run" ? "بدر يرصد" : "بدر يحلل");
    if (act === "run") toast("يبحث بدر في مواقع الجهات والأخبار عن فرص اليوم والترسيات الحديثة؛ قد يستغرق ثلاث إلى خمس دقائق.", "none");
    try {
      const d = await api(body);
      acceptTenders(d);
      if (act === "run") { const r = d.run || {}; toast(`${r.topic ? r.topic.split(":")[0] + ": " : ""}فرص جديدة ${r.found || 0} · ترسيات ${r.awards || 0}` + (r.skipped ? ` · مكررة ${r.skipped}` : ""), "ok"); }
      else { const a = d.items.find(x => x.id === d.added); state.tendersAddOpen = false; toast("أضاف بدر المنافسة: " + (a ? a.verdict : ""), "ok"); }
    } catch (e) { toast(officeError(e), "bad"); }
    finally { state.tendersBusy = false; stop(); renderTendersView(); }
    return;
  }
  if (act === "cfg-save") {
    const f = $("[data-tcfg]");
    const cfg = { enabled: field(f, "tc-on").checked, hour: Number(field(f, "tc-hour").value), perRun: Number(field(f, "tc-per").value), awards: Number(field(f, "tc-aw").value), keywords: field(f, "tc-kw").value };
    if (await tendersSend(btn, { action: "tenders_cfg", cfg }, "حُفظت إعدادات بدر وحُدّث مشغله")) state.tendersCfgOpen = false;
    return renderTendersView();
  }
  if (act === "doc-add") {
    const r = state.tenders.readiness = state.tenders.readiness || {};
    r.docs = tendersReadDocs().concat([{ name: "", expires: "", days: null }]);
    state.tenders.profile = Object.assign({}, state.tenders.profile, tendersReadProfile());
    return renderTendersView();
  }
  if (act === "ready-save") {
    const profile = Object.assign(tendersReadProfile(), { docs: tendersReadDocs().filter(x => x.name.trim()).map(x => ({ name: x.name.trim(), expires: x.expires })) });
    return tendersSend(btn, { action: "tenders_profile", profile }, d => "حُفظت الجاهزية (" + ((d.readiness || {}).percent || 0) + "%)، وأُعيد الحكم على الفرص المفتوحة");
  }
  if (!t) return;
  if (act === "sultan") {
    if (!state.office) await syncOffice(true);
    if (!state.office) { toast(state.officeError || "تعذر تحميل حالة الوكلاء.", "bad"); return; }
    const task = `جهّز لمنافسة «${t.title}» لدى ${t.entity || "الجهة"}${t.ref ? " (رقم " + t.ref + ")" : ""}${t.bidsBy ? "، آخر موعد للعروض " + t.bidsBy : ""}:\n`
      + "1) قائمة المستندات المطلوبة للتقديم وما ينقصنا منها.\n2) هيكل العرض الفني (الفهم، المنهجية، الجدول، الفريق، الخبرات) مرتبطاً بخدماتنا في ملف الشركة.\n3) أسئلة نرسلها للجهة قبل موعد الاستفسارات.\n"
      + (t.requirements ? "المتطلبات المذكورة: " + t.requirements + "\n" : "") + (t.services ? "خدماتنا المناسبة: " + t.services : "");
    return openAgentDlg("سلطان", "assign", { task });
  }
  if (act === "mazen") return tendersSend(btn, { action: "tenders_to_mazen", id }, "حُوّلت لمازن؛ يكتب رسالة شراكة للفائز في دورته القادمة");
  const status = { follow: "نتابعها", prepare: "نجهز العرض", submitted: "قُدّم", won: "فزنا", lost: "لم نفز", exclude: "مستبعدة", restore: "جديد" }[act];
  if (!status) return;
  const msg = { follow: "نتابعها", prepare: "بدأنا تجهيز العرض", submitted: "سُجّل التقديم", won: "مبروك! سُجّل الفوز", lost: "سُجّلت النتيجة", exclude: "استُبعدت", restore: "أُعيدت" }[act];
  return tendersSend(btn, { action: "tenders_update", id, status }, msg);
}

function tendersReadProfile() {
  const f = $("[data-tready]"), on = k => { const i = f && f.querySelector(`[data-tprof="${k}"]`); return !!(i && i.checked); };
  return { etimad: on("etimad"), aramco: on("aramco"), tarshid: on("tarshid"), esco: on("esco"), classified: on("classified"), classNote: f ? field(f, "tp-class").value : "" };
}
function tendersReadDocs() {
  return [...document.querySelectorAll("[data-tdoc]")].map(r => ({ name: r.querySelector("[data-tdoc-name]").value, expires: r.querySelector("[data-tdoc-exp]").value, days: null }));
}
