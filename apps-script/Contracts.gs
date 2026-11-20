/**
 * Contracts.gs — عقود صيانة وتشغيل الطاقة الشمسية: باقات بأسعارك، عرض سعر وعقد يكتبهما سلطان ويدققهما سالم، وسجل للعقود والزيارات والتجديد.
 *
 * - الباقات (أساسية، قياسية، شاملة) وما تتضمنه قابلة للتعديل. **الأسعار تضعها أنت** (ريال لكل كيلوواط ذروة سنوياً مع حد أدنى)،
 *   ولا يُصدر عرض قبل ضبطها؛ الوكلاء لا يقترحون أسعاراً.
 * - الحساب والجدول يحسبهما الخادم: القيمة السنوية، قيمة المدة، ضريبة القيمة المضافة (15% افتراضياً)، وجدول زيارات التنظيف والفحص.
 * - النص: بنود العقد قالب ثابت (يُنصح بمراجعته قانونياً مرة واحدة)، وسلطان يكتب خطاب التقديم والملاحظات الفنية الخاصة بالموقع فقط، ويدققها سالم.
 * - السجل: عروض ← عقد ساري ← زيارات (تمت/لم تتم) ← تجديد قبل الانتهاء بـ 60 يوماً. راكان يرى الزيارات القريبة والتجديدات في ملخصه.
 *
 * يعتمد على Code.gs: setupSheets, callGemini, AGENTS_PROMPTS, runAudit_, salemScore_, startOfDay_, toDate_, stripFences_, cell_, json_, appError_, executionDeadline_
 * ويعتمد على Office.gs: officeProps_, officeLog_, officeBy_, officeApply_
 */

const CONTRACTS_ = {
  sheet: "SolarContracts", cfgKey: "CONTRACTS_CFG", writer: "سلطان",
  fields: [["id", "ID"], ["at", "التاريخ"], ["client", "العميل"], ["cr", "السجل التجاري"], ["contact", "جهة الاتصال"], ["city", "المدينة"], ["address", "الموقع"],
    ["kwp", "القدرة kWp"], ["panels", "عدد الألواح"], ["inverter", "العاكس"], ["mounting", "نوع التركيب"], ["monitoring", "المراقبة متاحة"], ["pkg", "الباقة"],
    ["termMonths", "المدة بالأشهر"], ["start", "البداية"], ["end", "النهاية"], ["annual", "القيمة السنوية"], ["value", "قيمة المدة"], ["vat", "الضريبة"], ["total", "الإجمالي"],
    ["payment", "الدفع"], ["status", "الحالة"], ["visits", "الزيارات"], ["intro", "خطاب سلطان"], ["siteNotes", "ملاحظات فنية"], ["audit", "تدقيق سالم"], ["note", "ملاحظات"],
    ["source", "المصدر"], ["renewedFrom", "تجديد لـ"], ["updated", "آخر تحديث"]],
  statuses: ["عرض مسودة", "أُرسل العرض", "ساري", "مرفوض", "منتهي", "ملغى"],
  mountings: ["سطح مبنى", "مظلات مواقف", "أرضي", "مختلط"],
  renewDays: 60, day: 86400000
};

const CONTRACTS_DEFAULT_CFG_ = {
  vatPct: 15, termMonths: 12, offerDays: 30, payment: "دفعات ربع سنوية مقدماً خلال 15 يوماً من تاريخ الفاتورة", extraVisit: null, signatory: "",
  packages: [
    { id: "basic", name: "الأساسية", cleanings: 4, inspections: 2, monitoring: false, monthlyReport: false, responseHours: 72, emergencyHours: null, rate: null, min: null,
      includes: ["تنظيف الألواح الشمسية بالماء المعالج والأدوات غير الكاشطة", "فحص بصري وميكانيكي للألواح والهياكل والتثبيت", "فحص العاكسات واللوحات والتوصيلات والكابلات", "تقرير بعد كل زيارة بالصور والملاحظات"] },
    { id: "standard", name: "القياسية", cleanings: 6, inspections: 4, monitoring: true, monthlyReport: true, responseHours: 48, emergencyHours: null, rate: null, min: null,
      includes: ["كل ما في الباقة الأساسية", "مراقبة الأداء عن بُعد عبر منصة وهج أو نظام أثر عند توفر الربط", "تقرير أداء شهري يقارن الإنتاج بالمتوقع", "اختبار كهربائي سنوي لأداء السلاسل والعزل", "زيارة تصحيحية عند انخفاض الأداء"] },
    { id: "full", name: "الشاملة", cleanings: 12, inspections: 4, monitoring: true, monthlyReport: true, responseHours: 24, emergencyHours: 8, rate: null, min: null,
      includes: ["كل ما في الباقة القياسية", "تنظيف شهري", "استجابة للطوارئ على مدار الأسبوع", "متابعة مطالبات ضمان المصنعين نيابة عن العميل", "توريد قطع الغيار وفق ما يُتفق عليه كتابياً", "تقرير سنوي بتوصيات رفع الإنتاج"] }
  ]
};

// ---------------- الإعدادات (الباقات والأسعار) ----------------
function contractsCfg_() {
  let c = {};
  try { c = JSON.parse(officeProps_().getProperty(CONTRACTS_.cfgKey) || "{}"); } catch (e) {}
  const d = JSON.parse(JSON.stringify(CONTRACTS_DEFAULT_CFG_));
  const num = (v, def, min, max) => { const x = Number(v); return v !== null && v !== "" && Number.isFinite(x) && x >= min && x <= max ? x : def; };
  const pkgs = Array.isArray(c.packages) && c.packages.length ? c.packages : d.packages;
  return {
    vatPct: num(c.vatPct, d.vatPct, 0, 30), termMonths: num(c.termMonths, d.termMonths, 3, 60), offerDays: num(c.offerDays, d.offerDays, 7, 90),
    payment: typeof c.payment === "string" && c.payment.trim() ? c.payment.trim().slice(0, 200) : d.payment,
    extraVisit: num(c.extraVisit, null, 0, 1000000), signatory: String(c.signatory || "").slice(0, 120),
    packages: pkgs.slice(0, 5).map((p, i) => ({
      id: String(p.id || "p" + i).slice(0, 20), name: String(p.name || "باقة").slice(0, 40),
      cleanings: num(p.cleanings, 4, 0, 52), inspections: num(p.inspections, 2, 0, 52), monitoring: !!p.monitoring, monthlyReport: !!p.monthlyReport,
      responseHours: num(p.responseHours, 72, 1, 720), emergencyHours: num(p.emergencyHours, null, 1, 720),
      rate: num(p.rate, null, 0.01, 100000), min: num(p.min, null, 0, 100000000),
      includes: (Array.isArray(p.includes) ? p.includes : []).map(s => String(s).trim()).filter(Boolean).slice(0, 12).map(s => s.slice(0, 200))
    }))
  };
}

function contractsSaveCfg_(d) {
  const x = d.cfg || {};
  if (!Array.isArray(x.packages) || !x.packages.length) throw appError_("VALIDATION_ERROR", "أضف باقة واحدة على الأقل");
  x.packages.forEach(p => {
    if (!String(p.name || "").trim()) throw appError_("VALIDATION_ERROR", "لكل باقة اسم");
    if (p.rate !== null && p.rate !== "" && !(Number(p.rate) > 0)) throw appError_("VALIDATION_ERROR", "سعر الكيلوواط في باقة «" + p.name + "» يجب أن يكون رقماً موجباً");
    if (p.min !== null && p.min !== "" && !(Number(p.min) >= 0)) throw appError_("VALIDATION_ERROR", "الحد الأدنى في باقة «" + p.name + "» يجب أن يكون رقماً");
  });
  officeProps_().setProperty(CONTRACTS_.cfgKey, JSON.stringify(x));
  return contractsCfg_();
}

// ---------------- الحساب والجدول (الخادم وحده يحسب الأرقام) ----------------
function contractsPrice_(pkg, kwp, termMonths, cfg) {
  if (!pkg || !(pkg.rate > 0)) return null;
  const annual = Math.round(Math.max(pkg.min || 0, kwp * pkg.rate));
  const value = Math.round(annual * termMonths / 12);
  const vat = Math.round(value * cfg.vatPct / 100);
  return { annual: annual, value: value, vat: vat, total: value + vat };
}

function contractsYmd_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"); }

function contractsAddMonths_(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

// زيارات التنظيف والفحص موزعة بالتساوي على المدة؛ الأولى بعد أسبوع من البداية، وتُدمج الزيارتان في اليوم نفسه
function contractsSchedule_(start, termMonths, pkg) {
  const map = {};
  const add = (months, type) => {
    const d = contractsAddMonths_(start, months); d.setDate(d.getDate() + 7);
    const k = contractsYmd_(d);
    map[k] = map[k] ? (map[k].indexOf(type) >= 0 ? map[k] : map[k] + " + " + type) : type;
  };
  const nC = Math.round(pkg.cleanings * termMonths / 12), nI = Math.round(pkg.inspections * termMonths / 12);
  for (let i = 0; i < nC; i++) add(Math.floor(i * termMonths / nC), "تنظيف");
  for (let i = 0; i < nI; i++) add(Math.floor(i * termMonths / nI), "فحص وصيانة وقائية");
  return Object.keys(map).sort().map(k => ({ date: k, type: map[k], done: false, note: "" }));
}

// ---------------- التخزين ----------------
const contractsCol_ = key => CONTRACTS_.fields.findIndex(f => f[0] === key);

function contractsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), headers = CONTRACTS_.fields.map(f => f[1]);
  let sh = ss.getSheetByName(CONTRACTS_.sheet);
  if (!sh) { sh = ss.insertSheet(CONTRACTS_.sheet); sh.appendRow(headers); sh.setFrozenRows(1); return sh; }
  const cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some((h, i) => cur[i] !== h)) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function contractsAll_() {
  const sh = contractsSheet_(), n = CONTRACTS_.fields.length;
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().map((r, i) => {
    const c = { row: i + 2, raw: r };
    CONTRACTS_.fields.forEach(([k], j) => {
      const v = r[j];
      if (k === "at" || k === "updated") c[k] = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm") : String(v || "");
      else if (k === "start" || k === "end") c[k] = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "");
      else if (["kwp", "panels", "termMonths", "annual", "value", "vat", "total"].indexOf(k) >= 0) c[k] = v === "" || v === null || v === undefined ? null : Number(v);
      else if (k === "monitoring") c[k] = v === true || v === "نعم";
      else if (k === "visits") { try { c[k] = JSON.parse(String(v || "[]")); } catch (e) { c[k] = []; } }
      else c[k] = v === undefined || v === null ? "" : String(v);
    });
    return c;
  }).filter(c => c.id);
}

function contractsWrite_(c, fields) {
  const row = CONTRACTS_.fields.map((f, j) => c.raw[j] === undefined ? "" : c.raw[j]);
  Object.keys(fields).forEach(k => {
    const j = contractsCol_(k);
    if (j < 0) return;
    row[j] = k === "visits" ? JSON.stringify(fields[k]) : k === "monitoring" ? (fields[k] ? "نعم" : "لا") : fields[k];
  });
  row[contractsCol_("updated")] = new Date();
  contractsSheet_().getRange(c.row, 1, 1, row.length).setValues([row.map(cell_)]);
  c.raw = row;
}

// ---------------- سلطان يكتب، وسالم يدقق ----------------
function contractsDraftText_(c, pkg) {
  const facts = { client: c.client, city: c.city, address: c.address, kwp: c.kwp, panels: c.panels || "غير مذكور", inverter: c.inverter || "غير مذكور", mounting: c.mounting,
    monitoring: c.monitoring ? "متاحة" : "غير متاحة", package: pkg.name, includes: pkg.includes, cleaningsPerYear: pkg.cleanings, inspectionsPerYear: pkg.inspections,
    responseHours: pkg.responseHours, emergencyHours: pkg.emergencyHours, termMonths: c.termMonths, notes: c.note || "" };
  const prompt = "اكتب لعرض صيانة وتشغيل منظومة طاقة شمسية من «انطلق للطاقة» جزأين فقط بالعربية الفصحى المهنية:\n"
    + "1) intro: خطاب تقديم العرض للعميل من 80 إلى 120 كلمة: شكر على الاهتمام، فهم احتياج المنظومة في بيئة السعودية (الغبار والحرارة وأثرهما على الإنتاج)، والباقة المختارة وقيمتها للعميل، ودعوة لاعتماد العرض.\n"
    + "2) siteNotes: من 3 إلى 5 ملاحظات فنية قصيرة خاصة بهذا الموقع مبنية على البيانات أدناه فقط (نوع التركيب، توفر المراقبة، القدرة، المدينة)، مثل متطلبات الوصول أو المياه أو السلامة أو الربط.\n"
    + "قواعد: لا تذكر أي سعر أو نسبة وفر أو رقم غير موجود في البيانات، ولا خدمات غير مذكورة في includes أو ملف الشركة، ولا ضمانات بنتائج.\n"
    + 'أعد JSON فقط: {"intro": "…", "siteNotes": ["…"]}\n\nالبيانات:\n' + JSON.stringify(facts);
  let j = null;
  try { j = JSON.parse(stripFences_(callGemini(AGENTS_PROMPTS[CONTRACTS_.writer], prompt, true))); } catch (e) {}
  const intro = j && typeof j.intro === "string" ? j.intro.trim().slice(0, 1500) : "";
  const notes = j && Array.isArray(j.siteNotes) ? j.siteNotes.filter(s => typeof s === "string" && s.trim()).map(s => s.trim().slice(0, 300)).slice(0, 6) : [];
  if (!intro) throw appError_("PARSE_ERROR", "تعذر على سلطان كتابة العرض؛ أعد المحاولة");
  let audit = "";
  try { audit = runAudit_({ type: "content", agentName: CONTRACTS_.writer, task: "خطاب وملاحظات عرض صيانة طاقة شمسية", output: intro + "\n\n" + notes.map(n => "- " + n).join("\n"), source: JSON.stringify(facts) }).text; }
  catch (e) { audit = "تعذر التدقيق: " + e.message; }
  return { intro: intro, siteNotes: notes.join("\n"), audit: audit };
}

function contractsInput_(x, cfg) {
  const s = (v, n) => String(v === undefined || v === null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const client = s(x.client, 150), city = s(x.city, 60), kwp = Number(x.kwp);
  if (!client) throw appError_("VALIDATION_ERROR", "اسم العميل مطلوب");
  if (!(kwp > 0 && kwp <= 100000)) throw appError_("VALIDATION_ERROR", "قدرة المنظومة بالكيلوواط ذروة مطلوبة (رقم موجب)");
  const pkg = cfg.packages.find(p => p.id === x.pkg);
  if (!pkg) throw appError_("VALIDATION_ERROR", "اختر باقة");
  if (!(pkg.rate > 0)) throw appError_("NEEDS_PRICES", "حدد سعر باقة «" + pkg.name + "» أولاً من «الأسعار والباقات»؛ الوكلاء لا يضعون أسعاراً");
  const term = Number(x.termMonths) || cfg.termMonths;
  if (!(Number.isInteger(term) && term >= 3 && term <= 60)) throw appError_("VALIDATION_ERROR", "مدة العقد من 3 إلى 60 شهراً");
  const start = toDate_(x.start);
  if (!start) throw appError_("VALIDATION_ERROR", "تاريخ البداية بصيغة yyyy-MM-dd");
  return { client: client, cr: s(x.cr, 30), contact: s(x.contact, 150), city: city, address: s(x.address, 200), kwp: Math.round(kwp * 100) / 100,
    panels: Number(x.panels) > 0 ? Math.round(Number(x.panels)) : null, inverter: s(x.inverter, 100),
    mounting: CONTRACTS_.mountings.indexOf(x.mounting) >= 0 ? x.mounting : "سطح مبنى", monitoring: !!x.monitoring, pkg: pkg, termMonths: term, start: start,
    note: s(x.note, 500), source: s(x.source, 40) };
}

function contractsCreate_(x, by, renewedFrom) {
  const cfg = contractsCfg_(), v = contractsInput_(x, cfg), price = contractsPrice_(v.pkg, v.kwp, v.termMonths, cfg);
  const end = contractsAddMonths_(v.start, v.termMonths); end.setDate(end.getDate() - 1);
  const draft = { client: v.client, city: v.city, address: v.address, kwp: v.kwp, panels: v.panels, inverter: v.inverter, mounting: v.mounting, monitoring: v.monitoring,
    termMonths: v.termMonths, note: v.note };
  const text = contractsDraftText_(draft, v.pkg);
  const row = { id: "OMC-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: new Date(), client: v.client, cr: v.cr, contact: v.contact, city: v.city, address: v.address,
    kwp: v.kwp, panels: v.panels === null ? "" : v.panels, inverter: v.inverter, mounting: v.mounting, monitoring: v.monitoring ? "نعم" : "لا", pkg: v.pkg.id, termMonths: v.termMonths,
    start: contractsYmd_(v.start), end: contractsYmd_(end), annual: price.annual, value: price.value, vat: price.vat, total: price.total, payment: cfg.payment, status: "عرض مسودة",
    visits: JSON.stringify(contractsSchedule_(v.start, v.termMonths, v.pkg)), intro: text.intro, siteNotes: text.siteNotes, audit: text.audit, note: v.note,
    source: v.source, renewedFrom: renewedFrom || "", updated: new Date() };
  contractsSheet_().appendRow(CONTRACTS_.fields.map(([k]) => row[k] === undefined || row[k] === null ? "" : row[k]).map(cell_));
  officeLog_(renewedFrom ? "عرض تجديد صيانة شمسية" : "عرض صيانة شمسية", CONTRACTS_.writer, v.client + " · " + v.kwp + " kWp · " + v.pkg.name + " · " + price.total + " ريال شامل الضريبة", by);
  return row.id;
}

// ---------------- السجل: الحالات والزيارات والتجديد ----------------
function contractsExpire_() {
  const today = contractsYmd_(new Date());
  contractsAll_().filter(c => c.status === "ساري" && c.end && c.end < today).forEach(c => contractsWrite_(c, { status: "منتهي" }));
}

function contractsUpdate_(d, by) {
  const c = contractsAll_().find(x => x.id === String(d.id || ""));
  if (!c) throw appError_("NOT_FOUND", "العرض أو العقد غير موجود");
  const f = {};
  if (d.status !== undefined) {
    if (CONTRACTS_.statuses.indexOf(d.status) < 0) throw appError_("VALIDATION_ERROR", "حالة غير معروفة");
    f.status = d.status;
    // تفعيل العقد: إن تغيّر تاريخ البداية يُعاد الجدول والنهاية
    if (d.status === "ساري" && d.start && d.start !== c.start) {
      const start = toDate_(d.start);
      if (!start) throw appError_("VALIDATION_ERROR", "تاريخ البداية بصيغة yyyy-MM-dd");
      const pkg = contractsCfg_().packages.find(p => p.id === c.pkg);
      const end = contractsAddMonths_(start, c.termMonths); end.setDate(end.getDate() - 1);
      f.start = contractsYmd_(start); f.end = contractsYmd_(end);
      if (pkg) f.visits = contractsSchedule_(start, c.termMonths, pkg);
    }
  }
  if (d.note !== undefined) f.note = String(d.note).slice(0, 500);
  contractsWrite_(c, f);
  if (f.status) officeLog_("عقد صيانة: " + f.status, CONTRACTS_.writer, c.client + " · " + c.id, by);
}

function contractsVisit_(d, by) {
  const c = contractsAll_().find(x => x.id === String(d.id || ""));
  if (!c) throw appError_("NOT_FOUND", "العقد غير موجود");
  const i = Number(d.index), v = c.visits[i];
  if (!v) throw appError_("NOT_FOUND", "الزيارة غير موجودة");
  v.done = !!d.done; v.note = String(d.note || v.note || "").slice(0, 300);
  if (d.date && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) v.date = String(d.date);
  c.visits.sort((a, b) => a.date.localeCompare(b.date));
  contractsWrite_(c, { visits: c.visits });
  officeLog_(v.done ? "تمت زيارة صيانة" : "تحديث زيارة صيانة", CONTRACTS_.writer, c.client + " · " + v.date + " · " + v.type, by);
}

function contractsRenew_(id, by) {
  const c = contractsAll_().find(x => x.id === id);
  if (!c) throw appError_("NOT_FOUND", "العقد غير موجود");
  const start = toDate_(c.end);
  if (!start) throw appError_("VALIDATION_ERROR", "تاريخ نهاية العقد غير صالح");
  start.setDate(start.getDate() + 1);
  return contractsCreate_({ client: c.client, cr: c.cr, contact: c.contact, city: c.city, address: c.address, kwp: c.kwp, panels: c.panels, inverter: c.inverter,
    mounting: c.mounting, monitoring: c.monitoring, pkg: c.pkg, termMonths: c.termMonths, start: contractsYmd_(start), note: c.note, source: c.id }, by, c.id);
}

function contractsRegen_(id, by) {
  const c = contractsAll_().find(x => x.id === id), cfg = contractsCfg_();
  if (!c) throw appError_("NOT_FOUND", "العرض غير موجود");
  const pkg = cfg.packages.find(p => p.id === c.pkg);
  if (!pkg) throw appError_("VALIDATION_ERROR", "الباقة لم تعد موجودة");
  const text = contractsDraftText_(c, pkg);
  contractsWrite_(c, { intro: text.intro, siteNotes: text.siteNotes, audit: text.audit });
  officeLog_("إعادة كتابة عرض صيانة", CONTRACTS_.writer, c.client, by);
}

// ---------------- لراكان: الزيارات القريبة والتجديدات ----------------
function contractsStats_(all) {
  const today = contractsYmd_(new Date()), week = contractsYmd_(new Date(Date.now() + 7 * CONTRACTS_.day)), renew = contractsYmd_(new Date(Date.now() + CONTRACTS_.renewDays * CONTRACTS_.day));
  const active = all.filter(c => c.status === "ساري");
  const visits = [];
  active.forEach(c => c.visits.forEach((v, i) => { if (!v.done && v.date <= week) visits.push({ id: c.id, client: c.client, index: i, date: v.date, type: v.type, late: v.date < today }); }));
  visits.sort((a, b) => a.date.localeCompare(b.date));
  const renewals = active.filter(c => c.end && c.end <= renew && !all.some(x => x.renewedFrom === c.id && x.status !== "مرفوض" && x.status !== "ملغى"))
    .map(c => ({ id: c.id, client: c.client, end: c.end }));
  return { active: active.length, annualValue: active.reduce((s, c) => s + (c.annual || 0), 0), offers: all.filter(c => c.status === "عرض مسودة" || c.status === "أُرسل العرض").length,
    visitsSoon: visits, renewals: renewals, kwp: active.reduce((s, c) => s + (c.kwp || 0), 0) };
}

function contractsBrief_() {
  try {
    const s = contractsStats_(contractsAll_());
    if (!s.active && !s.offers) return "";
    const lines = ["- عقود الصيانة الشمسية: سارية " + s.active + " (" + s.kwp + " kWp، قيمة سنوية " + s.annualValue + " ريال) · عروض معلقة " + s.offers
      + " · زيارات خلال 7 أيام " + s.visitsSoon.length + " · تجديد خلال " + CONTRACTS_.renewDays + " يوماً " + s.renewals.length];
    s.visitsSoon.slice(0, 5).forEach(v => lines.push("  - " + (v.late ? "زيارة متأخرة " : "زيارة ") + v.date + ": " + v.client + " (" + v.type + ")"));
    s.renewals.slice(0, 3).forEach(r => lines.push("  - تجديد: " + r.client + " ينتهي " + r.end));
    return lines.join("\n");
  } catch (e) { return ""; }
}

// ---------------- الإجراءات ----------------
function contractsState_() {
  contractsExpire_();
  const all = contractsAll_(), cfg = contractsCfg_();
  return { status: "success", cfg: cfg, stats: contractsStats_(all), priced: cfg.packages.every(p => p.rate > 0),
    items: all.slice(-300).reverse().map(c => { const x = {}; CONTRACTS_.fields.forEach(([k]) => { x[k] = c[k]; }); x.score = salemScore_(c.audit); return x; }) };
}

function handleContractsAction_(data, user) {
  try {
    officeApply_();
    const by = officeBy_(user), a = data.action;
    let extra = {};
    if (a === "contracts_get") { /* القراءة فقط */ }
    else if (a === "contracts_cfg") { contractsSaveCfg_(data); officeLog_("أسعار وباقات الصيانة الشمسية", CONTRACTS_.writer, "", by); }
    else if (a === "contracts_create") { executionDeadline_ = Date.now() + 270000; extra = { created: contractsCreate_(data.input || {}, by) }; }
    else if (a === "contracts_update") contractsUpdate_(data, by);
    else if (a === "contracts_visit") contractsVisit_(data, by);
    else if (a === "contracts_renew") { executionDeadline_ = Date.now() + 270000; extra = { created: contractsRenew_(String(data.id || ""), by) }; }
    else if (a === "contracts_regen") { executionDeadline_ = Date.now() + 270000; contractsRegen_(String(data.id || ""), by); }
    else throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    return json_(Object.assign(contractsState_(), extra));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
