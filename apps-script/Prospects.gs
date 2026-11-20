/**
 * Prospects.gs — مازن: مرسل بريد محترف لاستقطاب العملاء.
 *
 * كل يوم يجهز مازن حتى 20 منشأة سعودية (فنادق، مستشفيات، مولات، مجمعات سكنية، شركات) تناسب وهج وانطلق:
 * - البحث في الإنترنت عبر عامل Claude على جهازك (AI_ENGINE=claude والعامل شغّال)، متنقلاً بين القطاعات والمدن.
 * - البريد: فقط المنشور في موقع المنشأة الرسمي، ويتحقق الخادم بنفسه أنه مكتوب في الصفحة؛ وإلا «تحقق يدوي».
 * - مطلع على الفريق: يقرأ أخبار نواف وتحليل فيصل (المستجدات، الاتفاقيات، شركات الطاقة، فرص الترشيد) وآخر ملخص لراكان،
 *   ويختار منها خطافاً يناسب قطاع كل منشأة.
 * - رسائل احترافية يدققها سالم دفعة واحدة. لا يُرسل شيء قبل موافقتك: تحدد الرسائل وتضغط «أرسل»، فتدخل طابور الإرسال.
 * - الإرسال: عامل جهازك يرسلها من بريد شركتك (SMTP في worker/.env)، متباعدة وفي أيام وساعات العمل، بحد يومي.
 * - المتابعة: بعد 5 أيام بلا رد يكتب مازن رسالة متابعة في نفس المحادثة، تنتظر موافقتك أيضاً.
 *
 * يعتمد على Code.gs: setupSheets, callGemini, callClaude_, claudeEnabled_, claudeWorkerOnline_, CLAUDE_, COMMON_RULES, companyProfile_, safeEqual_,
 *   AGENTS_PROMPTS, salemScore_, average_, startOfDay_, toDate_, stripFences_, cell_, json_, appError_, checkBudget_, executionDeadline_, PLAN_BUDGET_MS
 * ويعتمد على Office.gs: officeSystemFor_, officeLoad_, officeProps_, officeLog_, officeBy_, officeApply_, officeTeamReady_, officeInstallTriggers_
 * ويستخدم إن وُجد: execReports_ (Executive.gs)، brainSave_ و brainLoad_ (Brain.gs)
 */

const PROSPECTS_ = {
  agent: "مازن",
  sheet: "Prospects",
  // الترتيب ثابت: أول 19 عموداً من النسخة السابقة، والجديدة تُضاف في النهاية
  fields: [["id", "ID"], ["at", "التاريخ"], ["company", "المنشأة"], ["sector", "القطاع"], ["city", "المدينة"], ["website", "الموقع"], ["email", "البريد"],
    ["emailSource", "مصدر البريد"], ["verified", "تحقق البريد"], ["why", "لماذا تناسبنا"], ["service", "الخدمة"], ["subject", "الموضوع"], ["body", "المسودة"],
    ["audit", "تدقيق سالم"], ["status", "الحالة"], ["note", "ملاحظات"], ["updated", "آخر تحديث"], ["domain", "النطاق"], ["taskId", "المهمة"],
    ["sentAt", "أُرسل في"], ["lastSent", "آخر إرسال"], ["messageId", "معرف الرسالة"], ["followUps", "المتابعات"], ["fuSubject", "موضوع المتابعة"],
    ["fuBody", "نص المتابعة"], ["fuAudit", "تدقيق المتابعة"], ["sendKind", "نوع الإرسال"], ["sendAt", "موعد الإرسال"], ["sendError", "خطأ الإرسال"],
    ["claimedAt", "بدأ الإرسال"], ["hook", "الخبر المستخدم"]],
  dates: ["at", "updated", "sentAt", "lastSent", "sendAt", "claimedAt"],
  st: { wait: "بانتظار المسودة", ready: "جاهز للإرسال", check: "تحقق يدوي", queued: "في الطابور", sending: "جارٍ الإرسال", sent: "أُرسل",
    fuReady: "متابعة جاهزة", followed: "تمت المتابعة", replied: "ردّوا", excluded: "مستبعد", failed: "تعذر الإرسال" },
  sectors: ["فنادق", "مستشفيات", "مولات ومراكز تجارية", "مجمعات سكنية", "شركات ومبانٍ إدارية"],
  cities: ["الرياض", "جدة", "الدمام والخبر", "مكة المكرمة", "المدينة المنورة"],
  everyHours: [1, 2, 4, 6, 8, 12],
  signature: "مع خالص التحية،\nفريق انطلق للطاقة — الرياض\nhttps://entaliq.com.sa/ar",
  optOut: "إن لم يكن الموضوع من اهتمامكم يكفي الرد بذلك ولن نراسلكم مجدداً.",
  cursorKey: "PROSPECTS_CURSOR", mailerKey: "PROSPECTS_MAILER",
  roleEmail: /^(info|contact|contactus|sales|marketing|hello|enquir|inquir|admin|office|procure|purchas|tender|facilit|engineer|maintenance|operations|ops|support|customer|care|cs|pr|media|business|bd|partner|reservation|booking|hotel|frontoffice|services?|general|communication|feedback|reception|management)/i,
  listed: 400, maxExclude: 150, claimMs: 15 * 60000, mailerOnlineMs: 3 * 60000, day: 86400000
};
const PST_ = PROSPECTS_.st;

// مازن وكيل في الفريق: يُضاف إلى أدوار الوكلاء (التعليمات الأصلية؛ تُعدَّل من إدارة المكتب)
if (typeof AGENTS_PROMPTS === "object" && !AGENTS_PROMPTS[PROSPECTS_.agent]) {
  AGENTS_PROMPTS[PROSPECTS_.agent] = "أنت مازن، مسؤول تطوير الأعمال واستقطاب العملاء في انطلق، وكاتب بريد تجاري محترف. تبحث عن منشآت سعودية كبيرة الاستهلاك للطاقة "
    + "(فنادق، مستشفيات، مولات ومراكز تجارية، مجمعات سكنية، شركات ومبانٍ إدارية) يمكن أن تستفيد من حلول انطلق في تدقيق الطاقة والقياس وإدارة المباني والطاقة الشمسية ومنصة وهج، "
    + "وتجمع بيانات التواصل الرسمية المنشورة علناً فقط، وتكتب رسائل قصيرة مقنعة ومخصصة لكل منشأة بصوت انطلق الرصين، مستفيداً من مستجدات السوق التي يرصدها زملاؤك. "
    + "لا تخمّن عناوين بريد، ولا تجمع بيانات أفراد، ولا تَعِد بنتائج أو أرقام أو أسعار غير موجودة في ملف الشركة.";
}

// ---------------- التخزين ----------------
const prospectsHeaders_ = () => PROSPECTS_.fields.map(f => f[1]);
const prospectsCol_ = key => PROSPECTS_.fields.findIndex(f => f[0] === key);

function prospectsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), headers = prospectsHeaders_();
  let sh = ss.getSheetByName(PROSPECTS_.sheet);
  if (!sh) { sh = ss.insertSheet(PROSPECTS_.sheet); sh.appendRow(headers); sh.setFrozenRows(1); return sh; }
  const cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some((h, i) => cur[i] !== h)) sh.getRange(1, 1, 1, headers.length).setValues([headers]); // ترقية العناوين للأعمدة الجديدة
  return sh;
}

function prospectsAll_() {
  const sh = prospectsSheet_(), n = PROSPECTS_.fields.length;
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().map((r, i) => {
    const p = { row: i + 2, raw: r };
    PROSPECTS_.fields.forEach(([k], j) => {
      const v = r[j];
      if (PROSPECTS_.dates.indexOf(k) >= 0) {
        const d = v instanceof Date ? v : null;
        p[k] = d ? Utilities.formatDate(d, tz, "yyyy-MM-dd HH:mm") : ""; p[k + "Ms"] = d ? d.getTime() : 0;
      } else p[k] = v === undefined || v === null ? "" : (k === "followUps" ? Number(v) || 0 : String(v));
    });
    return p;
  }).filter(p => p.id);
}

function prospectsWrite_(p, fields) {
  const row = PROSPECTS_.fields.map((f, j) => p.raw[j] === undefined ? "" : p.raw[j]);
  Object.keys(fields).forEach(k => { const j = prospectsCol_(k); if (j >= 0) row[j] = fields[k]; });
  row[prospectsCol_("updated")] = new Date();
  prospectsSheet_().getRange(p.row, 1, 1, row.length).setValues([row.map(cell_)]);
  p.raw = row;
}

function prospectsCfg_() {
  const c = (officeLoad_().cfg.automation || {}).prospects || {};
  const list = (v, def) => Array.isArray(v) && v.length ? v.map(s => String(s).trim()).filter(Boolean).slice(0, 12) : def.slice();
  const num = (v, def, min, max) => { const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : def; };
  const time = (v, def) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : def;
  const days = Array.isArray(c.sendDays) && c.sendDays.length ? c.sendDays.map(Number).filter(d => d >= 0 && d <= 6) : [0, 1, 2, 3, 4];
  return {
    enabled: c.enabled !== false, everyHours: PROSPECTS_.everyHours.indexOf(Number(c.everyHours)) >= 0 ? Number(c.everyHours) : 1,
    perRun: num(c.perRun, 5, 1, 5), dailyTarget: num(c.dailyTarget, 20, 1, 40), sectors: list(c.sectors, PROSPECTS_.sectors), cities: list(c.cities, PROSPECTS_.cities),
    followUpDays: num(c.followUpDays, 5, 2, 21), maxFollowUps: num(c.maxFollowUps, 1, 0, 2),
    sendFrom: time(c.sendFrom, "09:00"), sendTo: time(c.sendTo, "16:00"), sendDays: days, gapMin: num(c.gapMin, 3, 1, 30), dailyCap: num(c.dailyCap, 40, 1, 100),
    signature: typeof c.signature === "string" && c.signature.trim() ? c.signature.trim().slice(0, 400) : PROSPECTS_.signature
  };
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

// ---------------- مطلع على الفريق: مستجدات السوق ----------------
// من أخبار نواف (العنوان والخدمة) وتحليل فيصل (الفرصة)، وآخر ملخص لراكان
function prospectsMarketBrief_() {
  const lines = [];
  try {
    const sheet = setupSheets().getSheetByName("News"), last = sheet ? sheet.getLastRow() : 0;
    if (last >= 2) {
      const n = Math.min(60, last - 1), tz = Session.getScriptTimeZone(), since = Date.now() - 21 * PROSPECTS_.day;
      const cut = (s, k) => String(s || "").replace(/\s+/g, " ").trim().slice(0, k);
      sheet.getRange(last - n + 1, 1, n, 11).getValues().reverse().forEach(r => {
        const d = toDate_(r[0]);
        if (!d || d.getTime() < since || !String(r[1] || "").trim() || lines.length >= 8) return;
        const host = prospectsDomain_(r[10] || r[2]);
        lines.push("- [" + Utilities.formatDate(d, tz, "yyyy-MM-dd") + "] " + cut(r[1], 140) + (r[7] ? " — الخدمة المرتبطة: " + cut(r[7], 60) : "")
          + (r[4] ? " — قراءة فيصل: " + cut(r[4], 200) : "") + (host ? " — المصدر: " + host : ""));
      });
    }
  } catch (e) { console.log("تعذر قراءة الأخبار لمازن: " + e.message); }
  try {
    const latest = typeof execReports_ === "function" ? execReports_(1)[0] : null;
    if (latest && latest.report) lines.push("خلاصة راكان (" + latest.kind + "): " + String(latest.report.headline + " — " + (latest.report.summary || "")).replace(/\s+/g, " ").slice(0, 300));
  } catch (e) {}
  return lines.join("\n").slice(0, 3000);
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

function prospectsSearch_(cfg, count, by) {
  const target = prospectsNextTarget_(cfg), all = prospectsAll_();
  const known = new Set(all.map(p => p.domain).filter(Boolean)), knownEmails = new Set(all.map(p => p.email.toLowerCase()).filter(Boolean));
  const exclude = all.filter(p => p.sector === target.sector || p.city === target.city).map(p => p.domain).filter(Boolean).slice(-PROSPECTS_.maxExclude);
  const brief = prospectsMarketBrief_();
  const prompt = "ابحث في الإنترنت عن " + count + " منشآت سعودية من قطاع «" + target.sector + "» في «" + target.city + "» يمكن أن تستفيد من حلول انطلق لكفاءة الطاقة "
    + "(تدقيق الطاقة، القياس وخط الأساس، إدارة المباني ساعد، إدارة الطاقة أثر) أو منصة وهج للطاقة الشمسية للأسطح والمواقف.\n"
    + "فضّل المنشآت الكبيرة أو متعددة الفروع ذات الاستهلاك العالي للتبريد والكهرباء، وتلك التي لها صلة بمستجدات السوق أدناه (مشاريع جديدة، توسعات، اتفاقيات طاقة أو استدامة).\n"
    + "لكل منشأة: افتح موقعها الرسمي وصفحة التواصل، وانسخ بريد التواصل الرسمي المكتوب فيها حرفياً (مثل info@ أو sales@ أو contact@ أو procurement@ أو facilities@)، "
    + "وضع رابط الصفحة التي ظهر فيها البريد بالضبط. لا تخمّن بريداً ولا تركّبه من اسم النطاق، ولا تضع بريد شخص بعينه، ولا تستخدم مواقع أدلة أو قوائم كمصدر للبريد. "
    + "إن لم تجد بريداً رسمياً منشوراً فاترك email فارغاً وضع رابط صفحة التواصل في contactPage.\n"
    + (exclude.length ? "لا تكرر هذه النطاقات (موجودة لدينا): " + exclude.join("، ") + "\n" : "")
    + (brief ? "\nمستجدات السوق من فريق المكتب:\n" + brief + "\n\n" : "")
    + 'أعد JSON فقط: {"companies": [{"name": "اسم المنشأة", "website": "https://…", "city": "' + target.city + '", "sector": "' + target.sector + '", '
    + '"why": "لماذا تناسب انطلق أو وهج في جملتين من معلومات عامة منشورة (الحجم، عدد الفروع أو الأسرّة أو الغرف، مشاريع الاستدامة، صلة بخبر)", '
    + '"service": "الخدمة الأنسب من ملف الشركة", "email": "البريد كما هو مكتوب أو فارغ", "emailSource": "رابط الصفحة التي فيها البريد", "contactPage": "رابط صفحة التواصل"}]}';
  const raw = prospectsWeb_(prompt);
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  const list = j && Array.isArray(j.companies) ? j.companies : [];
  const sh = prospectsSheet_(), added = [];
  list.slice(0, count + 2).forEach(c => {
    if (!c || typeof c.name !== "string" || !c.name.trim() || added.length >= count) return;
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
    const v = { id: "PRS-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: new Date(), company: c.name.trim().slice(0, 150), sector: target.sector,
      city: String(c.city || target.city).slice(0, 60), website: website.slice(0, 300), email: email, emailSource: source.slice(0, 500), verified: verified,
      why: String(c.why || "").replace(/\s+/g, " ").slice(0, 500), service: String(c.service || "").slice(0, 120), status: PST_.wait, note: issues.join(" · "),
      updated: new Date(), domain: domain, followUps: 0 };
    sh.appendRow(PROSPECTS_.fields.map(([k]) => v[k] === undefined ? "" : v[k]).map(cell_));
    known.add(domain); if (email) knownEmails.add(email);
    added.push(v.id);
  });
  officeLog_("بحث مازن", PROSPECTS_.agent, target.sector + " · " + target.city + " — وُجدت " + added.length + " منشآت جديدة", by || "آلي");
  return { target: target, added: added.length };
}

// ---------------- الكتابة الاحترافية والتدقيق ----------------
function prospectsWriteRules_(cfg) {
  return "قواعد الاحتراف: الموضوع من 4 إلى 9 كلمات (أقل من 60 حرفاً)، محدد ومخصص باسم المنشأة أو قطاعها، بلا كلمات دعائية مبالغة (مجاناً، حصري، فرصة لا تعوض) وبلا علامات تعجب أو رموز. "
    + "نص عادي بلا تنسيق Markdown وبلا قوائم نقطية، بفقرات قصيرة، ورابط واحد فقط هو رابط التواصل من ملف الشركة. "
    + "لا أرقام وفر أو أسعار أو مدد أو وعود غير موجودة في ملف الشركة أو في الخبر المستخدم، ولا تدّعِ معرفة داخلية بالمنشأة؛ استخدم ما في why فقط. "
    + "لا تكرر نفس الافتتاحية أو الصياغة بين الرسائل.\n"
    + "اختم كل رسالة بهذا التوقيع كما هو حرفياً:\n" + cfg.signature + "\nثم سطر أخير: «" + PROSPECTS_.optOut + "»";
}

function prospectsDraft_(items, cfg) {
  const brief = prospectsMarketBrief_();
  const prompt = "اكتب لكل منشأة أدناه رسالة بريد أولى من «انطلق للطاقة» بالعربية الفصحى المهنية لقطاع الأعمال السعودي، بأسلوب مرسل بريد تجاري محترف.\n"
    + "البنية: (1) تحية رسمية للإدارة باسم المنشأة. (2) افتتاحية مخصصة تربط واقع المنشأة وقطاعها في السعودية بمستجد من «مستجدات السوق» إن وُجد ما يناسبها "
    + "(اذكر الجهة الناشرة بالاسم فقط)، وإلا فبتحدٍّ تشغيلي معروف للقطاع (أحمال التبريد صيفاً، ساعات التشغيل الطويلة، راحة النزلاء أو المرضى أو المتسوقين). "
    + "(3) قيمة واحدة واضحة في جملتين: خدمة أو اثنتان من ملف الشركة تناسب المنشأة (منصة وهج للطاقة الشمسية للأسطح والمواقف، تدقيق الطاقة والقياس وخط الأساس، ساعد لإدارة المباني، أثر لإدارة الطاقة). "
    + "(4) دعوة واحدة منخفضة الالتزام: اجتماع تعريفي قصير حضوري أو عن بعد، مع رابط التواصل. الطول من 110 إلى 170 كلمة.\n"
    + "إن كان sector «مقاولون فائزون» فالرسالة عرض شراكة لا عرض وفر: هنّئ باختصار بالترسية المذكورة في why، واعرض انطلق مقاولاً باطناً متخصصاً لذلك المشروع (الطاقة الشمسية، القياس والتحقق، ساعد لإدارة المباني، أثر لإدارة الطاقة، تدقيق الطاقة) بما يخفف عنهم ويحقق متطلبات المشروع، ودعوة لاجتماع تنسيقي قصير.\n"
    + prospectsWriteRules_(cfg) + "\n"
    + 'أعد JSON فقط: {"drafts": [{"id": "المعرف كما هو", "subject": "الموضوع", "body": "نص الرسالة كاملاً", "hook": "عنوان الخبر المستخدم أو فارغ"}]}\n\n'
    + "مستجدات السوق من فريق المكتب (نواف وفيصل وراكان):\n" + (brief || "لا مستجدات محفوظة") + "\n\nالمنشآت:\n"
    + JSON.stringify(items.map(p => ({ id: p.id, name: p.company, sector: p.sector, city: p.city, why: p.why, service: p.service, website: p.website })));
  return prospectsParseDrafts_(callGemini(AGENTS_PROMPTS[PROSPECTS_.agent], prompt, true), "drafts", items);
}

function prospectsFollowDraft_(items, cfg) {
  const brief = prospectsMarketBrief_();
  const prompt = "اكتب لكل منشأة أدناه رسالة متابعة على رسالتنا السابقة التي لم يُرد عليها، بأسلوب مرسل بريد تجاري محترف وبالعربية الفصحى المهنية.\n"
    + "القواعد: الموضوع «رد: » ثم موضوع الرسالة السابقة كما هو. من 50 إلى 90 كلمة: تذكير لطيف بسطر واحد، ثم قيمة جديدة لم تُذكر في السابقة "
    + "(مستجد من «مستجدات السوق» يناسب القطاع، أو فرصة ترشيد عملية من قراءة فيصل، أو خدمة مكملة من ملف الشركة)، ثم سؤال واحد بسيط يسهل الرد عليه "
    + "(مثل: من الأنسب للتواصل في إدارة المرافق أو الاستدامة؟ أو هل يناسبكم اتصال قصير؟). "
    + "إن كانت followUp = 2 فهي المتابعة الأخيرة: أغلق الموضوع بلطف وأبقِ الباب مفتوحاً. لا تعتذر بإفراط ولا تلح، ولا تكرر نص الرسالة السابقة.\n"
    + prospectsWriteRules_(cfg) + "\n"
    + 'أعد JSON فقط: {"drafts": [{"id": "المعرف كما هو", "subject": "رد: …", "body": "نص المتابعة كاملاً", "hook": "عنوان الخبر المستخدم أو فارغ"}]}\n\n'
    + "مستجدات السوق من فريق المكتب:\n" + (brief || "لا مستجدات محفوظة") + "\n\nالمنشآت والرسالة السابقة:\n"
    + JSON.stringify(items.map(p => ({ id: p.id, name: p.company, sector: p.sector, city: p.city, why: p.why, followUp: p.followUps + 1,
      previousSubject: p.followUps ? p.fuSubject : p.subject, previousBody: String(p.followUps ? p.fuBody : p.body).slice(0, 1200) })));
  return prospectsParseDrafts_(callGemini(AGENTS_PROMPTS[PROSPECTS_.agent], prompt, true), "drafts", items);
}

function prospectsParseDrafts_(raw, key, items) {
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  const list = j && Array.isArray(j[key]) ? j[key] : [];
  const out = {};
  items.forEach(p => {
    const d = list.find(x => x && x.id === p.id);
    if (!d || typeof d.subject !== "string" || typeof d.body !== "string" || !d.body.trim() || !d.subject.trim()) return;
    out[p.id] = { subject: d.subject.replace(/\s+/g, " ").trim().slice(0, 120), body: d.body.trim().slice(0, 4000), hook: typeof d.hook === "string" ? d.hook.slice(0, 200) : "" };
  });
  return out;
}

// سالم يدقق الدفعة كاملة في استدعاء واحد؛ النتيجة بصيغة التدقيق المنظمة التي يقرؤها salemScore_
function prospectsAudit_(items, drafts, kind) {
  const ids = items.map(p => p.id).filter(id => drafts[id]);
  if (!ids.length) return {};
  const brief = prospectsMarketBrief_();
  const prompt = "دقق رسائل البريد التالية قبل إرسالها لعملاء محتملين (" + (kind === "follow" ? "رسائل متابعة" : "رسائل أولى") + "). قيّم كل رسالة من 0 إلى 100: "
    + "صحة المعلومات مقابل ملف الشركة ومعلومات المنشأة ومستجدات السوق المذكورة (لا أرقام أو وعود أو خدمات غير موجودة)، وصحة اسم المنشأة، "
    + "والاحترافية (النبرة، الطول، موضوع غير دعائي، دعوة واحدة واضحة، التوقيع وسطر عدم المراسلة). أي معلومة غير مدعومة تُنزل التقدير تحت 70.\n"
    + 'أعد JSON فقط: {"audits": [{"id": "المعرف", "score": رقم من 0 إلى 100, "issues": ["ملاحظة قصيرة"]}]}\n\n'
    + "مستجدات السوق المسموح الاستشهاد بها:\n" + (brief || "لا يوجد") + "\n\nالرسائل:\n"
    + JSON.stringify(ids.map(id => { const p = items.find(x => x.id === id); return { id: id, company: p.company, why: p.why, subject: drafts[id].subject, body: drafts[id].body }; }));
  let j = null;
  try { j = JSON.parse(stripFences_(callGemini(AGENTS_PROMPTS["سالم"], prompt, true))); } catch (e) { console.log("تعذر تدقيق رسائل مازن: " + e.message); }
  const list = j && Array.isArray(j.audits) ? j.audits : [], out = {};
  ids.forEach(id => {
    const a = list.find(x => x && x.id === id), score = a ? Number(a.score) : NaN;
    const issues = a && Array.isArray(a.issues) ? a.issues.filter(s => typeof s === "string" && s.trim()).map(s => s.trim().slice(0, 200)).slice(0, 5) : [];
    out[id] = Number.isFinite(score) && score >= 0 && score <= 100
      ? { score: Math.round(score), text: "نسبة الدقة: " + Math.round(score) + "%\nنوع التدقيق: تدقيق محتوى\n" + (issues.length ? "الملاحظات:\n- " + issues.join("\n- ") : "لا ملاحظات جوهرية.") }
      : { score: null, text: "تعذر التدقيق: لم يُرجع سالم تقديراً صالحاً لهذه الرسالة" };
  });
  return out;
}

// سطر واحد في سجل المهام لكل دفعة (لا يُغرق السجل بعشرين سطراً)، فيظهر في بطاقة مازن والملخص التنفيذي
function prospectsTaskLog_(items, drafts, audits, kind) {
  const ids = items.map(p => p.id).filter(id => drafts[id]);
  if (!ids.length) return "";
  const scores = ids.map(id => audits[id] ? audits[id].score : null), avg = average_(scores);
  const taskId = "TSK-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  const output = ids.map(id => { const p = items.find(x => x.id === id); return "• " + p.company + " (" + p.sector + "، " + p.city + ") — " + drafts[id].subject + (audits[id] && audits[id].score !== null ? " — " + audits[id].score + "%" : ""); }).join("\n");
  const low = ids.filter(id => audits[id] && audits[id].score !== null && audits[id].score < 70).length;
  const audit = avg === null ? "تعذر التدقيق: لم يُرجع سالم تقديرات صالحة لهذه الدفعة"
    : "نسبة الدقة: " + avg + "%\nنوع التدقيق: تدقيق محتوى\nمتوسط تقدير سالم لـ " + ids.length + " رسائل" + (low ? "؛ أقل من 70%: " + low : "") + ".";
  setupSheets().getSheetByName("Tasks").appendRow([taskId, new Date(), PROSPECTS_.agent,
    (kind === "follow" ? "[متابعات تواصل] " : "[مسودات تواصل] ") + ids.length + " منشآت", output, audit, avg === null ? "بانتظار التدقيق" : "مكتمل"].map(cell_));
  return taskId;
}

function prospectsDraftBatch_(items, cfg, kind) {
  if (!items.length) return 0;
  const drafts = kind === "follow" ? prospectsFollowDraft_(items, cfg) : prospectsDraft_(items, cfg);
  const audits = prospectsAudit_(items, drafts, kind);
  const taskId = prospectsTaskLog_(items, drafts, audits, kind);
  let done = 0;
  items.forEach(p => {
    const d = drafts[p.id];
    if (!d) return;
    const a = audits[p.id] || { score: null, text: "" }, low = a.score === null || a.score < 70;
    if (kind === "follow") {
      prospectsWrite_(p, { fuSubject: d.subject, fuBody: d.body, fuAudit: a.text, hook: d.hook, status: PST_.fuReady, taskId: taskId,
        note: low ? "تقدير سالم للمتابعة أقل من 70% أو غير متوفر؛ راجعها قبل الإرسال" : "" });
    } else {
      const clean = p.verified === "موثّق من الصفحة" && !/شخصياً|يختلف/.test(p.note) && !low;
      prospectsWrite_(p, { subject: d.subject, body: d.body, audit: a.text, hook: d.hook, status: clean ? PST_.ready : PST_.check, taskId: taskId,
        note: [p.note, low ? "تقدير سالم أقل من 70% أو غير متوفر" : ""].filter(Boolean).join(" · ") });
    }
    done++;
  });
  return done;
}

// ---------------- الدورة اليومية ----------------
function prospectsFollowDue_(all, cfg, now) {
  if (!cfg.maxFollowUps) return [];
  return all.filter(p => (p.status === PST_.sent || p.status === PST_.followed) && p.email && p.followUps < cfg.maxFollowUps
    && p.lastSentMs && now - p.lastSentMs >= cfg.followUpDays * PROSPECTS_.day);
}

function prospectsRun_(by, auto) {
  const cfg = prospectsCfg_(), now = Date.now(), result = { drafted: 0, followUps: 0, found: 0, target: null, warnings: [] };
  const budget = ms => !executionDeadline_ || Date.now() + ms < executionDeadline_;
  prospectsExpireClaims_();
  // 1) المتابعات المستحقة (5 أيام بلا رد)
  const due = prospectsFollowDue_(prospectsAll_(), cfg, now);
  if (due.length && budget(150000)) result.followUps = prospectsDraftBatch_(due.slice(0, cfg.perRun), cfg, "follow");
  // 2) مسودات المنشآت التي تنتظر
  let pend = prospectsAll_().filter(p => p.status === PST_.wait);
  if (pend.length && budget(150000)) { result.drafted += prospectsDraftBatch_(pend.slice(0, cfg.perRun), cfg, "first"); pend = prospectsAll_().filter(p => p.status === PST_.wait); }
  // 3) البحث حتى الهدف اليومي
  const today = prospectsToday_(prospectsAll_()).found, left = cfg.dailyTarget - today;
  if (left > 0 && pend.length < cfg.perRun && budget(200000)) {
    if (!prospectsWebReady_()) { if (!auto) throw appError_("NEEDS_CLAUDE", "البحث عن المنشآت يحتاج Claude مع البحث في الإنترنت: اضبط AI_ENGINE=claude وشغّل العامل على جهازك."); }
    else {
      const s = prospectsSearch_(cfg, Math.min(cfg.perRun, left), by);
      result.found = s.added; result.target = s.target;
      pend = prospectsAll_().filter(p => p.status === PST_.wait);
      if (pend.length && budget(150000)) result.drafted += prospectsDraftBatch_(pend.slice(0, cfg.perRun), cfg, "first");
    }
  }
  result.pending = prospectsAll_().filter(p => p.status === PST_.wait).length;
  result.today = prospectsToday_(prospectsAll_());
  return result;
}

function prospectsToday_(all) {
  const start = startOfDay_(new Date(), 0).getTime();
  return { found: all.filter(p => p.atMs >= start).length, sent: all.filter(p => p.lastSentMs >= start).length };
}

// ---------------- الإرسال بعد موافقتك (طابور) ----------------
function prospectsInWindow_(date, cfg) {
  const tz = Session.getScriptTimeZone(), day = Number(Utilities.formatDate(date, tz, "u")) % 7, hm = Utilities.formatDate(date, tz, "HH:mm");
  return cfg.sendDays.indexOf(day) >= 0 && hm >= cfg.sendFrom && hm < cfg.sendTo;
}
function prospectsNextSlot_(ms, cfg) {
  let t = ms;
  for (let i = 0; i < 7 * 24 * 6 && !prospectsInWindow_(new Date(t), cfg); i++) t += 10 * 60000;
  return t;
}

// تحدد رسائل «جاهز للإرسال» أو «تحقق يدوي» أو «متابعة جاهزة» وتضغط أرسل: تُجدول متباعدة في نافذة الإرسال
function prospectsQueue_(ids, by) {
  const cfg = prospectsCfg_(), all = prospectsAll_(), now = Date.now();
  if (!Array.isArray(ids) || !ids.length) throw appError_("VALIDATION_ERROR", "حدد رسالة واحدة على الأقل");
  if (ids.length > 60) throw appError_("VALIDATION_ERROR", "الحد 60 رسالة في المرة الواحدة");
  let t = Math.max(now + 60000, ...all.filter(p => p.status === PST_.queued).map(p => p.sendAtMs + cfg.gapMin * 60000));
  const out = { queued: 0, skipped: 0, first: "", last: "" };
  const tz = Session.getScriptTimeZone(), fmt = ms => Utilities.formatDate(new Date(ms), tz, "yyyy-MM-dd HH:mm");
  ids.forEach(id => {
    const p = all.find(x => x.id === id);
    // «تعذر الإرسال» يُعاد بنوعه الأصلي (أولى أو متابعة)
    const follow = p && (p.status === PST_.fuReady || (p.status === PST_.failed && p.sendKind === "متابعة"));
    if (!p || !p.email || !prospectsEmailOk_(p.email) || [PST_.ready, PST_.check, PST_.fuReady, PST_.failed].indexOf(p.status) < 0 || !(follow ? p.fuBody : p.body)) { out.skipped++; return; }
    t = prospectsNextSlot_(t, cfg);
    prospectsWrite_(p, { status: PST_.queued, sendKind: follow ? "متابعة" : "أولى", sendAt: new Date(t), sendError: "", claimedAt: "" });
    if (!out.first) out.first = fmt(t);
    out.last = fmt(t);
    out.queued++;
    t += cfg.gapMin * 60000 + Math.floor(Math.random() * 90000);
  });
  if (out.queued) officeLog_("موافقة على إرسال", PROSPECTS_.agent, out.queued + " رسائل من " + out.first + " إلى " + out.last, by);
  return out;
}

function prospectsUnqueue_(id, by) {
  const p = prospectsAll_().find(x => x.id === id);
  if (!p || p.status !== PST_.queued) throw appError_("VALIDATION_ERROR", "الرسالة ليست في الطابور");
  prospectsWrite_(p, { status: p.sendKind === "متابعة" ? PST_.fuReady : (p.verified === "موثّق من الصفحة" || p.verified === "عدّلته يدوياً" ? PST_.ready : PST_.check), sendAt: "", sendKind: "" });
  officeLog_("إلغاء من طابور الإرسال", PROSPECTS_.agent, p.company, by);
}

// العامل انقطع أثناء الإرسال: لا تُعاد تلقائياً حتى لا تُرسل مرتين؛ تظهر لك في «تعذر الإرسال»
function prospectsExpireClaims_() {
  const now = Date.now();
  prospectsAll_().filter(p => p.status === PST_.sending && p.claimedAtMs && now - p.claimedAtMs > PROSPECTS_.claimMs)
    .forEach(p => prospectsWrite_(p, { status: PST_.failed, sendError: "انقطع العامل أثناء الإرسال؛ تحقق من صندوق المرسل في بريدك قبل إعادة المحاولة حتى لا تُرسل مرتين" }));
}

// ---------------- إجراءات العامل (بريد الشركة عبر SMTP على جهازك) ----------------
function handleMailWorkerAction_(body) {
  const action = body && body.action;
  if (["mail_next", "mail_done"].indexOf(action) < 0) return null;
  try {
    const expected = PropertiesService.getScriptProperties().getProperty("WORKER_TOKEN");
    if (!expected || !body.workerToken || !safeEqual_(String(body.workerToken), expected)) throw appError_("UNAUTHORIZED", "WORKER_TOKEN غير صحيح.");
    officeApply_();
    if (action === "mail_next") return json_({ status: "success", job: prospectsNextMail_(String(body.from || "")) });
    prospectsMailDone_(body);
    return json_({ status: "success" });
  } catch (e) {
    return json_({ status: "error", code: e.code || "ERROR", message: e.message || String(e) });
  }
}

function prospectsNextMail_(from) {
  officeProps_().setProperty(PROSPECTS_.mailerKey, JSON.stringify({ seen: Date.now(), from: from.slice(0, 120) }));
  const cfg = prospectsCfg_(), now = Date.now();
  if (!prospectsInWindow_(new Date(now), cfg)) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    prospectsExpireClaims_();
    const all = prospectsAll_();
    if (prospectsToday_(all).sent >= cfg.dailyCap) return null;
    const p = all.filter(x => x.status === PST_.queued && x.sendAtMs && x.sendAtMs <= now).sort((a, b) => a.sendAtMs - b.sendAtMs)[0];
    if (!p) return null;
    prospectsWrite_(p, { status: PST_.sending, claimedAt: new Date() });
    const follow = p.sendKind === "متابعة";
    return { id: p.id, to: p.email, subject: follow ? p.fuSubject : p.subject, body: follow ? p.fuBody : p.body, kind: follow ? "follow" : "first",
      inReplyTo: follow ? p.messageId : "", references: follow ? p.messageId : "" };
  } finally { lock.releaseLock(); }
}

function prospectsMailDone_(d) {
  const p = prospectsAll_().find(x => x.id === String(d.id || ""));
  if (!p || p.status !== PST_.sending) throw appError_("NOT_FOUND", "الرسالة ليست قيد الإرسال");
  if (!d.ok) {
    prospectsWrite_(p, { status: PST_.failed, sendError: String(d.error || "خطأ غير معروف").slice(0, 300), claimedAt: "" });
    officeLog_("تعذر إرسال رسالة", PROSPECTS_.agent, p.company + " — " + String(d.error || "").slice(0, 200), "العامل");
    return;
  }
  const now = new Date(), follow = p.sendKind === "متابعة";
  prospectsWrite_(p, follow
    ? { status: PST_.followed, followUps: p.followUps + 1, lastSent: now, sendAt: "", sendKind: "", claimedAt: "", sendError: "" }
    : { status: PST_.sent, sentAt: now, lastSent: now, messageId: String(d.messageId || "").slice(0, 300), sendAt: "", sendKind: "", claimedAt: "", sendError: "" });
  officeLog_(follow ? "أُرسلت متابعة" : "أُرسلت رسالة", PROSPECTS_.agent, p.company + " · " + p.email, "العامل");
}

function prospectsMailer_() {
  let m = {};
  try { m = JSON.parse(officeProps_().getProperty(PROSPECTS_.mailerKey) || "{}"); } catch (e) {}
  return { online: !!m.seen && Date.now() - m.seen < PROSPECTS_.mailerOnlineMs, from: m.from || "", seen: m.seen || 0 };
}

// ---------------- الإحصاءات والإجراءات ----------------
function prospectsStats_(all, cfg) {
  const by = {};
  Object.keys(PST_).forEach(k => { by[PST_[k]] = 0; });
  all.forEach(p => { by[p.status] = (by[p.status] || 0) + 1; });
  const contacted = all.filter(p => p.sentAtMs || p.status === PST_.replied).length, replied = by[PST_.replied] || 0;
  const today = prospectsToday_(all);
  return { total: all.length, byStatus: by, sent: contacted, replyRate: contacted ? Math.round(100 * replied / contacted) : null,
    draftAvg: average_(all.filter(p => p.audit).map(p => salemScore_(p.audit))), today: today, dailyTarget: cfg.dailyTarget,
    followDue: prospectsFollowDue_(all, cfg, Date.now()).length };
}

function prospectsState_(statsOnly) {
  const all = prospectsAll_(), cfg = prospectsCfg_();
  const out = { status: "success", stats: prospectsStats_(all, cfg), cfg: cfg, webReady: prospectsWebReady_(), mailer: prospectsMailer_() };
  if (!statsOnly) out.items = all.slice(-PROSPECTS_.listed).reverse().map(p => {
    const x = {};
    PROSPECTS_.fields.forEach(([k]) => { x[k] = p[k]; });
    x.score = salemScore_(p.audit); x.fuScore = salemScore_(p.fuAudit);
    x.followDueAt = p.lastSentMs && p.followUps < cfg.maxFollowUps ? Utilities.formatDate(new Date(p.lastSentMs + cfg.followUpDays * PROSPECTS_.day), Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
    return x;
  });
  return out;
}

function prospectsUpdate_(d, by) {
  const p = prospectsAll_().find(x => x.id === String(d.id || ""));
  if (!p) throw appError_("NOT_FOUND", "المنشأة غير موجودة");
  const f = {};
  if (d.status !== undefined) {
    // الحالات التي تختارها بنفسك؛ الطابور والإرسال لهما إجراءاتهما
    const allowed = [PST_.ready, PST_.check, PST_.sent, PST_.replied, PST_.excluded];
    if (allowed.indexOf(d.status) < 0) throw appError_("VALIDATION_ERROR", "حالة غير معروفة");
    if ([PST_.queued, PST_.sending].indexOf(p.status) >= 0) throw appError_("VALIDATION_ERROR", "ألغِ الرسالة من الطابور أولاً");
    f.status = d.status;
    if (d.status === PST_.sent && !p.sentAtMs) { f.sentAt = new Date(); f.lastSent = new Date(); } // أرسلتها يدوياً من بريدك
    if (d.status === PST_.ready || d.status === PST_.check) f.sendError = "";
  }
  if (d.subject !== undefined || d.body !== undefined) {
    const follow = p.status === PST_.fuReady;
    const subject = String(d.subject === undefined ? (follow ? p.fuSubject : p.subject) : d.subject).trim(), text = String(d.body === undefined ? (follow ? p.fuBody : p.body) : d.body).trim();
    if (!subject || !text) throw appError_("VALIDATION_ERROR", "الموضوع والنص مطلوبان");
    if (subject.length > 150 || text.length > 6000) throw appError_("VALIDATION_ERROR", "الرسالة أطول من الحد");
    if (follow) { f.fuSubject = subject; f.fuBody = text; } else { f.subject = subject; f.body = text; }
  }
  if (d.email !== undefined) {
    const email = String(d.email).trim().toLowerCase();
    if (email && !prospectsEmailOk_(email)) throw appError_("VALIDATION_ERROR", "بريد غير صالح");
    if (email !== p.email) { f.email = email; f.verified = email ? "عدّلته يدوياً" : "بلا بريد منشور"; }
  }
  if (d.note !== undefined) f.note = String(d.note).slice(0, 500);
  prospectsWrite_(p, f);
  if (f.status) officeLog_({ [PST_.sent]: "أرسلتَ رسالة مازن يدوياً", [PST_.replied]: "ردّت منشأة", [PST_.excluded]: "استبعاد منشأة", [PST_.ready]: "إرجاع منشأة للإرسال", [PST_.check]: "إرجاع منشأة للتحقق" }[f.status] || "تحديث منشأة",
    PROSPECTS_.agent, p.company + (p.email ? " · " + p.email : ""), by);
  // الرد إشارة نجاح: تُقترح الرسالة مثالاً مرجعياً لمازن في العقل (تنتظر اعتمادك)
  if (f.status === PST_.replied && typeof brainSave_ === "function" && p.body) {
    try {
      if (!brainLoad_().some(x => x.source === p.id)) brainSave_({ agent: PROSPECTS_.agent, type: "مثال جيد", status: "مقترح", source: p.id,
        text: ("رسالة حصلت على رد من " + p.company + " (" + p.sector + "):\nالموضوع: " + p.subject + "\n" + p.body).slice(0, 1200) }, PROSPECTS_.agent);
    } catch (e) { console.log("تعذر اقتراح المثال: " + e.message); }
  }
}

function prospectsSaveCfg_(d) {
  const cfg = officeLoad_().cfg, x = d.cfg || {};
  const list = v => Array.isArray(v) ? v.map(s => String(s).trim()).filter(Boolean).slice(0, 12) : [];
  const sectors = list(x.sectors), cities = list(x.cities);
  if (!sectors.length || !cities.length) throw appError_("VALIDATION_ERROR", "اختر قطاعاً ومدينة على الأقل");
  if (sectors.concat(cities).some(s => s.length > 40)) throw appError_("VALIDATION_ERROR", "اسم القطاع أو المدينة طويل");
  const int = (v, min, max, name) => { const n = Number(v); if (!(Number.isInteger(n) && n >= min && n <= max)) throw appError_("VALIDATION_ERROR", name + " من " + min + " إلى " + max); return n; };
  const every = Number(x.everyHours);
  if (PROSPECTS_.everyHours.indexOf(every) < 0) throw appError_("VALIDATION_ERROR", "التكرار: " + PROSPECTS_.everyHours.join(" أو ") + " ساعات");
  const time = v => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ""))) throw appError_("VALIDATION_ERROR", "الوقت بصيغة HH:MM مثل 09:00"); return String(v); };
  const sendFrom = time(x.sendFrom || "09:00"), sendTo = time(x.sendTo || "16:00");
  if (sendFrom >= sendTo) throw appError_("VALIDATION_ERROR", "بداية نافذة الإرسال قبل نهايتها");
  const days = Array.isArray(x.sendDays) ? Array.from(new Set(x.sendDays.map(Number))).filter(v => Number.isInteger(v) && v >= 0 && v <= 6).sort() : [0, 1, 2, 3, 4];
  if (!days.length) throw appError_("VALIDATION_ERROR", "اختر يوم إرسال واحداً على الأقل");
  const signature = String(x.signature || "").trim();
  if (signature.length > 400) throw appError_("VALIDATION_ERROR", "التوقيع أطول من 400 حرف");
  cfg.automation.prospects = { enabled: !!x.enabled, everyHours: every, perRun: int(x.perRun, 1, 5, "منشآت الدورة"), dailyTarget: int(x.dailyTarget, 1, 40, "الهدف اليومي"),
    sectors: sectors, cities: cities, followUpDays: int(x.followUpDays, 2, 21, "أيام المتابعة"), maxFollowUps: int(x.maxFollowUps, 0, 2, "عدد المتابعات"),
    sendFrom: sendFrom, sendTo: sendTo, sendDays: days, gapMin: int(x.gapMin, 1, 30, "الفاصل بين الرسائل"), dailyCap: int(x.dailyCap, 1, 100, "حد الإرسال اليومي"),
    signature: signature || PROSPECTS_.signature };
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
    else if (a === "prospects_queue") extra = { queue: prospectsQueue_(data.ids, by) };
    else if (a === "prospects_unqueue") prospectsUnqueue_(String(data.id || ""), by);
    else if (a === "prospects_cfg") { prospectsSaveCfg_(data); officeCache_ = null; officeInstallTriggers_(); officeLog_("إعدادات مازن", PROSPECTS_.agent, "", by); }
    else throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    officeCache_ = null;
    return json_(Object.assign(prospectsState_(false), extra));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
