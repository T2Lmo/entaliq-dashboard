"use strict";
// عقود صيانة وتشغيل الطاقة الشمسية (Contracts.gs): عروض وعقود بأسعارك، يكتب سلطان نصها ويدققه سالم، وسجل للزيارات والتجديد

const CONTRACTS_WRITER = "سلطان";
const CN_TABS = [
  { id: "offers", label: "العروض", match: ["عرض مسودة", "أُرسل العرض"] },
  { id: "active", label: "العقود السارية", match: ["ساري"] },
  { id: "visits", label: "الزيارات القادمة", match: null },
  { id: "closed", label: "منتهية ومرفوضة", match: ["منتهي", "مرفوض", "ملغى"] },
  { id: "prices", label: "الأسعار والباقات", match: null }
];
const CN_TONE = { "عرض مسودة": "none", "أُرسل العرض": "warn", "ساري": "ok", "مرفوض": "bad", "منتهي": "none", "ملغى": "bad" };
const MOUNTINGS = ["سطح مبنى", "مظلات مواقف", "أرضي", "مختلط"];
const money = n => n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US") + " ريال";

async function loadContracts() {
  if (!state.url || !hasAuth()) { state.contractsError = "اربط اللوحة بالخادم أولاً."; renderContractsView(); return; }
  state.contractsLoading = !state.contracts; renderContractsView();
  try { acceptContracts(await api({ action: "contracts_get" })); state.contractsError = ""; }
  catch (e) { state.contractsError = officeError(e); }
  finally { state.contractsLoading = false; renderContractsView(); }
}
function acceptContracts(d) { state.contracts = { items: d.items || [], cfg: d.cfg || { packages: [] }, stats: d.stats || {}, priced: !!d.priced }; }
const cnPkg = id => ((state.contracts && state.contracts.cfg.packages) || []).find(p => p.id === id) || { name: id, includes: [] };
const cnAnnual = (p, kwp) => p.rate > 0 ? Math.round(Math.max(p.min || 0, kwp * p.rate)) : null;

// ---------------- النموذج: عرض جديد ----------------
function contractsNewHtml(cfg) {
  const pre = state.contractsPrefill || {};
  const today = new Date(); today.setDate(today.getDate() + 7);
  const start = today.toISOString().slice(0, 10);
  return `<div class="sh-pad office-form" data-cnform>
    <h3 class="news-title">عرض صيانة وتشغيل جديد</h3>
    <div class="cn-grid">
      <label class="lbl">العميل<input class="input" id="cn-client" value="${esc(pre.client || "")}" placeholder="اسم المنشأة"></label>
      <label class="lbl">المدينة<input class="input" id="cn-city" value="${esc(pre.city || "")}"></label>
      <label class="lbl">الموقع / العنوان<input class="input" id="cn-address"></label>
      <label class="lbl">جهة الاتصال<input class="input" id="cn-contact" placeholder="الاسم والمسمى (اختياري)"></label>
      <label class="lbl">القدرة (kWp)<input class="input" id="cn-kwp" type="number" min="1" step="0.1"></label>
      <label class="lbl">عدد الألواح<input class="input" id="cn-panels" type="number" min="0"></label>
      <label class="lbl">العاكس<input class="input" id="cn-inverter" placeholder="الشركة والطراز (اختياري)"></label>
      <label class="lbl">نوع التركيب<select class="input" id="cn-mount">${MOUNTINGS.map(m => `<option>${m}</option>`).join("")}</select></label>
      <label class="lbl">الباقة<select class="input" id="cn-pkg">${cfg.packages.map(p => `<option value="${esc(p.id)}"${p.id === "standard" ? " selected" : ""}${p.rate > 0 ? "" : " disabled"}>${esc(p.name)}${p.rate > 0 ? "" : " (بلا سعر)"}</option>`).join("")}</select></label>
      <label class="lbl">المدة بالأشهر<input class="input" id="cn-term" type="number" min="3" max="60" value="${cfg.termMonths || 12}"></label>
      <label class="lbl">تاريخ البداية<input class="input" id="cn-start" type="date" value="${start}"></label>
      <label class="lbl">السجل التجاري للعميل<input class="input" id="cn-cr" placeholder="اختياري"></label>
    </div>
    <label class="remember"><input type="checkbox" id="cn-mon"> المراقبة عن بُعد متاحة (عداد ذكي أو ربط بالعاكس)</label>
    <label class="lbl" for="cn-note">ملاحظات عن الموقع</label><textarea class="field" id="cn-note" rows="2" maxlength="500" placeholder="مثل: سطح بارتفاع 8 أدوار، لا يوجد مصدر ماء قريب"></textarea>
    <p class="hint" id="cn-preview"></p>
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-cnact="create"><span class="lbl-text">أنشئ العرض (يكتبه سلطان ويدققه سالم)</span></button>
      <button type="button" class="btn btn-line sm" data-cnact="new-cancel"><span class="lbl-text">إلغاء</span></button></div>
  </div>`;
}
function contractsPreview() {
  const f = $("[data-cnform]"), out = $("#cn-preview");
  if (!f || !out || !state.contracts) return;
  const kwp = Number(field(f, "cn-kwp").value), term = Number(field(f, "cn-term").value) || 12, p = cnPkg(field(f, "cn-pkg").value);
  const annual = kwp > 0 ? cnAnnual(p, kwp) : null;
  if (annual === null) { out.textContent = ""; return; }
  const value = Math.round(annual * term / 12), vat = Math.round(value * (state.contracts.cfg.vatPct || 15) / 100);
  out.textContent = `باقة ${p.name}: ${money(annual)} سنوياً · قيمة ${term} شهراً ${money(value)} + الضريبة ${money(vat)} = ${money(value + vat)}`;
}

// ---------------- البطاقات ----------------
function contractItemHtml(c) {
  const b = (act, label, cls, extra) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-cnact="${act}" data-id="${esc(c.id)}"${extra || ""}><span class="lbl-text">${label}</span></button>`;
  const p = cnPkg(c.pkg), done = c.visits.filter(v => v.done).length;
  const next = c.visits.find(v => !v.done);
  const acts = {
    "عرض مسودة": b("print-offer", "عرض السعر", "btn-primary") + b("print-contract", "العقد") + b("sent", "أُرسل للعميل") + b("regen", "أعد كتابة نص سلطان") + b("cancel", "إلغاء"),
    "أُرسل العرض": b("print-offer", "عرض السعر") + b("print-contract", "العقد") + `<label class="hint">البداية <input class="input" type="date" data-cn-start="${esc(c.id)}" value="${esc(c.start)}"></label>`
      + b("activate", "قبل العميل: فعّل العقد", "btn-primary") + b("rejected", "رفض"),
    "ساري": b("print-contract", "العقد") + b("renew", "جدّد") + b("cancel", "إلغاء العقد"),
    "منتهي": b("renew", "جدّد", "btn-primary"), "مرفوض": b("print-offer", "عرض السعر"), "ملغى": ""
  }[c.status] || "";
  return `<article class="item">
    <div class="item-head">${avatar(CONTRACTS_WRITER, "xs")}<b>${esc(c.client)}</b><small class="muted">${esc(c.city)} · ${esc(String(c.kwp))} kWp · ${esc(c.mounting)}</small>
      <span class="tag">باقة ${esc(p.name)}</span>${c.score !== null && c.score !== undefined ? `<span class="badge" data-tone="${tone(c.score)}">سالم ${c.score}%</span>` : ""}
      <span class="badge" data-tone="${CN_TONE[c.status] || "none"}" style="margin-inline-start:auto">${esc(c.status)}</span></div>
    <p class="hint">${ltr(c.start)} ← ${ltr(c.end)} (${c.termMonths} شهراً) · سنوياً ${money(c.annual)} · الإجمالي شامل الضريبة ${money(c.total)}${c.renewedFrom ? " · تجديد لعقد سابق" : ""}</p>
    ${c.status === "ساري" ? `<p class="hint">الزيارات ${done} من ${c.visits.length}${next ? " · القادمة " + ltr(next.date) + " (" + esc(next.type) + ")" : ""}</p>` : ""}
    ${c.intro ? `<details class="fold"><summary>خطاب سلطان والملاحظات الفنية</summary><div class="fold-body"><p>${esc(c.intro)}</p>${c.siteNotes ? `<ul class="x-list">${c.siteNotes.split("\n").map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div></details>` : ""}
    <div class="row-actions">${acts}</div></article>`;
}

function contractsVisitsHtml(items) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  items.filter(c => c.status === "ساري").forEach(c => c.visits.forEach((v, i) => { if (!v.done) rows.push({ c, v, i }); }));
  rows.sort((a, b) => a.v.date.localeCompare(b.v.date));
  if (!rows.length) return empty(ICON.check, "لا زيارات قادمة", "تظهر هنا زيارات العقود السارية بترتيب موعدها.");
  return `<div class="list">${rows.slice(0, 60).map(({ c, v, i }) => `<article class="item${v.date < today ? " t-urgent" : ""}">
      <div class="item-head"><b>${ltr(v.date)}</b><span>${esc(c.client)}</span><small class="muted">${esc(v.type)} · ${esc(c.city)}</small>
        ${v.date < today ? `<span class="badge" data-tone="bad" style="margin-inline-start:auto">متأخرة</span>` : ""}</div>
      <div class="row-actions"><input class="input" data-cn-vnote="${esc(c.id)}:${i}" placeholder="ملاحظة الزيارة (اختياري)">
        <button type="button" class="btn btn-primary sm" data-cnact="visit-done" data-id="${esc(c.id)}" data-index="${i}"><span class="lbl-text">تمت</span></button></div></article>`).join("")}</div>`;
}

function contractsPricesHtml(cfg) {
  const val = v => v === null || v === undefined ? "" : v;
  const num = (id, v, ph) => `<input class="input" type="number" min="0" step="any" id="${id}" value="${val(v)}" placeholder="${ph || ""}">`;
  const numK = (k, v, ph) => `<input class="input" type="number" min="0" step="any" data-k="${k}" value="${val(v)}" placeholder="${ph || ""}">`;
  return `<div class="sh-pad office-form" data-cnprices>
    <p class="hint">الأسعار تضعها أنت، ولا يُصدر عرض لباقة بلا سعر. السعر السنوي = القدرة (kWp) × سعر الكيلوواط، ولا يقل عن الحد الأدنى. تُضاف الضريبة تلقائياً.</p>
    ${cfg.packages.map((p, i) => `<div class="cn-pkg" data-cnpkg="${i}" data-id="${esc(p.id)}">
      <h3 class="news-title">باقة <input class="input cn-name" data-k="name" value="${esc(p.name)}"></h3>
      <div class="cn-grid">
        <label class="lbl">ريال لكل kWp سنوياً${numK("rate", p.rate, "مثال: 60")}</label>
        <label class="lbl">الحد الأدنى السنوي (ريال)${numK("min", p.min, "اختياري")}</label>
        <label class="lbl">تنظيف في السنة${numK("cleanings", p.cleanings)}</label>
        <label class="lbl">فحص في السنة${numK("inspections", p.inspections)}</label>
        <label class="lbl">الاستجابة للأعطال (ساعة)${numK("responseHours", p.responseHours)}</label>
        <label class="lbl">الطوارئ (ساعة، اختياري)${numK("emergencyHours", p.emergencyHours)}</label>
      </div>
      <label class="remember"><input type="checkbox" data-k="monitoring"${p.monitoring ? " checked" : ""}> مراقبة عن بُعد</label>
      <label class="remember"><input type="checkbox" data-k="monthlyReport"${p.monthlyReport ? " checked" : ""}> تقرير أداء شهري</label>
      <label class="lbl">ما تتضمنه (سطر لكل بند)</label><textarea class="field" data-k="includes" rows="4">${esc((p.includes || []).join("\n"))}</textarea>
    </div>`).join("")}
    <h3 class="news-title">عام</h3>
    <div class="cn-grid">
      <label class="lbl">الضريبة %${num("cp-vat", cfg.vatPct)}</label>
      <label class="lbl">مدة العقد الافتراضية (شهر)${num("cp-term", cfg.termMonths)}</label>
      <label class="lbl">صلاحية العرض (يوم)${num("cp-offer", cfg.offerDays)}</label>
      <label class="lbl">سعر الزيارة الإضافية (ريال)${num("cp-extra", cfg.extraVisit, "اختياري")}</label>
    </div>
    <label class="lbl" for="cp-pay">طريقة الدفع</label><input class="input" id="cp-pay" value="${esc(cfg.payment || "")}">
    <label class="lbl" for="cp-sign">الموقّع عن انطلق (الاسم والمسمى)</label><input class="input" id="cp-sign" value="${esc(cfg.signatory || "")}">
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-cnact="prices-save"><span class="lbl-text">حفظ الأسعار والباقات</span></button></div>
  </div>`;
}

function renderContractsView() {
  const box = $("#contractsBody");
  if (!box || state.view !== "contracts") return;
  const tools = `<div class="sh-pad row-actions"><button type="button" class="btn btn-primary sm" data-cnact="new"><span class="lbl-text">+ عرض صيانة جديد</span></button></div>`;
  if (state.contractsLoading) { box.innerHTML = tools + skeleton(); return; }
  if (!state.contracts) {
    box.innerHTML = tools + empty(ICON.alert, "تعذر تحميل العقود", state.contractsError || "", `<button type="button" class="btn btn-line" data-cnact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`);
    return;
  }
  const d = state.contracts, s = d.stats || {};
  const tab = CN_TABS.find(t => t.id === state.contractsTab) || CN_TABS[0];
  const count = t => t.id === "visits" ? (s.visitsSoon || []).length : t.match ? d.items.filter(c => t.match.includes(c.status)).length : "";
  const summary = `<div class="sh-pad"><div class="x-nums">
      <div class="x-num" data-tone="${s.active ? "ok" : ""}"><b>${s.active || 0}</b><span>عقود سارية</span></div>
      <div class="x-num"><b>${(s.kwp || 0).toLocaleString("en-US")}</b><span>kWp تحت الصيانة</span></div>
      <div class="x-num"><b>${money(s.annualValue || 0)}</b><span>قيمة سنوية</span></div>
      <div class="x-num"><b>${s.offers || 0}</b><span>عروض معلقة</span></div>
      <div class="x-num" data-tone="${(s.visitsSoon || []).some(v => v.late) ? "bad" : (s.visitsSoon || []).length ? "warn" : ""}"><b>${(s.visitsSoon || []).length}</b><span>زيارات خلال 7 أيام</span></div>
      <div class="x-num" data-tone="${(s.renewals || []).length ? "warn" : ""}"><b>${(s.renewals || []).length}</b><span>تجديد خلال 60 يوماً</span></div></div>
    ${d.priced ? "" : `<p class="msg bad">حدد أسعار الباقات أولاً من «الأسعار والباقات»؛ لا يُصدر عرض لباقة بلا سعر.</p>`}
    <p class="hint">بنود العقد قالب ثابت؛ يُنصح بمراجعته مع مستشار قانوني مرة واحدة قبل اعتماده. سلطان يكتب خطاب التقديم والملاحظات الفنية فقط، والأرقام يحسبها النظام من أسعارك.</p></div>`;
  const tabs = `<div class="seg-ctl office-tabs" role="tablist">${CN_TABS.map(t => `<button type="button" data-cntab="${t.id}" aria-pressed="${tab.id === t.id}">${t.label}${count(t) !== "" ? ` (${count(t)})` : ""}</button>`).join("")}</div>`;
  const body = tab.id === "prices" ? contractsPricesHtml(d.cfg) : tab.id === "visits" ? contractsVisitsHtml(d.items)
    : `<div class="list">${d.items.filter(c => tab.match.includes(c.status)).map(contractItemHtml).join("") || empty(ICON.clip, "لا شيء هنا", tab.id === "offers" ? "اضغط «+ عرض صيانة جديد»، أو من مازن اضغط «اعمل عرض صيانة» لمنشأة ردّت." : "")}</div>`;
  box.innerHTML = tools + (state.contractsNew ? contractsNewHtml(d.cfg) : "") + summary + tabs + body;
  contractsPreview();
}

// ---------------- المستند للطباعة: عرض السعر أو العقد ----------------
function contractClauses(c, p, cfg) {
  const sla = `الاستجابة للبلاغات خلال ${p.responseHours} ساعة عمل${p.emergencyHours ? `، وللطوارئ خلال ${p.emergencyHours} ساعات` : ""}.`;
  return [
    ["موضوع العقد", `يقدم الطرف الأول خدمات التشغيل والصيانة الوقائية وتنظيف منظومة الطاقة الشمسية المملوكة للطرف الثاني والموضحة في بيانات المنظومة، وفق باقة «${p.name}» ونطاق العمل وجدول الزيارات الواردة في هذا العقد.`],
    ["نطاق العمل", (p.includes || []).map(x => "• " + x).join("\n")],
    ["مستوى الخدمة", sla + (p.monthlyReport ? " ويقدم الطرف الأول تقرير أداء شهرياً." : "") + " ويُسلَّم تقرير مكتوب بعد كل زيارة."],
    ["التزامات الطرف الأول", "تنفيذ الأعمال بكوادر مؤهلة ومعدات مناسبة، والالتزام بأنظمة السلامة والصحة المهنية في الموقع، والمحافظة على المنظومة ومكوناتها وعدم الإخلال بضمانات المصنّعين، وإشعار الطرف الثاني كتابياً بأي ملاحظات تؤثر في الأداء أو السلامة."],
    ["التزامات الطرف الثاني", "تمكين فريق الطرف الأول من الوصول الآمن إلى المنظومة في المواعيد المتفق عليها، وتوفير مصدر مياه للتنظيف عند الحاجة، والإبلاغ عن الأعطال فور ملاحظتها، وعدم إجراء تعديلات على المنظومة من غير الطرف الأول دون إشعار مسبق."],
    ["الاستثناءات", "لا يشمل العقد الأضرار الناتجة عن سوء الاستخدام أو التعديلات من الغير أو الكوارث الطبيعية أو أعمال الإنشاء والأسطح، ولا استبدال المعدات أو قطع الغيار إلا ما يُتفق عليه كتابياً، وتبقى ضمانات المعدات لدى مصنّعيها."],
    ["المقابل المالي", `القيمة السنوية ${money(c.annual)}، وقيمة مدة العقد (${c.termMonths} شهراً) ${money(c.value)}، تضاف إليها ضريبة القيمة المضافة ${cfg.vatPct}% بمبلغ ${money(c.vat)}، فيكون الإجمالي ${money(c.total)}. طريقة الدفع: ${c.payment || cfg.payment}.${cfg.extraVisit ? ` الزيارة الإضافية خارج الجدول بطلب الطرف الثاني بقيمة ${money(cfg.extraVisit)} غير شاملة الضريبة.` : ""}`],
    ["المدة والتجديد", `يسري العقد من ${ltr(c.start)} حتى ${ltr(c.end)}، ويُجدد باتفاق مكتوب بين الطرفين، ويشعر الطرف الأول الطرف الثاني قبل انتهائه بستين يوماً.`],
    ["الإنهاء", "يحق لأي طرف إنهاء العقد بإشعار كتابي قبل ثلاثين يوماً، أو فوراً عند إخلال الطرف الآخر إخلالاً جوهرياً لم يُعالج خلال خمسة عشر يوماً من إشعاره كتابياً، مع سداد مستحقات الأعمال المنفذة حتى تاريخ الإنهاء."],
    ["المسؤولية", "لا تتجاوز مسؤولية الطرف الأول في جميع الأحوال قيمة العقد، ولا يُسأل عن الأضرار غير المباشرة أو فوات الكسب."],
    ["السرية والبيانات", "تُستخدم بيانات الأداء والمراقبة لأغراض تقديم الخدمة فقط، ويلتزم الطرفان بسرية المعلومات المتبادلة."],
    ["النظام الواجب التطبيق", "يخضع هذا العقد لأنظمة المملكة العربية السعودية، وتختص الجهات القضائية المختصة في المملكة بالنظر في أي نزاع ينشأ عنه بعد تعذر حله ودياً."],
    ["نسخ العقد", "حُرر هذا العقد من نسختين أصليتين، بيد كل طرف نسخة للعمل بموجبها."]
  ];
}

function contractDocHtml(c, mode) {
  const cfg = state.contracts.cfg, p = cnPkg(c.pkg), offer = mode === "offer";
  const today = new Date().toISOString().slice(0, 10);
  const row = (k, v) => v === "" || v === null || v === undefined ? "" : `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`;
  const system = `<table class="pd-t">${row("العميل", c.client)}${row("السجل التجاري", c.cr)}${row("جهة الاتصال", c.contact)}${row("المدينة", c.city)}${row("الموقع", c.address)}
    ${row("القدرة", c.kwp + " kWp")}${row("عدد الألواح", c.panels)}${row("العاكس", c.inverter)}${row("نوع التركيب", c.mounting)}${row("المراقبة عن بُعد", c.monitoring ? "متاحة" : "غير متاحة")}</table>`;
  const price = `<table class="pd-t">${row("الباقة", p.name)}${row("القيمة السنوية", money(c.annual))}${row("قيمة المدة (" + c.termMonths + " شهراً)", money(c.value))}
    ${row("ضريبة القيمة المضافة " + cfg.vatPct + "%", money(c.vat))}<tr class="pd-total"><th>الإجمالي</th><td>${esc(money(c.total))}</td></tr>${row("طريقة الدفع", c.payment || cfg.payment)}</table>`;
  const visits = `<table class="pd-t pd-v"><tr><th>#</th><th>الموعد</th><th>الزيارة</th></tr>${c.visits.map((v, i) => `<tr><td>${i + 1}</td><td>${esc(ltr(v.date))}</td><td>${esc(v.type)}</td></tr>`).join("")}</table>`;
  const compare = `<table class="pd-t pd-c"><tr><th>الباقة</th><th>تنظيف/سنة</th><th>فحص/سنة</th><th>مراقبة</th><th>تقرير شهري</th><th>الاستجابة</th><th>سنوياً لهذه المنظومة</th></tr>
    ${cfg.packages.filter(x => x.rate > 0).map(x => `<tr${x.id === c.pkg ? ' class="pd-pick"' : ""}><td>${esc(x.name)}</td><td>${x.cleanings}</td><td>${x.inspections}</td><td>${x.monitoring ? "✓" : "—"}</td><td>${x.monthlyReport ? "✓" : "—"}</td><td>${x.responseHours} ساعة</td><td>${esc(money(cnAnnual(x, c.kwp)))}</td></tr>`).join("")}</table>`;
  const head = `<header class="pd-head"><div><b>انطلق للطاقة</b><span>ENTALIQ ENERGY</span></div><div class="pd-meta">
      <h1>${offer ? "عرض سعر خدمات صيانة وتشغيل منظومة طاقة شمسية" : "عقد صيانة وتشغيل منظومة طاقة شمسية"}</h1>
      <span>الرقم: ${esc(ltr(c.id))} · التاريخ: ${esc(ltr(offer ? today : c.start))}</span></div></header>`;
  const sign = `<div class="pd-sign"><div><b>الطرف الأول: انطلق للطاقة</b><span>${esc(cfg.signatory || "الاسم والمسمى")}</span><span>التوقيع والختم: ____________</span></div>
      <div><b>الطرف الثاني: ${esc(c.client)}</b><span>${esc(c.contact || "الاسم والمسمى")}</span><span>التوقيع والختم: ____________</span></div></div>`;
  if (offer) return head + `<p>السادة/ ${esc(c.client)} المحترمين،</p><p>${esc(c.intro)}</p>
    <h2>بيانات المنظومة</h2>${system}<h2>مقارنة الباقات</h2>${compare}
    <h2>الباقة المقترحة: ${esc(p.name)}</h2><ul>${(p.includes || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <p>عدد الزيارات خلال المدة: ${c.visits.length} زيارة (${p.cleanings} تنظيف و${p.inspections} فحص سنوياً). الاستجابة للبلاغات خلال ${p.responseHours} ساعة عمل${p.emergencyHours ? `، وللطوارئ خلال ${p.emergencyHours} ساعات` : ""}.</p>
    ${c.siteNotes ? `<h2>ملاحظات فنية خاصة بالموقع</h2><ul>${c.siteNotes.split("\n").map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <h2>القيمة</h2>${price}<p>صلاحية العرض ${cfg.offerDays} يوماً من تاريخه. للتواصل: https://entaliq.com.sa/ar#contact</p>${sign}`;
  return head + `<p>أُبرم هذا العقد بين: <b>انطلق للطاقة</b> (الطرف الأول)، و<b>${esc(c.client)}</b>${c.cr ? " سجل تجاري " + esc(c.cr) : ""} (الطرف الثاني)، واتفق الطرفان على ما يلي:</p>
    <h2>بيانات المنظومة</h2>${system}
    ${contractClauses(c, p, cfg).map(([t, body], i) => `<h2>${i + 1}. ${esc(t)}</h2><p class="pd-pre">${esc(body)}</p>`).join("")}
    <h2>جدول الزيارات</h2>${visits}<h2>ملخص القيمة</h2>${price}${sign}`;
}

function printContract(c, mode) {
  const el = $("#printDoc");
  el.innerHTML = `<article class="pd">${contractDocHtml(c, mode)}</article>`;
  el.hidden = false;
  const done = () => { el.hidden = true; el.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

// ---------------- الإجراءات ----------------
async function contractsSend(btn, body, okMessage) {
  const stop = btn ? busy(btn, "جاري الحفظ") : () => {};
  try { const d = await api(body); acceptContracts(d); if (okMessage) toast(typeof okMessage === "function" ? okMessage(d) : okMessage, "ok"); return d; }
  catch (e) { toast(officeError(e), "bad"); return null; }
  finally { stop(); renderContractsView(); }
}

async function contractsAction(btn) {
  const act = btn.dataset.cnact, id = btn.dataset.id;
  const c = id && state.contracts ? state.contracts.items.find(x => x.id === id) : null;
  if (act === "reload") return loadContracts();
  if (act === "new") { state.contractsNew = true; if (state.contractsTab === "prices") state.contractsTab = "offers"; renderContractsView(); const i = $("#cn-client"); if (i) i.focus(); return; }
  if (act === "new-cancel") { state.contractsNew = false; state.contractsPrefill = null; return renderContractsView(); }
  if (act === "create") {
    const f = $("[data-cnform]"), v = k => field(f, k).value;
    const input = { client: v("cn-client"), city: v("cn-city"), address: v("cn-address"), contact: v("cn-contact"), kwp: Number(v("cn-kwp")), panels: Number(v("cn-panels")) || null,
      inverter: v("cn-inverter"), mounting: v("cn-mount"), pkg: v("cn-pkg"), termMonths: Number(v("cn-term")), start: v("cn-start"), cr: v("cn-cr"),
      monitoring: field(f, "cn-mon").checked, note: v("cn-note"), source: (state.contractsPrefill || {}).source || "" };
    if (!input.client.trim() || !(input.kwp > 0)) { toast("اسم العميل والقدرة بالكيلوواط مطلوبان", "warn"); return; }
    toast("يكتب سلطان خطاب العرض والملاحظات الفنية ويدققها سالم؛ دقيقة تقريباً.", "none");
    const d = await contractsSend(btn, { action: "contracts_create", input }, "جُهّز العرض؛ راجعه واطبعه");
    if (d) { state.contractsNew = false; state.contractsPrefill = null; state.contractsTab = "offers"; renderContractsView(); }
    return;
  }
  if (act === "prices-save") {
    const f = $("[data-cnprices]");
    const nv = el => el && el.value !== "" ? Number(el.value) : null;
    const packages = [...f.querySelectorAll("[data-cnpkg]")].map(box => {
      const q = k => box.querySelector(`[data-k="${k}"]`);
      return { id: box.dataset.id, name: q("name").value.trim(), rate: nv(q("rate")), min: nv(q("min")), cleanings: nv(q("cleanings")) || 0, inspections: nv(q("inspections")) || 0,
        responseHours: nv(q("responseHours")) || 72, emergencyHours: nv(q("emergencyHours")), monitoring: q("monitoring").checked, monthlyReport: q("monthlyReport").checked,
        includes: q("includes").value.split("\n").map(s => s.trim()).filter(Boolean) };
    });
    const cfg = { packages, vatPct: nv($("#cp-vat")), termMonths: nv($("#cp-term")), offerDays: nv($("#cp-offer")), extraVisit: nv($("#cp-extra")), payment: $("#cp-pay").value, signatory: $("#cp-sign").value };
    return contractsSend(btn, { action: "contracts_cfg", cfg }, "حُفظت الأسعار والباقات");
  }
  if (act === "visit-done") {
    const note = (document.querySelector(`[data-cn-vnote="${CSS.escape(id + ":" + btn.dataset.index)}"]`) || {}).value || "";
    return contractsSend(btn, { action: "contracts_visit", id, index: Number(btn.dataset.index), done: true, note }, "سُجّلت الزيارة");
  }
  if (!c) return;
  if (act === "print-offer" || act === "print-contract") return printContract(c, act === "print-offer" ? "offer" : "contract");
  if (act === "regen") { toast("يعيد سلطان كتابة الخطاب والملاحظات ويدققها سالم.", "none"); return contractsSend(btn, { action: "contracts_regen", id }, "أُعيدت كتابة نص العرض"); }
  if (act === "renew") { toast("يجهز سلطان عرض التجديد بنفس الباقة يبدأ بعد نهاية العقد.", "none"); const d = await contractsSend(btn, { action: "contracts_renew", id }, "جُهّز عرض التجديد في «العروض»"); if (d) { state.contractsTab = "offers"; renderContractsView(); } return; }
  if (act === "activate") {
    const start = (document.querySelector(`[data-cn-start="${CSS.escape(id)}"]`) || {}).value || c.start;
    return contractsSend(btn, { action: "contracts_update", id, status: "ساري", start }, "فُعّل العقد وجُدولت زياراته");
  }
  const status = { sent: "أُرسل العرض", rejected: "مرفوض", cancel: "ملغى" }[act];
  if (!status) return;
  if (act === "cancel" && !confirm((c.status === "ساري" ? "إلغاء العقد مع " : "إلغاء العرض لـ ") + c.client + "؟")) return;
  return contractsSend(btn, { action: "contracts_update", id, status }, { sent: "سُجّل إرسال العرض", rejected: "سُجّل الرفض", cancel: "أُلغي" }[act]);
}

// من مازن: منشأة ردّت → عرض صيانة جاهز ببياناتها
function contractsFromProspect(p) {
  state.contractsPrefill = { client: p.company, city: p.city, source: p.id };
  state.contractsNew = true; state.contractsTab = "offers";
  openView("contracts");
}
