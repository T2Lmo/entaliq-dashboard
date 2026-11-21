/**
 * Audits.gs — عروض تدقيق الطاقة المسعّرة: باقات بأسعارك، عرض سعر يكتب سلطان خطابه ويدققه سالم، وسجل للعروض حتى تسليم التقرير.
 *
 * - الباقات (قابلة للتعديل) على مستويات ASHRAE: المسح الأولي، والتدقيق التفصيلي، والتدقيق الاستثماري، ومعها خدمات إضافية
 *   (القياس والتحقق، دراسة طاقة شمسية للسطح، …). **الأسعار تضعها أنت**: ريال لكل متر مربع من مساحة المبنى مع حد أدنى، وسعر ثابت لكل إضافة.
 *   لا يُصدر عرض لباقة بلا سعر، والوكلاء لا يقترحون أسعاراً.
 * - الحساب يحسبه الخادم: قيمة الباقة = المساحة × السعر (ولا تقل عن الحد الأدنى) + الإضافات، ثم ضريبة القيمة المضافة (15% افتراضياً).
 *   وإن ذكرت فاتورة الطاقة السنوية يحسب «تكلفة الطاقة لكل م² سنوياً» من أرقامك، بلا أي تقدير للوفر.
 * - النص: سلطان يكتب خطاب التقديم وملاحظات النطاق الخاصة بالمبنى فقط، ويدققها سالم. النطاق والمخرجات من الباقة كما ضبطتها.
 * - السجل: عرض مسودة ← أُرسل العرض ← قُبل (يبدأ التدقيق) ← سُلّم التقرير، أو مرفوض/ملغى. ويتبعه مسار المبيعات تلقائياً.
 *
 * يعتمد على Code.gs: callGemini, AGENTS_PROMPTS, runAudit_, salemScore_, stripFences_, cell_, json_, appError_, executionDeadline_
 * ويعتمد على Office.gs: officeProps_, officeLog_, officeBy_, officeApply_
 */

const AUDITS_ = {
  sheet: "EnergyAudits", cfgKey: "AUDITS_CFG", writer: "سلطان",
  fields: [["id", "ID"], ["at", "التاريخ"], ["client", "العميل"], ["cr", "السجل التجاري"], ["contact", "جهة الاتصال"], ["city", "المدينة"], ["address", "الموقع"],
    ["buildingType", "نوع المبنى"], ["area", "المساحة م²"], ["floors", "الأدوار"], ["buildings", "عدد المباني"], ["annualBill", "فاتورة الطاقة السنوية"], ["pkg", "الباقة"],
    ["addons", "الإضافات"], ["base", "قيمة الباقة"], ["addonsValue", "قيمة الإضافات"], ["value", "القيمة"], ["vat", "الضريبة"], ["total", "الإجمالي"], ["weeks", "المدة بالأسابيع"],
    ["payment", "الدفع"], ["status", "الحالة"], ["intro", "خطاب سلطان"], ["scopeNotes", "ملاحظات النطاق"], ["audit", "تدقيق سالم"], ["note", "ملاحظات"],
    ["source", "المصدر"], ["dealId", "الصفقة"], ["updated", "آخر تحديث"]],
  statuses: ["عرض مسودة", "أُرسل العرض", "قُبل", "سُلّم التقرير", "مرفوض", "ملغى"],
  buildingTypes: ["مستشفى", "فندق", "مول أو مركز تجاري", "مبنى إداري", "مجمع سكني", "مدرسة أو جامعة", "مصنع أو مستودع", "مسجد", "أخرى"]
};

const AUDITS_DEFAULT_CFG_ = {
  vatPct: 15, offerDays: 30, payment: "50% عند اعتماد العرض، و50% عند تسليم التقرير النهائي", signatory: "",
  packages: [
    { id: "walk", name: "المسح الأولي", level: "ASHRAE المستوى الأول", siteDays: 1, measureDays: 0, weeks: 2, rate: null, min: null,
      includes: ["مراجعة فواتير الكهرباء والمياه لآخر 12 شهراً", "زيارة ميدانية للمبنى ومقابلة فريق التشغيل", "تحديد فرص الترشيد السريعة منخفضة التكلفة", "تقرير مختصر بالفرص مرتبة حسب الأولوية"] },
    { id: "detailed", name: "التدقيق التفصيلي", level: "ASHRAE المستوى الثاني", siteDays: 3, measureDays: 7, weeks: 4, rate: null, min: null,
      includes: ["تحليل فواتير آخر 24 شهراً وبناء خط أساس الاستهلاك", "مسح تفصيلي لأنظمة التكييف والإنارة والأحمال وغلاف المبنى", "قياسات للأحمال الرئيسية خلال فترة القياس",
        "قائمة إجراءات الترشيد مع تقدير الوفر والتكلفة وفترة الاسترداد لكل إجراء", "تقرير مفصل وعرض تقديمي للإدارة"] },
    { id: "investment", name: "التدقيق الاستثماري", level: "ASHRAE المستوى الثالث", siteDays: 5, measureDays: 28, weeks: 8, rate: null, min: null,
      includes: ["كل ما في التدقيق التفصيلي", "تسجيل بيانات بأجهزة قياس لمدة أربعة أسابيع", "نمذجة الطاقة للإجراءات الرئيسية",
        "دراسة جدوى تصلح لعقد أداء طاقة أو لطلب تمويل", "خطة قياس وتحقق وفق بروتوكول IPMVP"] }
  ],
  addons: [
    { id: "mv", name: "القياس والتحقق للوفر لسنة واحدة (IPMVP)", price: null },
    { id: "solar", name: "دراسة طاقة شمسية للسطح والمواقف (وهج)", price: null },
    { id: "bms", name: "تقييم نظام إدارة المبنى وفرص ربطه (ساعد)", price: null }
  ]
};

// ---------------- الإعدادات ----------------
function auditsCfg_() {
  let c = {};
  try { c = JSON.parse(officeProps_().getProperty(AUDITS_.cfgKey) || "{}"); } catch (e) {}
  const d = JSON.parse(JSON.stringify(AUDITS_DEFAULT_CFG_));
  const num = (v, def, min, max) => { const x = Number(v); return v !== null && v !== "" && v !== undefined && Number.isFinite(x) && x >= min && x <= max ? x : def; };
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map(s => String(s).trim()).filter(Boolean).slice(0, n).map(s => s.slice(0, len));
  const pkgs = Array.isArray(c.packages) && c.packages.length ? c.packages : d.packages;
  const adds = Array.isArray(c.addons) ? c.addons : d.addons;
  return {
    vatPct: num(c.vatPct, d.vatPct, 0, 30), offerDays: num(c.offerDays, d.offerDays, 7, 90),
    payment: typeof c.payment === "string" && c.payment.trim() ? c.payment.trim().slice(0, 200) : d.payment, signatory: String(c.signatory || "").slice(0, 120),
    packages: pkgs.slice(0, 5).map((p, i) => ({ id: String(p.id || "p" + i).replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "p" + i, name: String(p.name || "باقة").slice(0, 40),
      level: String(p.level || "").slice(0, 60), siteDays: num(p.siteDays, 1, 0, 60), measureDays: num(p.measureDays, 0, 0, 365), weeks: num(p.weeks, 4, 1, 52),
      rate: num(p.rate, null, 0.01, 100000), min: num(p.min, null, 0, 100000000), includes: list(p.includes, 12, 200) })),
    addons: adds.slice(0, 8).map((a, i) => ({ id: String(a.id || "a" + i).replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "a" + i, name: String(a.name || "إضافة").slice(0, 80),
      price: num(a.price, null, 0, 100000000) }))
  };
}

function auditsSaveCfg_(d) {
  const x = d.cfg || {};
  if (!Array.isArray(x.packages) || !x.packages.length) throw appError_("VALIDATION_ERROR", "أضف باقة واحدة على الأقل");
  x.packages.forEach(p => {
    if (!String(p.name || "").trim()) throw appError_("VALIDATION_ERROR", "لكل باقة اسم");
    if (p.rate !== null && p.rate !== "" && p.rate !== undefined && !(Number(p.rate) > 0)) throw appError_("VALIDATION_ERROR", "سعر المتر في باقة «" + p.name + "» يجب أن يكون رقماً موجباً");
    if (p.min !== null && p.min !== "" && p.min !== undefined && !(Number(p.min) >= 0)) throw appError_("VALIDATION_ERROR", "الحد الأدنى في باقة «" + p.name + "» يجب أن يكون رقماً");
  });
  (Array.isArray(x.addons) ? x.addons : []).forEach(a => {
    if (a.price !== null && a.price !== "" && a.price !== undefined && !(Number(a.price) >= 0)) throw appError_("VALIDATION_ERROR", "سعر «" + a.name + "» يجب أن يكون رقماً");
  });
  officeProps_().setProperty(AUDITS_.cfgKey, JSON.stringify(x));
  return auditsCfg_();
}

// ---------------- الحساب (الخادم وحده يحسب الأرقام) ----------------
function auditsPrice_(pkg, area, addonIds, cfg) {
  if (!pkg || !(pkg.rate > 0)) return null;
  const base = Math.round(Math.max(pkg.min || 0, area * pkg.rate));
  const picked = cfg.addons.filter(a => (addonIds || []).indexOf(a.id) >= 0);
  if (picked.some(a => a.price === null)) return { missing: picked.filter(a => a.price === null).map(a => a.name) };
  const addonsValue = picked.reduce((s, a) => s + Math.round(a.price), 0), value = base + addonsValue, vat = Math.round(value * cfg.vatPct / 100);
  return { base: base, addonsValue: addonsValue, value: value, vat: vat, total: value + vat };
}

// تكلفة الطاقة لكل م² سنوياً من أرقام العميل نفسها (لا تقدير للوفر)
const auditsIntensity_ = (bill, area) => bill > 0 && area > 0 ? Math.round(bill / area * 10) / 10 : null;

// ---------------- التخزين ----------------
function auditsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), headers = AUDITS_.fields.map(f => f[1]);
  let sh = ss.getSheetByName(AUDITS_.sheet);
  if (!sh) { sh = ss.insertSheet(AUDITS_.sheet); sh.appendRow(headers); sh.setFrozenRows(1); return sh; }
  const cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some((h, i) => cur[i] !== h)) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function auditsAll_() {
  const sh = auditsSheet_(), n = AUDITS_.fields.length;
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone(), nums = ["area", "floors", "buildings", "annualBill", "base", "addonsValue", "value", "vat", "total", "weeks"];
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().map((r, i) => {
    const a = { row: i + 2, raw: r };
    AUDITS_.fields.forEach(([k], j) => {
      const v = r[j];
      if (k === "at" || k === "updated") a[k] = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm") : String(v || "");
      else if (nums.indexOf(k) >= 0) a[k] = v === "" || v === null || v === undefined ? null : Number(v);
      else if (k === "addons") { try { a[k] = JSON.parse(String(v || "[]")); } catch (e) { a[k] = []; } }
      else a[k] = v === undefined || v === null ? "" : String(v);
    });
    return a;
  }).filter(a => a.id);
}

function auditsWrite_(a, fields) {
  const row = AUDITS_.fields.map((f, j) => a.raw[j] === undefined ? "" : a.raw[j]);
  Object.keys(fields).forEach(k => {
    const j = AUDITS_.fields.findIndex(f => f[0] === k);
    if (j >= 0) row[j] = k === "addons" ? JSON.stringify(fields[k]) : fields[k];
  });
  row[AUDITS_.fields.findIndex(f => f[0] === "updated")] = new Date();
  auditsSheet_().getRange(a.row, 1, 1, row.length).setValues([row.map(cell_)]);
  a.raw = row;
}

// ---------------- سلطان يكتب، وسالم يدقق ----------------
function auditsDraftText_(a, pkg, cfg) {
  const picked = cfg.addons.filter(x => (a.addons || []).indexOf(x.id) >= 0).map(x => x.name);
  const facts = { client: a.client, city: a.city, address: a.address, buildingType: a.buildingType, areaM2: a.area, floors: a.floors || "غير مذكور", buildings: a.buildings || 1,
    annualEnergyBillSAR: a.annualBill || "غير مذكورة", package: pkg.name, level: pkg.level, includes: pkg.includes, siteDays: pkg.siteDays, measurementDays: pkg.measureDays,
    durationWeeks: pkg.weeks, addons: picked, notes: a.note || "" };
  const prompt = "اكتب لعرض «تدقيق الطاقة» من «انطلق للطاقة» جزأين فقط بالعربية الفصحى المهنية:\n"
    + "1) intro: خطاب تقديم العرض للعميل من 80 إلى 120 كلمة: شكر على الاهتمام، وفهم واقع هذا النوع من المباني في السعودية (أحمال التبريد الطويلة، ساعات التشغيل، ذروة الصيف)، "
    + "والباقة المختارة وما ستعطيه للإدارة من قرار مبني على قياس، ودعوة لاعتماد العرض.\n"
    + "2) scopeNotes: من 3 إلى 5 ملاحظات نطاق قصيرة خاصة بهذا المبنى مبنية على البيانات أدناه فقط (نوع المبنى، المساحة، الأدوار، عدد المباني، المدينة، الإضافات)، "
    + "مثل ما نحتاجه من العميل (الفواتير، المخططات، مرافق من فريق التشغيل، الوصول للأسطح وغرف المعدات) أو ما سيُركز عليه المسح.\n"
    + "قواعد: لا تذكر أي سعر أو نسبة وفر أو رقم غير موجود في البيانات، ولا خدمات غير مذكورة في includes أو addons أو ملف الشركة، ولا ضمانات بنتائج.\n"
    + 'أعد JSON فقط: {"intro": "…", "scopeNotes": ["…"]}\n\nالبيانات:\n' + JSON.stringify(facts);
  let j = null;
  try { j = JSON.parse(stripFences_(callGemini(AGENTS_PROMPTS[AUDITS_.writer], prompt, true))); } catch (e) {}
  const intro = j && typeof j.intro === "string" ? j.intro.trim().slice(0, 1500) : "";
  const notes = j && Array.isArray(j.scopeNotes) ? j.scopeNotes.filter(s => typeof s === "string" && s.trim()).map(s => s.trim().slice(0, 300)).slice(0, 6) : [];
  if (!intro) throw appError_("PARSE_ERROR", "تعذر على سلطان كتابة العرض؛ أعد المحاولة");
  let audit = "";
  try { audit = runAudit_({ type: "content", agentName: AUDITS_.writer, task: "خطاب وملاحظات نطاق عرض تدقيق طاقة", output: intro + "\n\n" + notes.map(n => "- " + n).join("\n"), source: JSON.stringify(facts) }).text; }
  catch (e) { audit = "تعذر التدقيق: " + e.message; }
  return { intro: intro, scopeNotes: notes.join("\n"), audit: audit };
}

function auditsInput_(x, cfg) {
  const s = (v, n) => String(v === undefined || v === null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const client = s(x.client, 150), area = Number(x.area);
  if (!client) throw appError_("VALIDATION_ERROR", "اسم العميل مطلوب");
  if (!(area >= 10 && area <= 5000000)) throw appError_("VALIDATION_ERROR", "مساحة المبنى بالمتر المربع مطلوبة (رقم من 10 فأكثر)");
  const pkg = cfg.packages.find(p => p.id === x.pkg);
  if (!pkg) throw appError_("VALIDATION_ERROR", "اختر باقة");
  if (!(pkg.rate > 0)) throw appError_("NEEDS_PRICES", "حدد سعر باقة «" + pkg.name + "» أولاً من «الأسعار والباقات»؛ الوكلاء لا يضعون أسعاراً");
  const addons = (Array.isArray(x.addons) ? x.addons : []).map(String).filter(id => cfg.addons.some(a => a.id === id));
  const price = auditsPrice_(pkg, area, addons, cfg);
  if (price.missing) throw appError_("NEEDS_PRICES", "حدد سعر «" + price.missing.join("، ") + "» أولاً من «الأسعار والباقات»");
  const pos = (v, max) => { const n = Number(v); return v !== "" && v !== null && v !== undefined && n > 0 && n <= max ? Math.round(n) : null; };
  return { client: client, cr: s(x.cr, 30), contact: s(x.contact, 150), city: s(x.city, 60), address: s(x.address, 200),
    buildingType: AUDITS_.buildingTypes.indexOf(x.buildingType) >= 0 ? x.buildingType : "أخرى", area: Math.round(area), floors: pos(x.floors, 300), buildings: pos(x.buildings, 500),
    annualBill: pos(x.annualBill, 1e10), pkg: pkg, addons: addons, price: price, note: s(x.note, 500), source: s(x.source, 40), dealId: s(x.dealId, 40) };
}

function auditsCreate_(x, by) {
  const cfg = auditsCfg_(), v = auditsInput_(x, cfg);
  const text = auditsDraftText_({ client: v.client, city: v.city, address: v.address, buildingType: v.buildingType, area: v.area, floors: v.floors, buildings: v.buildings,
    annualBill: v.annualBill, addons: v.addons, note: v.note }, v.pkg, cfg);
  const row = { id: "AUD-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: new Date(), client: v.client, cr: v.cr, contact: v.contact, city: v.city, address: v.address,
    buildingType: v.buildingType, area: v.area, floors: v.floors, buildings: v.buildings, annualBill: v.annualBill, pkg: v.pkg.id, addons: JSON.stringify(v.addons),
    base: v.price.base, addonsValue: v.price.addonsValue, value: v.price.value, vat: v.price.vat, total: v.price.total, weeks: v.pkg.weeks, payment: cfg.payment, status: "عرض مسودة",
    intro: text.intro, scopeNotes: text.scopeNotes, audit: text.audit, note: v.note, source: v.source, dealId: v.dealId, updated: new Date() };
  auditsSheet_().appendRow(AUDITS_.fields.map(([k]) => row[k] === undefined || row[k] === null ? "" : row[k]).map(cell_));
  officeLog_("عرض تدقيق طاقة", AUDITS_.writer, v.client + " · " + v.area + " م² · " + v.pkg.name + " · " + v.price.total + " ريال شامل الضريبة", by);
  return row.id;
}

function auditsUpdate_(d, by) {
  const a = auditsAll_().find(x => x.id === String(d.id || ""));
  if (!a) throw appError_("NOT_FOUND", "العرض غير موجود");
  const f = {};
  if (d.status !== undefined) { if (AUDITS_.statuses.indexOf(d.status) < 0) throw appError_("VALIDATION_ERROR", "حالة غير معروفة"); f.status = d.status; }
  if (d.note !== undefined) f.note = String(d.note).slice(0, 500);
  auditsWrite_(a, f);
  if (f.status) officeLog_("عرض تدقيق: " + f.status, AUDITS_.writer, a.client + " · " + a.id, by);
}

function auditsRegen_(id, by) {
  const a = auditsAll_().find(x => x.id === id), cfg = auditsCfg_();
  if (!a) throw appError_("NOT_FOUND", "العرض غير موجود");
  const pkg = cfg.packages.find(p => p.id === a.pkg);
  if (!pkg) throw appError_("VALIDATION_ERROR", "الباقة لم تعد موجودة");
  const text = auditsDraftText_(a, pkg, cfg);
  auditsWrite_(a, { intro: text.intro, scopeNotes: text.scopeNotes, audit: text.audit });
  officeLog_("إعادة كتابة عرض تدقيق", AUDITS_.writer, a.client, by);
}

// ---------------- لراكان والملخص الصباحي ----------------
function auditsStats_(all) {
  const open = all.filter(a => a.status === "عرض مسودة" || a.status === "أُرسل العرض"), running = all.filter(a => a.status === "قُبل");
  const month = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  return { drafts: all.filter(a => a.status === "عرض مسودة").length, sent: all.filter(a => a.status === "أُرسل العرض").length, running: running.length,
    openValue: open.reduce((s, a) => s + (a.value || 0), 0), runningValue: running.reduce((s, a) => s + (a.value || 0), 0),
    delivered: all.filter(a => a.status === "سُلّم التقرير").length, acceptedMonth: all.filter(a => (a.status === "قُبل" || a.status === "سُلّم التقرير") && String(a.updated).slice(0, 7) === month).length };
}

function auditsBrief_() {
  try {
    const all = auditsAll_();
    if (!all.length) return "";
    const s = auditsStats_(all);
    return "- عروض تدقيق الطاقة: مسودات " + s.drafts + " · مرسلة " + s.sent + " (قيمة المفتوحة " + Math.round(s.openValue) + " ريال قبل الضريبة) · تدقيقات جارية " + s.running
      + " · سُلّمت تقاريرها " + s.delivered;
  } catch (e) { return ""; }
}

// ---------------- الإجراءات ----------------
function auditsState_() {
  const all = auditsAll_(), cfg = auditsCfg_();
  return { status: "success", cfg: cfg, buildingTypes: AUDITS_.buildingTypes, stats: auditsStats_(all), priced: cfg.packages.some(p => p.rate > 0),
    items: all.slice(-300).reverse().map(a => { const x = {}; AUDITS_.fields.forEach(([k]) => { x[k] = a[k]; }); x.score = salemScore_(a.audit); x.intensity = auditsIntensity_(a.annualBill, a.area); return x; }) };
}

function handleAuditsAction_(data, user) {
  try {
    officeApply_();
    const by = officeBy_(user), a = data.action;
    let extra = {};
    if (a === "audits_get") { /* القراءة فقط */ }
    else if (a === "audits_cfg") { auditsSaveCfg_(data); officeLog_("أسعار وباقات تدقيق الطاقة", AUDITS_.writer, "", by); }
    else if (a === "audits_create") { executionDeadline_ = Date.now() + 270000; extra = { created: auditsCreate_(data.input || {}, by) }; }
    else if (a === "audits_update") auditsUpdate_(data, by);
    else if (a === "audits_regen") { executionDeadline_ = Date.now() + 270000; auditsRegen_(String(data.id || ""), by); }
    else throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    return json_(Object.assign(auditsState_(), extra));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
