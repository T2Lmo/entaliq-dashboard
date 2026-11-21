"use strict";
// عروض تدقيق الطاقة لسلطان (Audits.gs): باقات بأسعارك لكل م²، عرض يكتب سلطان خطابه ويدققه سالم، وطباعته، وسجله حتى تسليم التقرير.

const AUDIT_TABS = [
  { id: "offers", label: "العروض", match: ["عرض مسودة", "أُرسل العرض"] },
  { id: "running", label: "الجارية", match: ["قُبل"] },
  { id: "done", label: "المنتهية", match: ["سُلّم التقرير", "مرفوض", "ملغى"] },
  { id: "prices", label: "الأسعار والباقات" }
];
const AU_TONE = { "عرض مسودة": "none", "أُرسل العرض": "warn", "قُبل": "ok", "سُلّم التقرير": "ok", "مرفوض": "bad", "ملغى": "bad" };
const auWeeks = n => voiceNum(n, ["", "أسبوع واحد", "أسبوعان", "أسابيع", "أسبوعاً"]);
const auDays = n => voiceNum(n, ["", "يوم واحد", "يومان", "أيام", "يوماً"]);
const auMoney = n => n === null || n === undefined || n === "" ? "—" : Math.round(Number(n)).toLocaleString("en-US") + " ريال";

async function loadAudits() {
  if (!state.url || !hasAuth()) { state.auditsError = "اربط اللوحة بالخادم أولاً."; renderAuditsView(); return; }
  if (!state.audits) { state.auditsLoading = true; renderAuditsView(); }
  try { acceptAudits(await api({ action: "audits_get" })); state.auditsError = ""; }
  catch (e) { state.auditsError = officeError(e); }
  finally { state.auditsLoading = false; renderAuditsView(); }
}
function acceptAudits(d) { state.audits = { items: d.items || [], cfg: d.cfg || { packages: [], addons: [] }, buildingTypes: d.buildingTypes || [], stats: d.stats || {}, priced: !!d.priced }; }
const auPkg = id => ((state.audits && state.audits.cfg.packages) || []).find(p => p.id === id) || { name: id, includes: [] };

// نفس حساب الخادم، للمعاينة فقط (الخادم يعيد الحساب عند الإصدار)
function auPrice(pkg, area, addonIds, cfg) {
  if (!pkg || !(pkg.rate > 0) || !(area > 0)) return null;
  const base = Math.round(Math.max(pkg.min || 0, area * pkg.rate));
  const picked = cfg.addons.filter(a => addonIds.indexOf(a.id) >= 0);
  if (picked.some(a => a.price === null)) return { missing: picked.filter(a => a.price === null).map(a => a.name) };
  const addonsValue = picked.reduce((s, a) => s + Math.round(a.price), 0), value = base + addonsValue, vat = Math.round(value * cfg.vatPct / 100);
  return { base, addonsValue, value, vat, total: value + vat };
}

// ---------------- الرسم ----------------
function renderAuditsView() {
  const box = $("#auditsBody");
  if (!box || state.view !== "audits") return;
  if (!state.audits) {
    box.innerHTML = state.auditsLoading ? skeleton() : empty(ICON.alert, "تعذر تحميل عروض التدقيق", state.auditsError || "", `<button type="button" class="btn btn-line" data-auact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`);
    return;
  }
  const d = state.audits, s = d.stats, tab = AUDIT_TABS.find(t => t.id === state.auditsTab) || AUDIT_TABS[0];
  const nums = `<div class="sh-pad"><div class="x-nums">
      <div class="x-num" data-tone="${s.drafts ? "warn" : ""}"><b>${s.drafts || 0}</b><span>مسودات تنتظر إرسالها</span></div>
      <div class="x-num"><b>${s.sent || 0}</b><span>مرسلة · ${esc(auMoney(s.openValue))} مفتوحة</span></div>
      <div class="x-num" data-tone="${s.running ? "ok" : ""}"><b>${s.running || 0}</b><span>تدقيقات جارية</span></div>
      <div class="x-num"><b>${s.delivered || 0}</b><span>سُلّمت تقاريرها</span></div></div></div>`;
  const tabs = `<div class="sh-pad row-actions"><div class="seg-ctl" role="tablist">${AUDIT_TABS.map(t => `<button type="button" data-autab="${t.id}" aria-pressed="${t.id === tab.id}">${t.label}${t.match ? " (" + d.items.filter(a => t.match.includes(a.status)).length + ")" : ""}</button>`).join("")}</div>
    <button type="button" class="btn btn-primary sm" data-auact="new"><span class="lbl-text">+ عرض تدقيق جديد</span></button></div>`;
  const warn = d.priced ? "" : `<p class="health-fix sh-pad">لم تُضبط أسعار الباقات بعد. اضبطها من «الأسعار والباقات»؛ سلطان لا يُصدر عرضاً بلا سعر.</p>`;
  const form = state.auditsNew ? auditsNewHtml(d.cfg) : "";
  const body = tab.id === "prices" ? auditsPricesHtml(d.cfg)
    : `<div class="list">${d.items.filter(a => tab.match.includes(a.status)).map(auditItemHtml).join("") || `<p class="hint sh-pad">${tab.id === "offers" ? "اضغط «+ عرض تدقيق جديد»، أو من صفقة في مسار المبيعات اضغط «عرض تدقيق طاقة»." : "لا شيء هنا."}</p>`}</div>`;
  box.innerHTML = nums + tabs + warn + form + body;
  if (state.auditsNew) auditsPreview();
}

function auditsNewHtml(cfg) {
  const pre = state.auditsPrefill || {}, types = state.audits.buildingTypes;
  const priced = cfg.packages.filter(p => p.rate > 0);
  return `<div class="sh-pad office-form" data-auform>
    <h3 class="news-title">عرض تدقيق طاقة جديد${pre.dealId ? ` <small class="muted">لصفقة ${esc(pre.client || "")}</small>` : ""}</h3>
    <div class="cn-grid">
      <label class="lbl">العميل<input class="input" id="au-client" maxlength="150" value="${esc(pre.client || "")}" placeholder="اسم المنشأة"></label>
      <label class="lbl">المدينة<input class="input" id="au-city" maxlength="60" value="${esc(pre.city || "")}"></label>
      <label class="lbl">جهة الاتصال<input class="input" id="au-contact" maxlength="150" value="${esc(pre.contact || "")}" placeholder="الاسم والمسمى"></label>
      <label class="lbl">السجل التجاري<input class="input ltr" id="au-cr" maxlength="30"></label>
      <label class="lbl">الموقع / العنوان<input class="input" id="au-address" maxlength="200"></label>
      <label class="lbl">نوع المبنى<select class="input" id="au-type">${types.map(t => `<option${t === pre.buildingType ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <label class="lbl">المساحة المكيّفة (م²)<input class="input ltr" id="au-area" type="number" min="10" step="10"></label>
      <label class="lbl">الأدوار<input class="input ltr" id="au-floors" type="number" min="1"></label>
      <label class="lbl">عدد المباني<input class="input ltr" id="au-buildings" type="number" min="1" value="1"></label>
      <label class="lbl">فاتورة الطاقة السنوية (ريال، اختياري)<input class="input ltr" id="au-bill" type="number" min="0" step="1000"></label>
      <label class="lbl">الباقة<select class="input" id="au-pkg">${priced.map(p => `<option value="${esc(p.id)}"${p.id === "detailed" ? " selected" : ""}>${esc(p.name)} — ${esc(p.level)}</option>`).join("") || `<option value="">اضبط الأسعار أولاً</option>`}</select></label>
    </div>
    ${cfg.addons.length ? `<span class="lbl">إضافات</span><div class="day-checks">${cfg.addons.map(a => `<label><input type="checkbox" data-auaddon value="${esc(a.id)}"> ${esc(a.name)}${a.price === null ? " <small class='muted'>(بلا سعر)</small>" : " · " + esc(auMoney(a.price))}</label>`).join("")}</div>` : ""}
    <label class="lbl" for="au-note">ملاحظات للعرض (اختياري)</label>
    <textarea class="field" id="au-note" rows="2" maxlength="500" placeholder="مثال: يعمل المستشفى 24 ساعة، ولديه مبنى عيادات منفصل">${esc(pre.note || "")}</textarea>
    <div class="cn-preview" data-aupreview></div>
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-auact="create"${state.auditsBusy ? " disabled" : ""}><span class="lbl-text">اكتب العرض</span></button>
      <button type="button" class="btn btn-line sm" data-auact="new-cancel"><span class="lbl-text">إلغاء</span></button></div>
    <p class="hint">يحسب الخادم القيمة من أسعارك، ويكتب سلطان خطاب التقديم وملاحظات النطاق الخاصة بالمبنى، ويدققها سالم. لا أرقام وفر في العرض؛ الوفر يُقدَّر في التقرير بعد القياس.</p>
  </div>`;
}

function auditsReadForm(f) {
  const v = id => field(f, id) ? field(f, id).value : "";
  return { client: v("au-client"), city: v("au-city"), contact: v("au-contact"), cr: v("au-cr"), address: v("au-address"), buildingType: v("au-type"), area: Number(v("au-area")),
    floors: v("au-floors"), buildings: v("au-buildings"), annualBill: v("au-bill"), pkg: v("au-pkg"), addons: [...f.querySelectorAll("[data-auaddon]:checked")].map(i => i.value),
    note: v("au-note"), source: (state.auditsPrefill || {}).source || "", dealId: (state.auditsPrefill || {}).dealId || "" };
}

function auditsPreview() {
  const f = $("[data-auform]"), box = f && f.querySelector("[data-aupreview]");
  if (!box) return;
  const x = auditsReadForm(f), cfg = state.audits.cfg, pkg = cfg.packages.find(p => p.id === x.pkg), p = auPrice(pkg, x.area, x.addons, cfg);
  const bill = Number(x.annualBill), intensity = bill > 0 && x.area > 0 ? Math.round(bill / x.area * 10) / 10 : null;
  box.innerHTML = !p ? `<p class="hint">اكتب المساحة واختر باقة لترى القيمة.</p>`
    : p.missing ? `<p class="health-fix">حدد سعر «${esc(p.missing.join("، "))}» من «الأسعار والباقات» أولاً.</p>`
    : `<p><b>${esc(pkg.name)}</b> · ${x.area.toLocaleString("en-US")} م² · ${auWeeks(pkg.weeks)}: الباقة ${esc(auMoney(p.base))}${p.addonsValue ? " + إضافات " + esc(auMoney(p.addonsValue)) : ""}
      = ${esc(auMoney(p.value))} + ضريبة ${cfg.vatPct}% ${esc(auMoney(p.vat))} = <b>${esc(auMoney(p.total))}</b></p>${intensity ? `<p class="hint">تكلفة الطاقة الحالية: ${intensity} ريال لكل م² سنوياً (من الفاتورة التي ذكرتها).</p>` : ""}`;
}

function auditItemHtml(a) {
  const p = auPkg(a.pkg), b = (act, label, cls) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-auact="${act}" data-id="${esc(a.id)}"><span class="lbl-text">${label}</span></button>`;
  const adds = (state.audits.cfg.addons || []).filter(x => (a.addons || []).indexOf(x.id) >= 0).map(x => x.name);
  const acts = {
    "عرض مسودة": b("print", "اطبع العرض", "btn-primary") + b("sent", "أُرسل للعميل") + b("regen", "أعد كتابة الخطاب") + b("cancel", "ألغِ"),
    "أُرسل العرض": b("print", "اطبع العرض") + b("accept", "قبل العميل", "btn-primary") + b("reject", "رفض العميل"),
    "قُبل": b("print", "اطبع العرض") + b("delivered", "سُلّم التقرير", "btn-primary")
  }[a.status] || b("print", "اطبع العرض");
  return `<article class="item audit" data-status="${esc(a.status)}">
    <div class="item-head"><b>${esc(a.client)}</b><small class="muted">${esc(a.buildingType)} · ${Number(a.area).toLocaleString("en-US")} م²${a.city ? " · " + esc(a.city) : ""}</small>
      <span class="badge" data-tone="${AU_TONE[a.status] || "none"}" style="margin-inline-start:auto">${esc(a.status)}</span><b class="deal-value">${esc(auMoney(a.total))}</b></div>
    <p class="hint">${esc(p.name)} · ${auWeeks(a.weeks)}${adds.length ? " · " + esc(adds.join("، ")) : ""} · ${esc(ltr(a.at))}${a.score !== null && a.score !== undefined ? ` · <span class="badge" data-tone="${a.score >= 70 ? "ok" : "warn"}">سالم ${a.score}%</span>` : ""}${a.intensity ? " · " + a.intensity + " ريال/م² سنوياً" : ""}</p>
    ${a.intro ? `<details class="vmsg-more"><summary>خطاب سلطان</summary><p class="deal-note">${esc(a.intro)}</p>${a.scopeNotes ? `<ul>${a.scopeNotes.split("\n").map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</details>` : ""}
    <div class="row-actions">${acts}${a.dealId ? b("deal", "افتح الصفقة") : ""}</div></article>`;
}

function auditsPricesHtml(cfg) {
  const n = v => v === null || v === undefined ? "" : esc(v);
  return `<div class="sh-pad office-form" data-auprices>
    <p class="hint">السعر لكل متر مربع من المساحة المكيّفة، مع حد أدنى للعرض. الباقة بلا سعر لا تظهر في العروض. والإضافة بلا سعر لا يمكن اختيارها.</p>
    ${cfg.packages.map((p, i) => `<div class="cn-pkg" data-aupkg="${i}" data-id="${esc(p.id)}">
      <div class="cn-grid">
        <label class="lbl">اسم الباقة<input class="input" data-k="name" value="${esc(p.name)}" maxlength="40"></label>
        <label class="lbl">المستوى<input class="input" data-k="level" value="${esc(p.level)}" maxlength="60"></label>
        <label class="lbl">ريال لكل م²<input class="input ltr" data-k="rate" type="number" min="0" step="0.5" value="${n(p.rate)}"></label>
        <label class="lbl">الحد الأدنى (ريال)<input class="input ltr" data-k="min" type="number" min="0" step="500" value="${n(p.min)}"></label>
        <label class="lbl">أيام الموقع<input class="input ltr" data-k="siteDays" type="number" min="0" value="${n(p.siteDays)}"></label>
        <label class="lbl">أيام القياس<input class="input ltr" data-k="measureDays" type="number" min="0" value="${n(p.measureDays)}"></label>
        <label class="lbl">المدة (أسابيع)<input class="input ltr" data-k="weeks" type="number" min="1" value="${n(p.weeks)}"></label>
      </div>
      <label class="lbl">ما تتضمنه (سطر لكل بند)</label><textarea class="field" data-k="includes" rows="4">${esc(p.includes.join("\n"))}</textarea>
    </div>`).join("")}
    <h3 class="news-title">الإضافات</h3>
    ${cfg.addons.map((a, i) => `<div class="row-actions" data-auadd="${i}" data-id="${esc(a.id)}"><input class="input grow" data-k="name" value="${esc(a.name)}" maxlength="80">
      <label class="hint">السعر <input class="input ltr" data-k="price" type="number" min="0" step="500" value="${n(a.price)}" style="width:120px"></label></div>`).join("")}
    <div class="cn-grid">
      <label class="lbl">ضريبة القيمة المضافة %<input class="input ltr" id="aup-vat" type="number" min="0" max="30" value="${n(cfg.vatPct)}"></label>
      <label class="lbl">صلاحية العرض (أيام)<input class="input ltr" id="aup-days" type="number" min="7" max="90" value="${n(cfg.offerDays)}"></label>
      <label class="lbl">طريقة الدفع<input class="input" id="aup-pay" maxlength="200" value="${esc(cfg.payment)}"></label>
      <label class="lbl">الموقّع عن انطلق<input class="input" id="aup-sign" maxlength="120" value="${esc(cfg.signatory)}" placeholder="الاسم والمسمى"></label>
    </div>
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-auact="save-prices"><span class="lbl-text">حفظ الأسعار والباقات</span></button></div>
  </div>`;
}

// ---------------- العرض المطبوع ----------------
function auditDocHtml(a) {
  const cfg = state.audits.cfg, p = auPkg(a.pkg), today = new Date().toISOString().slice(0, 10);
  const row = (k, v) => v === "" || v === null || v === undefined ? "" : `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`;
  const adds = cfg.addons.filter(x => (a.addons || []).indexOf(x.id) >= 0);
  const building = `<table class="pd-t">${row("العميل", a.client)}${row("السجل التجاري", a.cr)}${row("جهة الاتصال", a.contact)}${row("المدينة", a.city)}${row("الموقع", a.address)}
    ${row("نوع المبنى", a.buildingType)}${row("المساحة المكيّفة", Number(a.area).toLocaleString("en-US") + " م²")}${row("الأدوار", a.floors)}${row("عدد المباني", a.buildings)}
    ${a.annualBill ? row("فاتورة الطاقة السنوية (كما أفاد العميل)", auMoney(a.annualBill)) + row("تكلفة الطاقة لكل م² سنوياً", a.intensity + " ريال") : ""}</table>`;
  const compare = `<table class="pd-t pd-c"><tr><th>الباقة</th><th>المستوى</th><th>أيام الموقع</th><th>أيام القياس</th><th>المدة</th><th>القيمة لهذا المبنى</th></tr>
    ${cfg.packages.filter(x => x.rate > 0).map(x => `<tr${x.id === a.pkg ? ' class="pd-pick"' : ""}><td>${esc(x.name)}</td><td>${esc(x.level)}</td><td>${x.siteDays}</td><td>${x.measureDays || "—"}</td><td>${auWeeks(x.weeks)}</td><td>${esc(auMoney(Math.round(Math.max(x.min || 0, a.area * x.rate))))}</td></tr>`).join("")}</table>`;
  const price = `<table class="pd-t">${row("الباقة: " + p.name, auMoney(a.base))}${adds.map(x => row("إضافة: " + x.name, auMoney(x.price))).join("")}${row("المجموع قبل الضريبة", auMoney(a.value))}
    ${row("ضريبة القيمة المضافة " + cfg.vatPct + "%", auMoney(a.vat))}<tr class="pd-total"><th>الإجمالي</th><td>${esc(auMoney(a.total))}</td></tr>${row("طريقة الدفع", a.payment || cfg.payment)}</table>`;
  const head = `<header class="pd-head"><div><b>انطلق للطاقة</b><span>ENTALIQ ENERGY</span></div><div class="pd-meta">
      <h1>عرض سعر خدمات تدقيق الطاقة</h1><span>الرقم: ${esc(ltr(a.id))} · التاريخ: ${esc(ltr(today))}</span></div></header>`;
  const sign = `<div class="pd-sign"><div><b>عن انطلق للطاقة</b><span>${esc(cfg.signatory || "الاسم والمسمى")}</span><span>التوقيع والختم: ____________</span></div>
      <div><b>اعتماد العميل: ${esc(a.client)}</b><span>${esc(a.contact || "الاسم والمسمى")}</span><span>التوقيع والختم: ____________</span></div></div>`;
  return head + `<p>السادة/ ${esc(a.client)} المحترمين،</p><p>${esc(a.intro)}</p>
    <h2>بيانات المبنى</h2>${building}<h2>مقارنة الباقات</h2>${compare}
    <h2>الباقة المقترحة: ${esc(p.name)} (${esc(p.level)})</h2><ul>${(p.includes || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    ${adds.length ? `<h2>الخدمات الإضافية</h2><ul>${adds.map(x => `<li>${esc(x.name)}</li>`).join("")}</ul>` : ""}
    ${a.scopeNotes ? `<h2>ملاحظات النطاق الخاصة بالمبنى</h2><ul>${a.scopeNotes.split("\n").map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <h2>مدة التنفيذ</h2><p>${auWeeks(p.weeks)} من استلام الفواتير والمخططات والوصول إلى الموقع، تشمل ${auDays(p.siteDays)} من العمل الميداني${p.measureDays ? " و" + auDays(p.measureDays) + " من القياس" : ""}، وتنتهي بتسليم التقرير وعرضه على الإدارة.</p>
    <h2>القيمة</h2>${price}
    <p>تقديرات الوفر وفترات الاسترداد تُحدد في التقرير بناءً على البيانات والقياسات، ولا يتضمن هذا العرض أي التزام بنسبة وفر محددة. صلاحية العرض ${cfg.offerDays} يوماً من تاريخه. للتواصل: https://entaliq.com.sa/ar#contact</p>${sign}`;
}

function printAudit(a) {
  const el = $("#printDoc");
  el.innerHTML = `<article class="pd">${auditDocHtml(a)}</article>`;
  el.hidden = false;
  const done = () => { el.hidden = true; el.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

// ---------------- الإجراءات ----------------
async function auditsSend(btn, body, ok) {
  const stop = btn ? busy(btn, "جاري الحفظ") : () => {};
  try { const d = await api(body); acceptAudits(d); if (ok) toast(ok, "ok"); return d; }
  catch (e) { toast(officeError(e), "bad"); return null; }
  finally { stop(); renderAuditsView(); }
}

async function auditsAction(btn) {
  const act = btn.dataset.auact, id = btn.dataset.id, a = id && state.audits ? state.audits.items.find(x => x.id === id) : null;
  if (act === "reload") return loadAudits();
  if (act === "new") { state.auditsNew = true; if (state.auditsTab === "prices") state.auditsTab = "offers"; renderAuditsView(); const i = $("#au-client"); if (i) i.focus(); return; }
  if (act === "new-cancel") { state.auditsNew = false; state.auditsPrefill = null; return renderAuditsView(); }
  if (act === "create") {
    if (state.auditsBusy) return;
    const input = auditsReadForm(btn.closest("[data-auform]"));
    if (!input.client.trim()) { toast("اكتب اسم العميل", "warn"); return; }
    if (!(input.area >= 10)) { toast("اكتب مساحة المبنى بالمتر المربع", "warn"); return; }
    state.auditsBusy = true;
    const stop = busy(btn, "سلطان يكتب ويدقق سالم");
    try {
      const d = await api({ action: "audits_create", input });
      acceptAudits(d); state.auditsNew = false; state.auditsPrefill = null; state.auditsTab = "offers";
      toast("كتب سلطان العرض ودققه سالم؛ راجعه ثم اطبعه", "ok");
      if (state.pipe) loadPipeline(true);
    } catch (e) { toast(officeError(e), "bad"); }
    finally { state.auditsBusy = false; stop(); renderAuditsView(); }
    return;
  }
  if (act === "save-prices") {
    const f = btn.closest("[data-auprices]"), val = (el, k) => el.querySelector(`[data-k="${k}"]`).value;
    const num = v => v === "" ? null : Number(v);
    const packages = [...f.querySelectorAll("[data-aupkg]")].map(el => ({ id: el.dataset.id, name: val(el, "name"), level: val(el, "level"), rate: num(val(el, "rate")), min: num(val(el, "min")),
      siteDays: num(val(el, "siteDays")), measureDays: num(val(el, "measureDays")), weeks: num(val(el, "weeks")), includes: val(el, "includes").split("\n").map(s => s.trim()).filter(Boolean) }));
    const addons = [...f.querySelectorAll("[data-auadd]")].map(el => ({ id: el.dataset.id, name: val(el, "name"), price: num(val(el, "price")) }));
    const cfg = { packages, addons, vatPct: Number(field(f, "aup-vat").value), offerDays: Number(field(f, "aup-days").value), payment: field(f, "aup-pay").value, signatory: field(f, "aup-sign").value };
    return auditsSend(btn, { action: "audits_cfg", cfg }, "حُفظت أسعار وباقات التدقيق");
  }
  if (!a) return;
  if (act === "print") return printAudit(a);
  if (act === "regen") {
    const stop = busy(btn, "سلطان يكتب");
    try { acceptAudits(await api({ action: "audits_regen", id })); toast("أعاد سلطان كتابة الخطاب ودققه سالم", "ok"); }
    catch (e) { toast(officeError(e), "bad"); }
    finally { stop(); renderAuditsView(); }
    return;
  }
  if (act === "deal") { state.pipeTab = "open"; return openView("pipeline"); }
  const status = { sent: "أُرسل العرض", accept: "قُبل", reject: "مرفوض", delivered: "سُلّم التقرير", cancel: "ملغى" }[act];
  if (!status) return;
  if ((act === "cancel" || act === "reject") && !confirm((act === "cancel" ? "إلغاء عرض " : "تسجيل رفض ") + a.client + "؟")) return;
  await auditsSend(btn, { action: "audits_update", id, status }, { sent: "سُجّل إرسال العرض", accept: "سُجّل قبول العميل؛ ابدأ التدقيق", reject: "سُجّل الرفض", delivered: "سُجّل تسليم التقرير", cancel: "أُلغي العرض" }[act]);
  if (state.pipe) loadPipeline(true);
}

// من صفقة في مسار المبيعات: عرض تدقيق جاهز ببياناتها
function auditsFromDeal(d) {
  state.auditsPrefill = { client: d.company, city: d.city, contact: d.contact, buildingType: d.sector, note: d.note,
    source: d.source === "مازن" || d.source === "الموقع" ? d.sourceId : "", dealId: d.id };
  state.auditsNew = true; state.auditsTab = "offers";
  openView("audits");
}

document.addEventListener("click", e => {
  const t = e.target;
  if (!t.closest("#auditsBody")) return;
  const tab = t.closest("[data-autab]");
  if (tab) { state.auditsTab = tab.dataset.autab; return renderAuditsView(); }
  const b = t.closest("[data-auact]");
  if (b) auditsAction(b);
});
document.addEventListener("input", e => { if (e.target.closest && e.target.closest("[data-auform]")) auditsPreview(); });
document.addEventListener("change", e => { if (e.target.closest && e.target.closest("[data-auform]")) auditsPreview(); });
