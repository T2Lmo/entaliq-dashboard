/**
 * Leads.gs — التقاط العملاء من موقعي انطلق ووهج.
 *
 * - نموذج «اطلب تواصلاً» (lead.html في اللوحة المنشورة) يُضمَّن في الموقعين أو يُشارك رابطه (واتساب، إنستغرام، رمز QR).
 *   يرسل الطلب إلى هذا الخادم بالإجراء العام lead_submit (بلا تسجيل دخول) فيُحفظ في ورقة Leads.
 * - مع كل طلب سليم وفوراً: صفقة «مهتم» في مسار المبيعات بخطوة «اتصل بهم» لليوم، وتنبيه بريد لك (إن فعّلته).
 *   وإن ترك بريده: يكتب مازن رداً مهنياً خلال دقائق (مشغل كل 10 دقائق) ويدققه سالم، ويصلك في «تنتظر موافقتك» عند مازن؛ لا يُرسل شيء إلا بموافقتك.
 * - الحماية من الإزعاج: رمز النموذج (LEAD_KEY، تغيّره متى شئت فتتوقف الروابط القديمة)، وحقل فخ مخفي، وزمن تعبئة أدنى،
 *   وحد للطلبات في الدقيقة وفي اليوم، ودمج المكرر خلال 24 ساعة، وتعليم المشتبه (روابط كثيرة) دون صفقة ولا تنبيه.
 *   لا يُرسل الخادم أي بريد إلى العنوان الذي كتبه الزائر من تلقاء نفسه.
 * - موافقة الزائر على معالجة بياناته شرط لقبول الطلب (نظام حماية البيانات الشخصية).
 *
 * يعتمد على Office.gs، ويستخدم إن وُجد: Pipeline.gs (pipeNew_)، Prospects.gs (مسودة مازن وتدقيق سالم)، Digest.gs (مستلم التنبيه)
 */

const LEADS_ = {
  sheet: "Leads", cfgKey: "LEADS_CFG", dayKey: "LEADS_DAY",
  fields: [["id", "ID"], ["at", "التاريخ"], ["name", "الاسم"], ["company", "المنشأة"], ["phone", "الجوال"], ["email", "البريد"], ["city", "المدينة"],
    ["service", "الخدمة"], ["message", "الرسالة"], ["brand", "العلامة"], ["page", "الصفحة"], ["status", "الحالة"], ["dealId", "الصفقة"], ["prospectId", "عند مازن"],
    ["note", "ملاحظات"], ["updated", "آخر تحديث"]],
  statuses: ["جديد", "تواصلنا", "مكرر", "مشتبه", "مغلق"],
  brands: ["انطلق", "وهج"],
  services: ["طاقة شمسية للسطح أو المواقف (وهج)", "تدقيق الطاقة وخفض الفاتورة", "صيانة منظومة شمسية قائمة", "إدارة المباني والطاقة (ساعد وأثر)", "أخرى"],
  perMinute: 6, minFillMs: 3000, dedupeMs: 86400000, maxLinks: 2, listed: 200, draftEveryMin: 10
};

function leadsCfg_() {
  let c = {};
  try { c = JSON.parse(officeProps_().getProperty(LEADS_.cfgKey) || "{}"); } catch (e) {}
  const out = Object.assign({ enabled: true, key: "", dailyCap: 40, alert: true, autoDraft: true }, c);
  if (!out.key) { out.key = Utilities.getUuid().replace(/-/g, "").slice(0, 20); officeProps_().setProperty(LEADS_.cfgKey, JSON.stringify(out)); }
  return out;
}

function leadsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LEADS_.sheet);
  const headers = LEADS_.fields.map(f => f[1]);
  if (!sh) { sh = ss.insertSheet(LEADS_.sheet); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

function leadsAll_() {
  const sh = leadsSheet_(), n = LEADS_.fields.length;
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().map((r, i) => {
    const x = { row: i + 2 };
    LEADS_.fields.forEach(([k], j) => {
      const v = r[j];
      if (k === "at" || k === "updated") { x[k] = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm") : String(v || ""); x[k + "Ms"] = v instanceof Date ? v.getTime() : 0; }
      else x[k] = v === undefined || v === null ? "" : String(v);
    });
    return x;
  }).filter(x => x.id);
}

function leadsWrite_(x, patch) {
  Object.assign(x, patch, { updated: new Date() });
  const row = LEADS_.fields.map(([k]) => k === "at" ? (x.at instanceof Date ? x.at : new Date(x.atMs || Date.now())) : k === "updated" ? x.updated : (x[k] === undefined ? "" : x[k]));
  leadsSheet_().getRange(x.row, 1, 1, row.length).setValues([row.map(cell_)]);
}

// الجوال السعودي بصيغة 9665xxxxxxxx، أو الرقم كما هو إن كان دولياً صالحاً
function leadsPhone_(v) {
  let d = String(v || "").replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[^\d+]/g, "");
  if (/^\+/.test(d)) d = d.slice(1);
  if (/^00/.test(d)) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = "966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) d = "966" + d;
  return /^\d{9,15}$/.test(d) ? d : "";
}

// ---------------- الإجراء العام: يُستدعى من doPost قبل تسجيل الدخول ----------------
function handleLeadPublic_(data) {
  if (!data || data.action !== "lead_submit") return null;
  const ok = msg => json_({ status: "success", message: msg || "شكراً لك، وصلنا طلبك وبنتواصل معك قريباً." });
  const bad = msg => json_({ status: "error", message: msg });
  try {
    const cfg = leadsCfg_();
    if (!cfg.enabled) return bad("النموذج متوقف حالياً. تواصل معنا عبر الهاتف أو البريد.");
    if (!data.key || String(data.key) !== cfg.key) return bad("رابط النموذج قديم. حدّث الصفحة أو تواصل معنا مباشرة.");
    if (data.website) return ok(); // حقل فخ: الإنسان لا يراه
    if (!(Number(data.elapsed) >= LEADS_.minFillMs)) return ok();
    if (data.consent !== true) return bad("نحتاج موافقتك على استخدام بياناتك للتواصل معك.");
    const clean = (v, n) => String(v === undefined || v === null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
    const lead = { name: clean(data.name, 80), company: clean(data.company, 120), city: clean(data.city, 60), service: clean(data.service, 120),
      message: String(data.message || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, 1000),
      brand: LEADS_.brands.indexOf(data.brand) >= 0 ? data.brand : "انطلق", page: clean(data.page, 300).replace(/^(?!https?:\/\/).*/, ""),
      phone: leadsPhone_(data.phone), email: clean(data.email, 160).toLowerCase() };
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return bad("البريد غير صحيح.");
    if (String(data.phone || "").trim() && !lead.phone) return bad("رقم الجوال غير صحيح.");
    if (!lead.name) return bad("اكتب اسمك.");
    if (!lead.phone && !lead.email) return bad("اكتب رقم جوالك أو بريدك لنتواصل معك.");

    // حدود: في الدقيقة (ذاكرة مؤقتة) وفي اليوم (خصائص)
    const cache = CacheService.getScriptCache(), minKey = "lead_min_" + Math.floor(Date.now() / 60000);
    const perMin = Number(cache.get(minKey)) || 0;
    if (perMin >= LEADS_.perMinute) return bad("طلبات كثيرة الآن؛ حاول بعد دقيقة.");
    cache.put(minKey, String(perMin + 1), 120);
    const tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    let day = {};
    try { day = JSON.parse(officeProps_().getProperty(LEADS_.dayKey) || "{}"); } catch (e) {}
    if (day.date !== today) day = { date: today, n: 0 };
    if (day.n >= cfg.dailyCap) return bad("استقبلنا طلبات كثيرة اليوم؛ تواصل معنا عبر الهاتف أو البريد.");

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      day.n++; officeProps_().setProperty(LEADS_.dayKey, JSON.stringify(day));
      const all = leadsAll_(), now = Date.now();
      const dup = all.find(x => x.atMs && now - x.atMs < LEADS_.dedupeMs && ((lead.phone && x.phone === lead.phone) || (lead.email && x.email === lead.email)));
      const links = (lead.message.match(/https?:\/\/|www\./gi) || []).length;
      const status = dup ? "مكرر" : links > LEADS_.maxLinks ? "مشتبه" : "جديد";
      const x = Object.assign({ id: "LEAD-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: new Date(), status: status, dealId: "", prospectId: "", note: dup ? "مكرر لـ " + dup.id : links > LEADS_.maxLinks ? "روابط كثيرة في الرسالة" : "", updated: new Date() }, lead);
      leadsSheet_().appendRow(LEADS_.fields.map(([k]) => x[k] === undefined ? "" : x[k]).map(cell_));
      x.row = leadsSheet_().getLastRow();
      if (status === "جديد") leadsAccept_(x, cfg);
      else if (dup && lead.message) leadsWrite_(Object.assign({}, dup), { note: (dup.note ? dup.note + " · " : "") + "رسالة أخرى " + Utilities.formatDate(new Date(), tz, "MM-dd HH:mm") + ": " + lead.message.slice(0, 200) });
    } finally { lock.releaseLock(); }
    return ok();
  } catch (err) {
    console.log("تعذر استقبال طلب الموقع: " + (err && err.message));
    return bad("تعذر إرسال الطلب الآن؛ تواصل معنا عبر الهاتف أو البريد.");
  }
}

// طلب سليم: صفقة في المسار، وتنبيه لك، وانتظار رد مازن إن ترك بريده
function leadsAccept_(x, cfg) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"), patch = {};
  if (typeof pipeNew_ === "function") {
    const d = pipeNew_({ company: x.company || x.name, contact: x.name, email: x.email, phone: x.phone, city: x.city, service: x.service, source: "الموقع", sourceId: x.id,
      note: x.message.slice(0, 500), nextStep: x.phone ? "اتصل بهم (طلبوا تواصلاً من موقع " + x.brand + ")" : "رد على طلبهم من موقع " + x.brand, nextAt: today }, "الموقع");
    patch.dealId = d.id;
  }
  if (x.email && cfg.autoDraft && typeof prospectsSheet_ === "function") {
    const v = { id: "PRS-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: new Date(), company: (x.company || x.name).slice(0, 150), sector: "طلب من الموقع", city: x.city,
      website: x.page, email: x.email, emailSource: "نموذج موقع " + x.brand, verified: "من نموذج الموقع", why: ("طلب تواصل من موقع " + x.brand + (x.service ? " بخصوص: " + x.service : "") + (x.message ? ". رسالته: " + x.message : "")).slice(0, 500),
      service: x.service.slice(0, 120), status: PST_.wait, note: "طلب من الموقع " + x.id, updated: new Date(), domain: "", followUps: 0 };
    prospectsSheet_().appendRow(PROSPECTS_.fields.map(([k]) => v[k] === undefined ? "" : v[k]).map(cell_));
    patch.prospectId = v.id;
  }
  leadsWrite_(x, patch);
  officeLog_("طلب من الموقع", "",(x.company || x.name) + " · " + (x.service || "بلا خدمة محددة") + " · موقع " + x.brand, "الموقع");
  if (cfg.alert) {
    try {
      const to = typeof digestRecipient_ === "function" ? digestRecipient_(digestCfg_()) : Session.getEffectiveUser().getEmail();
      if (to) MailApp.sendEmail({ to: to, name: "مكتب انطلق الذكي", subject: "عميل جديد من موقع " + x.brand + ": " + (x.company || x.name),
        body: ["طلب تواصل جديد من موقع " + x.brand + ":", "", "الاسم: " + x.name, x.company ? "المنشأة: " + x.company : "", x.phone ? "الجوال: +" + x.phone + " (واتساب: https://wa.me/" + x.phone + ")" : "",
          x.email ? "البريد: " + x.email : "", x.city ? "المدينة: " + x.city : "", x.service ? "الخدمة: " + x.service : "", x.message ? "\nالرسالة:\n" + x.message : "", "",
          "أُضيف إلى مسار المبيعات بخطوة لليوم" + (patch.prospectId ? "، ويكتب مازن رداً يصلك للموافقة خلال دقائق." : "."),
          "اللوحة: " + (typeof DIGEST_ === "object" ? DIGEST_.dashboard : "")].filter(s => s !== "").join("\n") });
    } catch (e) { console.log("تعذر تنبيه طلب الموقع: " + e.message); }
  }
}

// ---------------- رد مازن على طلبات الموقع (مشغل كل 10 دقائق) ----------------
function leadsDraft_(items) {
  const cfg = prospectsCfg_();
  const prompt = "هؤلاء عملاء طلبوا التواصل معنا بأنفسهم عبر نموذج موقعنا (وليسوا عملاء نراسلهم أول مرة). اكتب لكل واحد رد بريد قصيراً من «انطلق للطاقة» بالعربية الفصحى المهنية:\n"
    + "(1) شكر على تواصلهم باسمهم. (2) إشارة محددة لما طلبوه في why. (3) الخطوة التالية: نتصل بكم لتحديد موعد مناسب، أو نطلب منهم أنسب وقت للاتصال أو معلومة واحدة لازمة (مثل نوع المبنى أو مساحة السطح أو متوسط الفاتورة). "
    + "الطول من 60 إلى 120 كلمة. لا أسعار ولا أرقام وفر ولا وعود. الموضوع يبدأ بـ «بخصوص طلبكم:» ثم ما طلبوه باختصار.\n"
    + prospectsWriteRules_(cfg).replace("ثم سطر أخير: «" + PROSPECTS_.optOut + "»", "") + "\n"
    + 'أعد JSON فقط: {"drafts": [{"id": "المعرف كما هو", "subject": "الموضوع", "body": "نص الرسالة كاملاً", "hook": ""}]}\n\nالطلبات:\n'
    + JSON.stringify(items.map(p => ({ id: p.id, name: p.company, city: p.city, why: p.why, service: p.service })));
  return prospectsParseDrafts_(callGemini(AGENTS_PROMPTS[PROSPECTS_.agent], prompt, true), "drafts", items);
}

function leadsDraftPending_() {
  if (typeof prospectsAll_ !== "function") return 0;
  const items = prospectsAll_().filter(p => p.status === PST_.wait && p.verified === "من نموذج الموقع").slice(0, 5);
  if (!items.length) return 0;
  const drafts = leadsDraft_(items), audits = prospectsAudit_(items, drafts, "first"), taskId = prospectsTaskLog_(items, drafts, audits, "first");
  let done = 0;
  items.forEach(p => {
    const d = drafts[p.id];
    if (!d) return;
    const a = audits[p.id] || { score: null, text: "" }, low = a.score === null || a.score < 70;
    prospectsWrite_(p, { subject: d.subject, body: d.body, audit: a.text, hook: "", status: low ? PST_.check : PST_.ready, taskId: taskId,
      note: [p.note, low ? "تقدير سالم أقل من 70% أو غير متوفر؛ راجع الرد قبل الإرسال" : ""].filter(Boolean).join(" · ") });
    done++;
  });
  return done;
}

function officeRunLeads() {
  try {
    if (typeof prospectsAll_ !== "function") return;
    const waiting = prospectsAll_().some(p => p.status === PST_.wait && p.verified === "من نموذج الموقع");
    if (!waiting) return;
    if (officeAgentCfg_(PROSPECTS_.agent).active === false || officeAgentCfg_("سالم").active === false) return;
    if (typeof claudeEnabled_ === "function" && claudeEnabled_() && typeof claudeWorkerOnline_ === "function" && !claudeWorkerOnline_() && !(typeof claudeFallbackAllowed_ === "function" && claudeFallbackAllowed_())) return;
    executionDeadline_ = Date.now() + 240000;
    const n = leadsDraftPending_();
    if (n) officeLog_("ردود طلبات الموقع", PROSPECTS_.agent, "كتب مازن " + n + " رد وتنتظر موافقتك", "آلي");
  } catch (err) { officeLog_("تعذر رد مازن على طلبات الموقع", PROSPECTS_.agent, String(err.message || err).slice(0, 300), "آلي"); }
}

// ---------------- اللوحة ----------------
function leadsState_() {
  const cfg = leadsCfg_(), all = leadsAll_(), since = Date.now() - 7 * 86400000;
  const pros = typeof prospectsAll_ === "function" ? prospectsAll_() : [];
  const items = all.slice(-LEADS_.listed).reverse().map(x => {
    const y = Object.assign({}, x); delete y.row;
    const p = x.prospectId ? pros.find(q => q.id === x.prospectId) : null;
    y.reply = p ? p.status : "";
    return y;
  });
  return { status: "success", cfg: { enabled: cfg.enabled, key: cfg.key, dailyCap: cfg.dailyCap, alert: cfg.alert, autoDraft: cfg.autoDraft },
    services: LEADS_.services, brands: LEADS_.brands, items: items,
    stats: { week: all.filter(x => x.atMs >= since && (x.status === "جديد" || x.status === "تواصلنا" || x.status === "مغلق")).length, fresh: all.filter(x => x.status === "جديد").length,
      spam: all.filter(x => x.status === "مشتبه").length, last: all.length ? all[all.length - 1].at : "" } };
}

function leadsSaveCfg_(d) {
  const cfg = leadsCfg_();
  if (d.rotate) cfg.key = Utilities.getUuid().replace(/-/g, "").slice(0, 20);
  if (d.enabled !== undefined) cfg.enabled = !!d.enabled;
  if (d.alert !== undefined) cfg.alert = !!d.alert;
  if (d.autoDraft !== undefined) cfg.autoDraft = !!d.autoDraft;
  if (d.dailyCap !== undefined) { const n = Number(d.dailyCap); if (!(n >= 1 && n <= 500)) throw appError_("VALIDATION_ERROR", "الحد اليومي من 1 إلى 500"); cfg.dailyCap = Math.round(n); }
  officeProps_().setProperty(LEADS_.cfgKey, JSON.stringify(cfg));
}

function handleLeadsAction_(data, user) {
  try {
    officeApply_();
    const by = officeBy_(user), a = data.action;
    if (a === "leads_cfg") { leadsSaveCfg_(data); officeLog_(data.rotate ? "تغيير رمز نموذج الموقع" : "إعدادات نموذج الموقع", "", "", by); }
    else if (a === "leads_update") {
      const x = leadsAll_().find(l => l.id === data.id);
      if (!x) throw appError_("NOT_FOUND", "الطلب غير موجود");
      if (LEADS_.statuses.indexOf(data.status) < 0) throw appError_("VALIDATION_ERROR", "حالة غير معروفة");
      leadsWrite_(x, { status: data.status });
      // طلب مشتبه تؤكد أنه حقيقي: يدخل المسار كالسليم
      if (data.status === "جديد" && !x.dealId) leadsAccept_(x, Object.assign(leadsCfg_(), { alert: false }));
    }
    else if (a !== "leads_get") throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    return json_(leadsState_());
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
