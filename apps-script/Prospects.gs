/**
 * Prospects.gs — مازن: يبحث عن منشآت سعودية (فنادق، مستشفيات، مولات، مجمعات سكنية، شركات) تناسب وهج وانطلق،
 * ويجمع بريدها الرسمي المنشور علناً، ويكتب مسودة رسالة تعريفية يدققها سالم. أنت ترسلها بنفسك؛ لا يُرسل شيء تلقائياً.
 *
 * - البحث في الإنترنت عبر عامل Claude على جهازك (AI_ENGINE=claude والعامل شغّال). Gemini الاحتياطي لا يبحث.
 * - البريد: فقط المنشور في موقع المنشأة أو صفحتها الرسمية، مع رابط الصفحة. يتحقق الخادم بنفسه أن البريد موجود في تلك الصفحة؛
 *   وإلا (أو إن بدا بريداً شخصياً أو من نطاق مختلف) تُعلَّم «تحقق يدوي». لا تخمين لعناوين، ولا بيانات أفراد.
 * - لا تكرار: نطاق كل منشأة وبريدها محفوظان ويُستبعدان من البحث القادم.
 * - كل دورة: يكتب مسودات المنشآت المنتظرة أولاً، ثم يبحث عن جديد إن بقي وقت (قطاع × مدينة بالتناوب).
 * - كل مسودة تُسجَّل في سجل المهام باسم مازن مع تدقيق سالم، فتظهر في بطاقته والملخص التنفيذي والعقل.
 *
 * يعتمد على Code.gs: setupSheets, callGemini, callClaude_, claudeEnabled_, claudeWorkerOnline_, CLAUDE_, COMMON_RULES, companyProfile_,
 *   AGENTS_PROMPTS, runAudit_, salemScore_, average_, stripFences_, cell_, json_, appError_, checkBudget_, executionDeadline_, PLAN_BUDGET_MS, MAX_CELL_CHARS
 * ويعتمد على Office.gs: officeSystemFor_, officeLoad_, officeProps_, officeLog_, officeBy_, officeApply_, officeTeamReady_, officeInstallTriggers_
 */

const PROSPECTS_ = {
  agent: "مازن",
  sheet: "Prospects",
  headers: ["ID", "التاريخ", "المنشأة", "القطاع", "المدينة", "الموقع", "البريد", "مصدر البريد", "تحقق البريد", "لماذا تناسبنا", "الخدمة",
    "الموضوع", "المسودة", "تدقيق سالم", "الحالة", "ملاحظات", "آخر تحديث", "النطاق", "المهمة"],
  statuses: ["بانتظار المسودة", "جاهز للإرسال", "تحقق يدوي", "أُرسل", "ردّوا", "مستبعد"],
  sectors: ["فنادق", "مستشفيات", "مولات ومراكز تجارية", "مجمعات سكنية", "شركات ومبانٍ إدارية"],
  cities: ["الرياض", "جدة", "الدمام والخبر", "مكة المكرمة", "المدينة المنورة"],
  everyHours: [2, 4, 6, 8, 12],
  cursorKey: "PROSPECTS_CURSOR",
  roleEmail: /^(info|contact|contactus|sales|marketing|hello|enquir|inquir|admin|office|procure|purchas|tender|facilit|engineer|maintenance|operations|ops|support|customer|care|cs|pr|media|business|bd|partner|reservation|booking|hotel|frontoffice|services?|general|communication|feedback|reception|management)/i,
  listed: 300, maxExclude: 150
};

// مازن وكيل جديد: يُضاف إلى أدوار الوكلاء (التعليمات الأصلية؛ تُعدَّل من إدارة المكتب)
if (typeof AGENTS_PROMPTS === "object" && !AGENTS_PROMPTS[PROSPECTS_.agent]) {
  AGENTS_PROMPTS[PROSPECTS_.agent] = "أنت مازن، مسؤول استقطاب العملاء في انطلق. تبحث عن منشآت سعودية كبيرة الاستهلاك للطاقة (فنادق، مستشفيات، مولات ومراكز تجارية، مجمعات سكنية، شركات ومبانٍ إدارية) "
    + "يمكن أن تستفيد من حلول انطلق في تدقيق الطاقة والقياس وإدارة المباني والطاقة الشمسية ومنصة وهج، وتجمع بيانات التواصل الرسمية المنشورة علناً فقط، "
    + "وتكتب رسائل تعريفية قصيرة ومهذبة ومخصصة لكل منشأة بصوت انطلق الرصين. لا تخمّن عناوين بريد، ولا تجمع بيانات أفراد، ولا تَعِد بنتائج أو أرقام أو أسعار غير موجودة في ملف الشركة.";
}

// ---------------- التخزين ----------------
function prospectsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PROSPECTS_.sheet);
  if (!sh) { sh = ss.insertSheet(PROSPECTS_.sheet); sh.appendRow(PROSPECTS_.headers); sh.setFrozenRows(1); }
  return sh;
}

function prospectsAll_() {
  const sh = prospectsSheet_();
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone(), at = v => v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm") : String(v || "");
  return sh.getRange(2, 1, sh.getLastRow() - 1, PROSPECTS_.headers.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[0]), at: at(r[1]), company: String(r[2]), sector: String(r[3]), city: String(r[4]), website: String(r[5]),
    email: String(r[6]), emailSource: String(r[7]), verified: String(r[8]), why: String(r[9]), service: String(r[10]), subject: String(r[11]),
    body: String(r[12]), audit: String(r[13]), status: String(r[14]), note: String(r[15]), updated: at(r[16]), domain: String(r[17]), taskId: String(r[18])
  })).filter(p => p.id);
}

function prospectsWrite_(p, fields) {
  const cols = PROSPECTS_.headers;
  const sh = prospectsSheet_();
  Object.keys(fields).forEach(k => {
    const i = { company: 2, sector: 3, city: 4, website: 5, email: 6, emailSource: 7, verified: 8, why: 9, service: 10, subject: 11, body: 12, audit: 13, status: 14, note: 15, taskId: 18 }[k];
    if (i !== undefined) sh.getRange(p.row, i + 1).setValue(cell_(fields[k]));
  });
  sh.getRange(p.row, cols.indexOf("آخر تحديث") + 1).setValue(new Date());
}

function prospectsCfg_() {
  const c = (officeLoad_().cfg.automation || {}).prospects || {};
  const list = (v, def) => Array.isArray(v) && v.length ? v.map(s => String(s).trim()).filter(Boolean).slice(0, 12) : def.slice();
  return { enabled: c.enabled !== false, everyHours: PROSPECTS_.everyHours.indexOf(Number(c.everyHours)) >= 0 ? Number(c.everyHours) : 4,
    perRun: Math.min(5, Math.max(1, Number(c.perRun) || 3)), sectors: list(c.sectors, PROSPECTS_.sectors), cities: list(c.cities, PROSPECTS_.cities) };
}

// ---------------- أدوات التحقق ----------------
function prospectsDomain_(url) {
  const m = String(url || "").trim().match(/^https?:\/\/([^\/?#:]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}
// النطاق الأساسي: آخر جزأين، أو ثلاثة لنطاقات مثل com.sa و med.sa
function prospectsRoot_(host) {
  const parts = String(host || "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2];
  return (["com", "net", "org", "gov", "edu", "med", "sch"].indexOf(sld) >= 0 && parts[parts.length - 1].length === 2 ? parts.slice(-3) : parts.slice(-2)).join(".");
}
const prospectsEmailOk_ = e => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(e || ""));

// يجلب الصفحة ويتأكد أن البريد مكتوب فيها فعلاً (مع صيغ الإخفاء الشائعة)
function prospectsVerifyEmail_(email, url) {
  if (!email || !/^https?:\/\//i.test(String(url || ""))) return false;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EntaliqOffice/1.0)", "Accept-Language": "ar,en" } });
    if (res.getResponseCode() >= 400) return false;
    const html = res.getContentText().slice(0, 1500000).toLowerCase()
      .replace(/&#64;|&#x40;|\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*/g, "@").replace(/&#46;|\s*\[\s*dot\s*\]\s*|\s*\(\s*dot\s*\)\s*/g, ".");
    return html.indexOf(String(email).toLowerCase()) >= 0;
  } catch (e) { return false; }
}

// ---------------- البحث في الإنترنت (Claude عبر العامل) ----------------
function prospectsWebReady_() {
  return typeof claudeEnabled_ === "function" && claudeEnabled_() && typeof claudeWorkerOnline_ === "function" && claudeWorkerOnline_();
}

function prospectsWeb_(prompt) {
  if (!prospectsWebReady_()) throw appError_("NEEDS_CLAUDE", "البحث عن المنشآت يحتاج Claude مع البحث في الإنترنت: اضبط AI_ENGINE=claude وشغّل العامل على جهازك.");
  checkBudget_(90000);
  const profile = typeof companyProfile_ === "function" ? companyProfile_() : "";
  const system = officeSystemFor_(AGENTS_PROMPTS[PROSPECTS_.agent]) + "\n" + COMMON_RULES
    + (profile ? "\n\nملف الشركة (المرجع الوحيد لخدماتنا ومنتجاتنا):\n" + profile : "")
    + "\n\nلديك أداتا البحث وقراءة الصفحات. ابحث وتحقق من المواقع الرسمية بنفسك، ثم أعد JSON صالحاً فقط بلا أي نص قبله أو بعده وبلا علامات ```.";
  const remaining = executionDeadline_ ? executionDeadline_ - Date.now() - 20000 : CLAUDE_.waitMs;
  if (remaining < 60000) throw appError_("BUDGET_EXCEEDED", "اقترب حد التنفيذ؛ يكمل مازن البحث في الدورة القادمة");
  return String(callClaude_(system, prompt, { web: true, timeoutMs: Math.min(CLAUDE_.waitMs, remaining) }) || "").trim();
}

function prospectsNextTarget_(cfg) {
  const props = officeProps_(), n = Number(props.getProperty(PROSPECTS_.cursorKey)) || 0;
  const total = cfg.sectors.length * cfg.cities.length;
  props.setProperty(PROSPECTS_.cursorKey, String((n + 1) % Math.max(1, total)));
  return { sector: cfg.sectors[n % cfg.sectors.length], city: cfg.cities[Math.floor(n / cfg.sectors.length) % cfg.cities.length] };
}

function prospectsSearch_(cfg, by) {
  const target = prospectsNextTarget_(cfg), all = prospectsAll_();
  const known = new Set(all.map(p => p.domain).filter(Boolean)), knownEmails = new Set(all.map(p => p.email.toLowerCase()).filter(Boolean));
  const exclude = all.filter(p => p.sector === target.sector || p.city === target.city).map(p => p.domain).filter(Boolean).slice(-PROSPECTS_.maxExclude);
  const prompt = "ابحث في الإنترنت عن " + cfg.perRun + " منشآت سعودية من قطاع «" + target.sector + "» في «" + target.city + "» يمكن أن تستفيد من حلول انطلق لكفاءة الطاقة "
    + "(تدقيق الطاقة، القياس وخط الأساس، إدارة المباني ساعد، إدارة الطاقة أثر) أو منصة وهج للطاقة الشمسية للأسطح والمواقف.\n"
    + "فضّل المنشآت الكبيرة أو متعددة الفروع ذات الاستهلاك العالي للتبريد والكهرباء.\n"
    + "لكل منشأة: افتح موقعها الرسمي وصفحة التواصل، وانسخ بريد التواصل الرسمي المكتوب فيها حرفياً (مثل info@ أو sales@ أو contact@ أو procurement@ أو facilities@)، "
    + "وضع رابط الصفحة التي ظهر فيها البريد بالضبط. لا تخمّن بريداً ولا تركّبه من اسم النطاق، ولا تضع بريد شخص بعينه، ولا تستخدم مواقع أدلة أو قوائم كمصدر للبريد. "
    + "إن لم تجد بريداً رسمياً منشوراً فاترك email فارغاً وضع رابط صفحة التواصل في contactPage.\n"
    + (exclude.length ? "لا تكرر هذه النطاقات (موجودة لدينا): " + exclude.join("، ") + "\n" : "")
    + 'أعد JSON فقط: {"companies": [{"name": "اسم المنشأة", "website": "https://…", "city": "' + target.city + '", "sector": "' + target.sector + '", '
    + '"why": "لماذا تناسب انطلق أو وهج في جملتين من معلومات عامة منشورة (الحجم، عدد الفروع أو الأسرّة أو الغرف، مشاريع الاستدامة)", '
    + '"service": "الخدمة الأنسب من ملف الشركة", "email": "البريد كما هو مكتوب أو فارغ", "emailSource": "رابط الصفحة التي فيها البريد", "contactPage": "رابط صفحة التواصل"}]}';
  const raw = prospectsWeb_(prompt);
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  const list = j && Array.isArray(j.companies) ? j.companies : [];
  const sh = prospectsSheet_(), added = [];
  list.slice(0, cfg.perRun + 2).forEach(c => {
    if (!c || typeof c.name !== "string" || !c.name.trim()) return;
    const website = String(c.website || "").trim(), domain = prospectsDomain_(website);
    if (!domain || known.has(domain)) return;
    let email = String(c.email || "").trim().replace(/^mailto:/i, "").toLowerCase();
    if (email && knownEmails.has(email)) return; // المنشأة نفسها محفوظة ببريدها
    if (email && !prospectsEmailOk_(email)) email = "";
    const source = String(c.emailSource || c.contactPage || "").trim();
    const issues = [];
    let verified = "بلا بريد منشور";
    if (email) {
      const okPage = prospectsVerifyEmail_(email, source);
      verified = okPage ? "موثّق من الصفحة" : "غير موثّق";
      if (!okPage) issues.push("لم يُعثر على البريد في الصفحة المذكورة");
      if (prospectsRoot_(email.split("@")[1]) !== prospectsRoot_(domain)) issues.push("نطاق البريد يختلف عن الموقع");
      if (!PROSPECTS_.roleEmail.test(email.split("@")[0])) issues.push("قد يكون بريداً شخصياً");
    } else issues.push("لا بريد منشوراً؛ استخدم صفحة التواصل");
    const id = "PRS-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    sh.appendRow([id, new Date(), c.name.trim().slice(0, 150), target.sector, String(c.city || target.city).slice(0, 60), website.slice(0, 300), email, source.slice(0, 500),
      verified, String(c.why || "").replace(/\s+/g, " ").slice(0, 500), String(c.service || "").slice(0, 120), "", "", "", "بانتظار المسودة", issues.join(" · "), new Date(), domain, ""].map(cell_));
    known.add(domain); if (email) knownEmails.add(email);
    added.push(id);
  });
  officeLog_("بحث مازن", PROSPECTS_.agent, target.sector + " · " + target.city + " — وُجدت " + added.length + " منشآت جديدة", by || "آلي");
  return { target: target, added: added.length };
}

// ---------------- كتابة المسودات وتدقيقها ----------------
function prospectsDraft_(items, by) {
  const brief = items.map(p => ({ id: p.id, name: p.company, sector: p.sector, city: p.city, why: p.why, service: p.service, website: p.website }));
  const prompt = "اكتب لكل منشأة أدناه رسالة بريد تعريفية أولى من «انطلق للطاقة» بالعربية الفصحى المهنية المناسبة لقطاع الأعمال السعودي.\n"
    + "القواعد: موضوع جذاب لا يتجاوز 70 حرفاً؛ نص من 90 إلى 170 كلمة؛ افتتاحية مخصصة لواقع المنشأة وقطاعها في السعودية (مثل أحمال التبريد في الصيف، راحة النزلاء أو المرضى، ساعات التشغيل الطويلة)؛ "
    + "خدمة واحدة أو اثنتان من ملف الشركة فقط (منصة وهج للطاقة الشمسية للأسطح والمواقف، أو تدقيق الطاقة والقياس، أو ساعد لإدارة المباني، أو أثر لإدارة الطاقة)؛ "
    + "دعوة واضحة لاجتماع تعريفي قصير مع رابط التواصل من ملف الشركة؛ توقيع «فريق انطلق للطاقة — الرياض» مع رابط الموقع؛ "
    + "وسطر أخير: «إن لم يكن الموضوع من اهتمامكم يكفي الرد بذلك ولن نراسلكم مجدداً.» "
    + "لا أرقام وفر أو أسعار أو وعود غير موجودة في ملف الشركة، ولا تدّعِ معرفة داخلية بالمنشأة؛ استخدم ما في «why» فقط.\n"
    + 'أعد JSON فقط: {"drafts": [{"id": "المعرف كما هو", "subject": "الموضوع", "body": "نص الرسالة كاملاً"}]}\n\nالمنشآت:\n' + JSON.stringify(brief);
  const raw = callGemini(AGENTS_PROMPTS[PROSPECTS_.agent], prompt, true);
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  const drafts = j && Array.isArray(j.drafts) ? j.drafts : [];
  const taskSheet = setupSheets().getSheetByName("Tasks");
  let done = 0;
  items.forEach(p => {
    const d = drafts.find(x => x && x.id === p.id);
    if (!d || typeof d.subject !== "string" || typeof d.body !== "string" || !d.body.trim()) return;
    const subject = d.subject.replace(/\s+/g, " ").trim().slice(0, 120), body = d.body.trim().slice(0, 4000);
    let audit, score = null;
    try {
      audit = runAudit_({ type: "content", agentName: PROSPECTS_.agent, task: "رسالة تعريفية إلى " + p.company + " (" + p.sector + "، " + p.city + ")",
        output: "الموضوع: " + subject + "\n\n" + body, source: "معلومات المنشأة: " + p.why }).text;
      score = salemScore_(audit);
    } catch (err) { audit = "تعذر التدقيق: " + err.message; }
    const taskId = "TSK-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    taskSheet.appendRow([taskId, new Date(), PROSPECTS_.agent, "[مسودة تواصل] " + p.company + " — " + p.sector + "، " + p.city, "الموضوع: " + subject + "\n\n" + body, audit,
      score === null ? "بانتظار التدقيق" : "مكتمل"].map(cell_));
    const clean = p.verified === "موثّق من الصفحة" && !/شخصياً|يختلف/.test(p.note) && score !== null && score >= 70;
    prospectsWrite_(p, { subject: subject, body: body, audit: audit, status: clean ? "جاهز للإرسال" : "تحقق يدوي", taskId: taskId,
      note: [p.note, score !== null && score < 70 ? "تقدير سالم أقل من 70%" : ""].filter(Boolean).join(" · ") });
    done++;
  });
  return done;
}

function prospectsRun_(by, auto) {
  const cfg = prospectsCfg_(), result = { drafted: 0, found: 0, target: null, warnings: [] };
  const waiting = () => prospectsAll_().filter(p => p.status === "بانتظار المسودة");
  const budget = ms => !executionDeadline_ || Date.now() + ms < executionDeadline_;
  let pend = waiting();
  if (pend.length && budget(120000)) { result.drafted += prospectsDraft_(pend.slice(0, cfg.perRun), by); pend = waiting(); }
  if (pend.length < cfg.perRun && budget(200000)) {
    if (!prospectsWebReady_()) { if (!auto) throw appError_("NEEDS_CLAUDE", "البحث عن المنشآت يحتاج Claude مع البحث في الإنترنت: اضبط AI_ENGINE=claude وشغّل العامل على جهازك."); }
    else {
      const s = prospectsSearch_(cfg, by);
      result.found = s.added; result.target = s.target;
      pend = waiting();
      if (pend.length && budget(120000)) result.drafted += prospectsDraft_(pend.slice(0, cfg.perRun), by);
    }
  }
  result.pending = waiting().length;
  return result;
}

// ---------------- الإحصاءات والإجراءات ----------------
function prospectsStats_(all) {
  const by = {};
  PROSPECTS_.statuses.forEach(s => { by[s] = 0; });
  all.forEach(p => { by[p.status] = (by[p.status] || 0) + 1; });
  const sent = (by["أُرسل"] || 0) + (by["ردّوا"] || 0);
  return { total: all.length, byStatus: by, draftAvg: average_(all.filter(p => p.audit).map(p => salemScore_(p.audit))),
    replyRate: sent ? Math.round(100 * (by["ردّوا"] || 0) / sent) : null, sent: sent };
}

function prospectsState_(statsOnly) {
  const all = prospectsAll_();
  const out = { status: "success", stats: prospectsStats_(all), cfg: prospectsCfg_(), webReady: prospectsWebReady_() };
  if (!statsOnly) out.items = all.slice(-PROSPECTS_.listed).reverse().map(p => { const x = Object.assign({}, p); delete x.row; x.score = salemScore_(p.audit); return x; });
  return out;
}

function prospectsUpdate_(d, by) {
  const p = prospectsAll_().find(x => x.id === String(d.id || ""));
  if (!p) throw appError_("NOT_FOUND", "المنشأة غير موجودة");
  const f = {};
  if (d.status !== undefined) {
    if (PROSPECTS_.statuses.indexOf(d.status) < 0 || d.status === "بانتظار المسودة") throw appError_("VALIDATION_ERROR", "حالة غير معروفة");
    f.status = d.status;
  }
  if (d.subject !== undefined || d.body !== undefined) {
    const subject = String(d.subject === undefined ? p.subject : d.subject).trim(), body = String(d.body === undefined ? p.body : d.body).trim();
    if (!subject || !body) throw appError_("VALIDATION_ERROR", "الموضوع والنص مطلوبان");
    if (subject.length > 150 || body.length > 6000) throw appError_("VALIDATION_ERROR", "الرسالة أطول من الحد");
    f.subject = subject; f.body = body;
  }
  if (d.email !== undefined) {
    const email = String(d.email).trim().toLowerCase();
    if (email && !prospectsEmailOk_(email)) throw appError_("VALIDATION_ERROR", "بريد غير صالح");
    f.email = email; f.verified = email ? "عدّلته يدوياً" : "بلا بريد منشور";
  }
  if (d.note !== undefined) f.note = String(d.note).slice(0, 500);
  prospectsWrite_(p, f);
  if (f.status) officeLog_({ "أُرسل": "أرسلتَ رسالة مازن", "ردّوا": "ردّت منشأة", "مستبعد": "استبعاد منشأة", "جاهز للإرسال": "إرجاع منشأة للإرسال", "تحقق يدوي": "إرجاع منشأة للتحقق" }[f.status] || "تحديث منشأة",
    PROSPECTS_.agent, p.company + (p.email ? " · " + p.email : ""), by);
  // الرد إشارة نجاح: تُقترح الرسالة مثالاً مرجعياً لمازن في العقل (تنتظر اعتمادك)
  if (f.status === "ردّوا" && typeof brainSave_ === "function" && p.body) {
    try {
      if (!brainLoad_().some(x => x.source === p.id)) brainSave_({ agent: PROSPECTS_.agent, type: "مثال جيد", status: "مقترح", source: p.id,
        text: ("رسالة حصلت على رد من " + p.company + " (" + p.sector + "):\nالموضوع: " + (f.subject || p.subject) + "\n" + (f.body || p.body)).slice(0, 1200) }, "مازن");
    } catch (e) { console.log("تعذر اقتراح المثال: " + e.message); }
  }
}

function prospectsSaveCfg_(d) {
  const cfg = officeLoad_().cfg, x = d.cfg || {};
  const list = v => Array.isArray(v) ? v.map(s => String(s).trim()).filter(Boolean).slice(0, 12) : [];
  const sectors = list(x.sectors), cities = list(x.cities);
  if (!sectors.length || !cities.length) throw appError_("VALIDATION_ERROR", "اختر قطاعاً ومدينة على الأقل");
  if (sectors.concat(cities).some(s => s.length > 40)) throw appError_("VALIDATION_ERROR", "اسم القطاع أو المدينة طويل");
  const every = Number(x.everyHours), per = Number(x.perRun);
  if (PROSPECTS_.everyHours.indexOf(every) < 0) throw appError_("VALIDATION_ERROR", "التكرار: " + PROSPECTS_.everyHours.join(" أو ") + " ساعات");
  if (!(per >= 1 && per <= 5)) throw appError_("VALIDATION_ERROR", "عدد المنشآت في كل دورة من 1 إلى 5");
  cfg.automation.prospects = { enabled: !!x.enabled, everyHours: every, perRun: per, sectors: sectors, cities: cities };
  officeProps_().setProperty("OFFICE_CFG", JSON.stringify(cfg));
}

function officeRunProspects() {
  const cfg = prospectsCfg_();
  if (!cfg.enabled || !officeTeamReady_([PROSPECTS_.agent, "سالم"])) return;
  executionDeadline_ = Date.now() + PLAN_BUDGET_MS;
  try { prospectsRun_("آلي", true); }
  catch (err) { officeLog_("تعذر عمل مازن", PROSPECTS_.agent, String(err.message || err).slice(0, 300), "آلي"); }
}

function handleProspectsAction_(data, user) {
  try {
    officeApply_();
    const by = officeBy_(user), a = data.action;
    let extra = {};
    if (a === "prospects_get") return json_(prospectsState_(!!data.statsOnly));
    if (a === "prospects_run") { executionDeadline_ = Date.now() + 270000; extra = { run: prospectsRun_(by, false) }; }
    else if (a === "prospects_update") prospectsUpdate_(data, by);
    else if (a === "prospects_cfg") { prospectsSaveCfg_(data); officeCache_ = null; officeInstallTriggers_(); officeLog_("إعدادات مازن", PROSPECTS_.agent, "", by); }
    else throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    officeCache_ = null;
    return json_(Object.assign(prospectsState_(false), extra));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
