/**
 * Tenders.gs — بدر: المنافسات والمناقصات.
 *
 * يرصد بدر يومياً الفرص في مجالات انطلق ووهج (الطاقة الشمسية وصيانتها، كفاءة الطاقة وتدقيقها، التكييف والتبريد،
 * إدارة المباني والعدادات، الإنارة الموفرة) من مواقع الجهات الرسمية وإعلانات ترشيد وشركة شراء الطاقة وطلبات عروض القطاع الخاص،
 * ويتابع الترسيات لتعرض الشراكة على الفائزين كمقاول باطن (يحوّلها لمازن).
 * - منصة اعتماد محمية من القراءة الآلية؛ لا يحاول بدر تجاوز ذلك. يقرأ ما تنشره الجهات علناً، أو ما تلصقه له من شاشة اعتماد.
 * - الحكم يحسبه الخادم من وضع المكتب (لوحة الجاهزية): «تقدّم مباشرة»، «بعد التسجيل في اعتماد»، «كمقاول باطن أو شريك»، «تجاهل».
 *   تصنيف المقاولين إلزامي للمشاريع الحكومية التي يبلغ فيها العقد الواحد 500 ألف ريال فأكثر (نظام تصنيف المقاولين ولائحته).
 * - لوحة الجاهزية: التسجيل في اعتماد وأرامكو، التأهل لدى ترشيد، رخصة تدقيق الطاقة، التصنيف، وصلاحية مستندات الشركة.
 * - راكان يرى المواعيد القريبة والمستندات التي تقترب من الانتهاء في ملخصه.
 *
 * يعتمد على Code.gs: setupSheets, callGemini, callClaude_, CLAUDE_, COMMON_RULES, companyProfile_, AGENTS_PROMPTS,
 *   startOfDay_, toDate_, stripFences_, cell_, json_, appError_, checkBudget_, executionDeadline_, PLAN_BUDGET_MS
 * ويعتمد على Office.gs: officeSystemFor_, officeLoad_, officeProps_, officeLog_, officeBy_, officeApply_, officeTeamReady_, officeInstallTriggers_
 * ويستخدم إن وُجد: prospectsWebReady_, prospectsVerifyEmail_, prospectsDomain_, prospectsSheet_, prospectsAll_, PROSPECTS_ (Prospects.gs)
 */

const TENDERS_ = {
  agent: "بدر",
  sheet: "Tenders",
  fields: [["id", "ID"], ["at", "التاريخ"], ["title", "العنوان"], ["entity", "الجهة"], ["kind", "النوع"], ["source", "المصدر"], ["url", "الرابط"],
    ["ref", "رقم المنافسة"], ["city", "المدينة"], ["activity", "النشاط"], ["worksType", "طبيعة العمل"], ["questionsBy", "آخر موعد للاستفسارات"],
    ["bidsBy", "آخر موعد للعروض"], ["openingAt", "فتح العروض"], ["booklet", "سعر الكراسة"], ["value", "القيمة التقديرية"], ["requirements", "المتطلبات"],
    ["needsEtimad", "يحتاج اعتماد"], ["needsClass", "يحتاج تصنيف"], ["fit", "درجة الملاءمة"], ["services", "خدماتنا المناسبة"], ["verdict", "الحكم"],
    ["why", "السبب"], ["next", "الخطوة التالية"], ["status", "الحالة"], ["note", "ملاحظات"], ["winner", "الجهة الفائزة"], ["winnerSite", "موقع الفائز"],
    ["winnerEmail", "بريد الفائز"], ["winnerEmailSource", "مصدر بريد الفائز"], ["prospectId", "عند مازن"], ["updated", "آخر تحديث"], ["key", "مفتاح التكرار"]],
  kinds: ["منافسة حكومية", "طلب عروض خاص", "ترسية", "تأهيل أو برنامج"],
  verdicts: ["تقدّم مباشرة", "بعد التسجيل في اعتماد", "كمقاول باطن أو شريك", "تجاهل"],
  statuses: ["جديد", "نتابعها", "نجهز العرض", "قُدّم", "فزنا", "لم نفز", "مستبعدة", "انتهت"],
  open: ["جديد", "نتابعها", "نجهز العرض"],
  topics: ["الطاقة الشمسية: توريد وتركيب وتشغيل وصيانة وتنظيف الألواح", "كفاءة الطاقة وتدقيقها والقياس والتحقق وعقود أداء الطاقة",
    "صيانة وتشغيل أنظمة التكييف والتبريد المركزي والتهوية", "أنظمة إدارة المباني BMS والعدادات الذكية والقياس الفرعي", "الإنارة الموفرة LED والتحكم الذكي بالإنارة"],
  classThreshold: 500000,
  profileKey: "TENDERS_PROFILE", cursorKey: "TENDERS_CURSOR",
  docs: ["السجل التجاري", "شهادة الزكاة", "شهادة ضريبة القيمة المضافة", "شهادة التأمينات الاجتماعية", "شهادة نطاقات (السعودة)", "عضوية الغرفة التجارية", "العنوان الوطني", "خطاب الآيبان"],
  listed: 300, maxExclude: 120, day: 86400000
};

// بدر وكيل في الفريق (التعليمات الأصلية؛ تُعدَّل من إدارة المكتب)
if (typeof AGENTS_PROMPTS === "object" && !AGENTS_PROMPTS[TENDERS_.agent]) {
  AGENTS_PROMPTS[TENDERS_.agent] = "أنت بدر، مسؤول المنافسات والمناقصات في انطلق. ترصد المنافسات الحكومية وطلبات عروض القطاع الخاص وبرامج التأهيل وترسيات المشاريع في السعودية "
    + "في مجالات الطاقة الشمسية وصيانتها، وكفاءة الطاقة وتدقيقها، والتكييف والتبريد، وإدارة المباني والعدادات، والإنارة الموفرة. "
    + "تستخرج من كل إعلان بدقة: الجهة، الرقم المرجعي، المواعيد، المتطلبات، ما إذا كان يحتاج حساباً في اعتماد أو تصنيف مقاولين، "
    + "وتقيّم ملاءمته لخدمات انطلق ووهج في ملف الشركة. لا تخترع تواريخ أو قيماً أو متطلبات غير مذكورة في المصدر؛ اكتب «غير مذكور» إن لم تجدها.";
}

// ---------------- التخزين ----------------
const tendersCol_ = key => TENDERS_.fields.findIndex(f => f[0] === key);

function tendersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), headers = TENDERS_.fields.map(f => f[1]);
  let sh = ss.getSheetByName(TENDERS_.sheet);
  if (!sh) { sh = ss.insertSheet(TENDERS_.sheet); sh.appendRow(headers); sh.setFrozenRows(1); return sh; }
  const cur = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some((h, i) => cur[i] !== h)) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function tendersAll_() {
  const sh = tendersSheet_(), n = TENDERS_.fields.length;
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().map((r, i) => {
    const t = { row: i + 2, raw: r };
    TENDERS_.fields.forEach(([k], j) => {
      const v = r[j];
      if (k === "at" || k === "updated") { t[k] = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm") : String(v || ""); t[k + "Ms"] = v instanceof Date ? v.getTime() : 0; }
      else t[k] = v === undefined || v === null ? "" : (k === "fit" || k === "value" ? (v === "" ? null : Number(v)) : String(v));
    });
    const d = toDate_(t.bidsBy);
    t.bidsMs = d ? d.getTime() : 0;
    return t;
  }).filter(t => t.id);
}

function tendersWrite_(t, fields) {
  const row = TENDERS_.fields.map((f, j) => t.raw[j] === undefined ? "" : t.raw[j]);
  Object.keys(fields).forEach(k => { const j = tendersCol_(k); if (j >= 0) row[j] = fields[k]; });
  row[tendersCol_("updated")] = new Date();
  tendersSheet_().getRange(t.row, 1, 1, row.length).setValues([row.map(cell_)]);
  t.raw = row;
}

function tendersCfg_() {
  const c = (officeLoad_().cfg.automation || {}).tenders || {};
  const hour = Number(c.hour);
  return { enabled: c.enabled !== false, hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 10,
    perRun: Math.min(8, Math.max(1, Number(c.perRun) || 5)), awards: Math.min(5, Math.max(0, c.awards === undefined ? 3 : Number(c.awards) || 0)),
    keywords: typeof c.keywords === "string" ? c.keywords.trim().slice(0, 300) : "" };
}

// ---------------- لوحة الجاهزية ----------------
function tendersProfile_() {
  let p = {};
  try { p = JSON.parse(officeProps_().getProperty(TENDERS_.profileKey) || "{}"); } catch (e) {}
  const docs = Array.isArray(p.docs) && p.docs.length ? p.docs : TENDERS_.docs.map(n => ({ name: n, expires: "" }));
  return { etimad: !!p.etimad, aramco: !!p.aramco, tarshid: !!p.tarshid, esco: !!p.esco, classified: !!p.classified, classNote: String(p.classNote || "").slice(0, 120),
    docs: docs.map(d => ({ name: String(d.name || "").slice(0, 80), expires: /^\d{4}-\d{2}-\d{2}$/.test(String(d.expires || "")) ? d.expires : "" })).filter(d => d.name).slice(0, 20) };
}

function tendersReadiness_(p) {
  const today = startOfDay_(new Date(), 0).getTime();
  const docs = p.docs.map(d => { const e = toDate_(d.expires); const days = e ? Math.round((e.getTime() - today) / TENDERS_.day) : null; return Object.assign({ days: days }, d); });
  const docsOk = docs.length > 0 && docs.every(d => d.days !== null && d.days >= 0);
  const items = [p.etimad, p.aramco, p.tarshid, p.esco, p.classified, docsOk];
  return { percent: Math.round(100 * items.filter(Boolean).length / items.length), docs: docs, docsOk: docsOk,
    expiring: docs.filter(d => d.days !== null && d.days <= 30), missing: docs.filter(d => d.days === null) };
}

function tendersSaveProfile_(d) {
  const x = d.profile || {};
  const docs = Array.isArray(x.docs) ? x.docs.map(doc => ({ name: String(doc.name || "").trim().slice(0, 80), expires: String(doc.expires || "").trim() })).filter(doc => doc.name).slice(0, 20) : [];
  if (docs.some(doc => doc.expires && !/^\d{4}-\d{2}-\d{2}$/.test(doc.expires))) throw appError_("VALIDATION_ERROR", "تاريخ الانتهاء بصيغة yyyy-MM-dd");
  officeProps_().setProperty(TENDERS_.profileKey, JSON.stringify({ etimad: !!x.etimad, aramco: !!x.aramco, tarshid: !!x.tarshid, esco: !!x.esco, classified: !!x.classified,
    classNote: String(x.classNote || "").slice(0, 120), docs: docs }));
  // الحكم يتغير بتغير وضع المكتب: يُعاد حسابه للفرص المفتوحة
  const p = tendersProfile_();
  tendersAll_().filter(t => TENDERS_.open.indexOf(t.status) >= 0).forEach(t => {
    const v = tendersVerdict_(t, p);
    if (v.verdict !== t.verdict) tendersWrite_(t, { verdict: v.verdict, why: v.reason });
  });
}

// ---------------- الحكم من وضع المكتب ----------------
function tendersVerdict_(t, p) {
  const now = Date.now();
  if (t.kind === "ترسية") return { verdict: "كمقاول باطن أو شريك", reason: "مشروع مُرسى" + (t.winner ? " على " + t.winner : "") + ": اعرض الشراكة كمقاول باطن متخصص" };
  if (t.bidsMs && t.bidsMs < startOfDay_(new Date(now), 0).getTime()) return { verdict: "تجاهل", reason: "انتهى موعد تقديم العروض" };
  if (t.fit !== null && t.fit !== undefined && t.fit < 40) return { verdict: "تجاهل", reason: "ملاءمة ضعيفة لخدماتنا (" + t.fit + "%)" };
  const gov = t.kind === "منافسة حكومية" || t.needsEtimad === "نعم";
  if (t.needsClass === "نعم" && !p.classified) return { verdict: "كمقاول باطن أو شريك", reason: "تتطلب تصنيف مقاولين وليس لدينا تصنيف؛ ادخلها مع مقاول مصنّف" };
  if (gov && !p.etimad) return { verdict: "بعد التسجيل في اعتماد", reason: "منافسة حكومية تحتاج حساب مورد في اعتماد" + (t.needsClass === "غير معروف" ? "، وتحقق من اشتراط التصنيف في الكراسة" : "") };
  if (t.kind === "تأهيل أو برنامج") return { verdict: "تقدّم مباشرة", reason: "باب تأهيل أو برنامج مفتوح" };
  return { verdict: "تقدّم مباشرة", reason: "متاحة لنا بوضعنا الحالي" + (t.needsClass === "غير معروف" ? "؛ تحقق من اشتراط التصنيف في الكراسة" : "") };
}

// تصنيف المقاولين إلزامي للمشاريع الحكومية بعقد 500 ألف ريال فأكثر (للأعمال والصيانة والتشغيل)
function tendersNormalize_(x, defaults) {
  const one = (v, list, def) => list.indexOf(v) >= 0 ? v : def;
  const s = (v, n) => String(v === undefined || v === null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim()) ? String(v).trim() : "";
  const fit = Number(x.fit);
  const value = Number(x.valueSar);
  const t = {
    title: s(x.title, 300), entity: s(x.entity, 150), kind: one(x.kind, TENDERS_.kinds, defaults.kind || "منافسة حكومية"), source: s(x.source || defaults.source, 120),
    url: /^https?:\/\//i.test(String(x.url || "")) ? s(x.url, 500) : (defaults.url || ""), ref: s(x.ref, 80), city: s(x.city, 60), activity: s(x.activity, 150),
    worksType: one(x.worksType, ["أعمال", "صيانة وتشغيل", "توريد", "خدمات استشارية", "غير محدد"], "غير محدد"),
    questionsBy: date(x.questionsBy), bidsBy: date(x.bidsBy), openingAt: date(x.openingAt), booklet: s(x.booklet, 40),
    value: Number.isFinite(value) && value > 0 ? Math.round(value) : null, requirements: s(x.requirements, 800),
    needsEtimad: one(x.needsEtimad, ["نعم", "لا", "غير معروف"], "غير معروف"), needsClass: one(x.needsClass, ["نعم", "لا", "غير معروف"], "غير معروف"),
    fit: Number.isFinite(fit) && fit >= 0 && fit <= 100 ? Math.round(fit) : null, services: s(x.services, 200), why: s(x.why, 500), next: s(x.next, 300),
    winner: s(x.winner, 150), winnerSite: /^https?:\/\//i.test(String(x.winnerSite || "")) ? s(x.winnerSite, 300) : "",
    winnerEmail: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(x.winnerEmail || "").trim()) ? String(x.winnerEmail).trim().toLowerCase() : "",
    winnerEmailSource: /^https?:\/\//i.test(String(x.winnerEmailSource || "")) ? s(x.winnerEmailSource, 500) : ""
  };
  if (t.kind === "منافسة حكومية") t.needsEtimad = t.needsEtimad === "غير معروف" ? "نعم" : t.needsEtimad;
  if (t.kind === "منافسة حكومية" && t.value !== null && t.value >= TENDERS_.classThreshold && (t.worksType === "أعمال" || t.worksType === "صيانة وتشغيل")) t.needsClass = "نعم";
  return t;
}

function tendersKey_(t) {
  const u = String(t.url || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  return u && u.length > 12 ? u : (String(t.entity) + "|" + String(t.title)).toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

function tendersAppend_(t, by) {
  const p = tendersProfile_(), all = tendersAll_();
  const key = tendersKey_(t);
  if (all.some(x => x.key === key)) return null;
  const d = toDate_(t.bidsBy);
  t.bidsMs = d ? d.getTime() : 0;
  const v = tendersVerdict_(t, p);
  // بريد الفائز: يتحقق الخادم أنه مكتوب في صفحة المصدر (نفس فحص مازن)
  let note = "";
  if (t.winnerEmail) {
    const ok = typeof prospectsVerifyEmail_ === "function" && prospectsVerifyEmail_(t.winnerEmail, t.winnerEmailSource);
    if (!ok) note = "بريد الفائز غير موثّق من صفحته؛ تحقق منه";
  }
  const row = Object.assign({ id: "TND-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: new Date(), status: v.verdict === "تجاهل" ? "مستبعدة" : "جديد",
    verdict: v.verdict, note: note, updated: new Date(), key: key, prospectId: "" }, t, { why: [t.why, v.reason].filter(Boolean).join(" — ") });
  tendersSheet_().appendRow(TENDERS_.fields.map(([k]) => row[k] === undefined || row[k] === null ? "" : row[k]).map(cell_));
  return row;
}

// ---------------- الرصد (Claude مع البحث عبر العامل) ----------------
function tendersWebReady_() { return typeof prospectsWebReady_ === "function" ? prospectsWebReady_() : (typeof claudeEnabled_ === "function" && claudeEnabled_()); }

function tendersSystem_() {
  const profile = typeof companyProfile_ === "function" ? companyProfile_() : "";
  return officeSystemFor_(AGENTS_PROMPTS[TENDERS_.agent]) + "\n" + COMMON_RULES + (profile ? "\n\nملف الشركة (المرجع الوحيد لخدماتنا):\n" + profile : "")
    + "\n\nأعد JSON صالحاً فقط بلا أي نص قبله أو بعده وبلا علامات ```.";
}

function tendersSchema_() {
  return '{"items": [{"title": "عنوان المنافسة أو المشروع", "entity": "الجهة الطارحة", "kind": "منافسة حكومية أو طلب عروض خاص أو ترسية أو تأهيل أو برنامج", '
    + '"source": "اسم المنصة أو الموقع", "url": "رابط الإعلان", "ref": "الرقم المرجعي أو فارغ", "city": "المدينة أو المنطقة", "activity": "النشاط", '
    + '"worksType": "أعمال أو صيانة وتشغيل أو توريد أو خدمات استشارية أو غير محدد", "questionsBy": "yyyy-MM-dd أو فارغ", "bidsBy": "yyyy-MM-dd أو فارغ", '
    + '"openingAt": "yyyy-MM-dd أو فارغ", "booklet": "سعر الكراسة كما ورد أو فارغ", "valueSar": رقم بالريال إن ذُكرت القيمة صراحة وإلا null, '
    + '"requirements": "أهم المتطلبات المذكورة (تصنيف، محتوى محلي، شهادات، خبرات)", "needsEtimad": "نعم أو لا أو غير معروف", "needsClass": "نعم أو لا أو غير معروف", '
    + '"fit": ملاءمة لخدمات انطلق ووهج من 0 إلى 100, "services": "خدماتنا المناسبة من ملف الشركة", "why": "سبب الملاءمة في جملة", "next": "الخطوة العملية التالية", '
    + '"winner": "اسم الجهة الفائزة للترسيات وإلا فارغ", "winnerSite": "موقعها الرسمي أو فارغ", "winnerEmail": "بريد التواصل الرسمي المنشور في موقعها حرفياً أو فارغ", '
    + '"winnerEmailSource": "رابط الصفحة التي فيها البريد أو فارغ"}]}';
}

function tendersRun_(by, auto) {
  const cfg = tendersCfg_(), result = { found: 0, awards: 0, skipped: 0, topic: "" };
  tendersExpire_();
  if (!tendersWebReady_()) {
    if (!auto) throw appError_("NEEDS_CLAUDE", "رصد المنافسات يحتاج Claude مع البحث في الإنترنت: اضبط AI_ENGINE=claude وشغّل العامل على جهازك. يمكنك الآن لصق منافسة يدوياً.");
    return result;
  }
  checkBudget_(90000);
  const props = officeProps_(), n = Number(props.getProperty(TENDERS_.cursorKey)) || 0;
  props.setProperty(TENDERS_.cursorKey, String((n + 1) % TENDERS_.topics.length));
  const topic = TENDERS_.topics[n % TENDERS_.topics.length];
  result.topic = topic;
  const p = tendersProfile_(), known = tendersAll_().slice(-TENDERS_.maxExclude).map(t => t.title).filter(Boolean);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const prompt = "اليوم " + today + ". ابحث في الإنترنت عن فرص في السعودية ضمن: «" + topic + "»" + (cfg.keywords ? " وكذلك: " + cfg.keywords : "") + ".\n"
    + "1) حتى " + cfg.perRun + " منافسات أو طلبات عروض أو برامج تأهيل مفتوحة الآن (لم ينتهِ موعد تقديم عروضها)، منشورة في آخر 45 يوماً: من صفحات «المنافسات والمشتريات» في مواقع الوزارات والجامعات والمستشفيات والأمانات والهيئات، "
    + "وإعلانات شركة ترشيد وشركة شراء الطاقة وبرامج المركز السعودي لكفاءة الطاقة، وطلبات عروض الشركات الكبرى والمجموعات الفندقية والصحية والمطورين (مثل نيوم وروشن والبحر الأحمر).\n"
    + (cfg.awards ? "2) حتى " + cfg.awards + " ترسيات حديثة (آخر 90 يوماً) لمشاريع في هذه المجالات على شركات مقاولات أو تشغيل، مع اسم الشركة الفائزة وموقعها الرسمي، "
      + "وبريد التواصل الرسمي المكتوب في موقعها حرفياً ورابط صفحته إن وجدته (لا تخمّن بريداً ولا تضع بريد شخص).\n" : "")
    + "لا تعتمد على منصة اعتماد مباشرة (محمية)؛ استخدم ما تنشره الجهات والأخبار الموثوقة، واذكر رابط المصدر لكل فرصة. حوّل التواريخ الهجرية إلى ميلادية yyyy-MM-dd إن أمكن.\n"
    + "وضع المكتب: " + (p.etimad ? "مسجل في اعتماد" : "غير مسجل في اعتماد بعد") + "، " + (p.classified ? "لديه تصنيف مقاولين" : "بلا تصنيف مقاولين") + ". قيّم الملاءمة لخدماتنا فقط، والحكم يحسبه النظام.\n"
    + (known.length ? "لا تكرر هذه الفرص (موجودة لدينا): " + known.slice(-60).join(" | ") + "\n" : "")
    + "أعد JSON فقط: " + tendersSchema_();
  const remaining = executionDeadline_ ? executionDeadline_ - Date.now() - 20000 : CLAUDE_.waitMs;
  if (remaining < 60000) throw appError_("BUDGET_EXCEEDED", "اقترب حد التنفيذ؛ يكمل بدر الرصد في الدورة القادمة");
  const raw = String(callClaude_(tendersSystem_(), prompt, { web: true, timeoutMs: Math.min(CLAUDE_.waitMs, remaining) }) || "");
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  (j && Array.isArray(j.items) ? j.items : []).slice(0, cfg.perRun + cfg.awards + 2).forEach(x => {
    if (!x || typeof x.title !== "string" || !x.title.trim()) return;
    const row = tendersAppend_(tendersNormalize_(x, { source: "بحث بدر" }), by);
    if (!row) { result.skipped++; return; }
    if (row.kind === "ترسية") result.awards++; else result.found++;
  });
  officeLog_("رصد بدر", TENDERS_.agent, topic + " — فرص جديدة " + result.found + " · ترسيات " + result.awards, by || "آلي");
  return result;
}

// تلصق نص منافسة من شاشة اعتماد أو أي موقع (ومعه الرابط إن وجد): بدر يستخرج ويقيّم
function tendersAdd_(d, by) {
  const text = String(d.text || "").trim().slice(0, 12000), url = /^https?:\/\//i.test(String(d.url || "").trim()) ? String(d.url).trim() : "";
  if (text.length < 60 && !url) throw appError_("VALIDATION_ERROR", "الصق نص المنافسة (60 حرفاً على الأقل) أو رابطها");
  if (text.length < 60 && !tendersWebReady_()) throw appError_("NEEDS_CLAUDE", "لقراءة الرابط وحده يحتاج بدر عامل Claude؛ الصق نص المنافسة بدلاً منه");
  const prompt = "حلّل هذه المنافسة واستخرج بياناتها بدقة من النص فقط (لا تخترع ما لم يُذكر). أعد عنصراً واحداً في items.\n"
    + "أعد JSON فقط: " + tendersSchema_() + "\n\n" + (url ? "الرابط: " + url + "\n" : "") + (text ? "نص المنافسة:\n" + text : "افتح الرابط واقرأ الإعلان.");
  const raw = text.length >= 60 ? callGemini(AGENTS_PROMPTS[TENDERS_.agent], prompt, true)
    : String(callClaude_(tendersSystem_(), prompt, { web: true, timeoutMs: Math.min(CLAUDE_.waitMs, (executionDeadline_ || Date.now() + 270000) - Date.now() - 20000) }) || "");
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  const x = j && Array.isArray(j.items) && j.items[0];
  if (!x || typeof x.title !== "string" || !x.title.trim()) throw appError_("PARSE_ERROR", "تعذر استخراج بيانات المنافسة؛ الصق نصاً أوضح يتضمن العنوان والجهة والمواعيد");
  const row = tendersAppend_(tendersNormalize_(x, { source: "أضفتها أنت", url: url }), by);
  if (!row) throw appError_("DUPLICATE", "هذه المنافسة موجودة لدى بدر من قبل");
  officeLog_("منافسة أضفتها", TENDERS_.agent, row.title.slice(0, 150) + " — " + row.verdict, by);
  return row;
}

// ما فات موعده ولم يُقدَّم يصبح «انتهت»
function tendersExpire_() {
  const today = startOfDay_(new Date(), 0).getTime();
  tendersAll_().filter(t => TENDERS_.open.indexOf(t.status) >= 0 && t.kind !== "ترسية" && t.bidsMs && t.bidsMs < today)
    .forEach(t => tendersWrite_(t, { status: "انتهت" }));
}

// ---------------- الترسيات إلى مازن ----------------
function tendersToMazen_(id, by) {
  const t = tendersAll_().find(x => x.id === id);
  if (!t) throw appError_("NOT_FOUND", "المنافسة غير موجودة");
  if (!t.winner) throw appError_("VALIDATION_ERROR", "لا توجد جهة فائزة لهذه الفرصة");
  if (typeof prospectsSheet_ !== "function") throw appError_("NOT_AVAILABLE", "مازن غير مركّب في الخادم");
  if (t.prospectId) throw appError_("VALIDATION_ERROR", "حُوّلت لمازن من قبل");
  const domain = typeof prospectsDomain_ === "function" ? prospectsDomain_(t.winnerSite) : "";
  const existing = domain ? prospectsAll_().find(p => p.domain === domain) : null;
  let pid;
  if (existing) pid = existing.id;
  else {
    const emailOk = t.winnerEmail && !/غير موثّق/.test(t.note);
    const v = { id: "PRS-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: new Date(), company: t.winner, sector: "مقاولون فائزون", city: t.city || "",
      website: t.winnerSite, email: t.winnerEmail, emailSource: t.winnerEmailSource, verified: t.winnerEmail ? (emailOk ? "موثّق من الصفحة" : "غير موثّق") : "بلا بريد منشور",
      why: ("فازت بمشروع «" + t.title + "» لدى " + (t.entity || "جهة") + ". نعرض الشراكة كمقاول باطن متخصص في: " + (t.services || "الطاقة الشمسية وكفاءة الطاقة")).slice(0, 500),
      service: t.services.slice(0, 120), status: PROSPECTS_.st.wait, note: t.winnerEmail ? (emailOk ? "" : "بريد الفائز غير موثّق") : "لا بريد منشوراً؛ أضفه بعد التحقق من موقعهم",
      updated: new Date(), domain: domain, followUps: 0 };
    prospectsSheet_().appendRow(PROSPECTS_.fields.map(([k]) => v[k] === undefined ? "" : v[k]).map(cell_));
    pid = v.id;
  }
  tendersWrite_(t, { prospectId: pid, status: "نتابعها" });
  officeLog_("ترسية إلى مازن", TENDERS_.agent, t.winner + " — " + t.title.slice(0, 120), by);
  return pid;
}

// ---------------- لراكان: المواعيد والجاهزية ----------------
function tendersBrief_(since) {
  try {
    const all = tendersAll_(), now = Date.now(), soon = now + 7 * TENDERS_.day, from = since ? since.getTime() : now - 7 * TENDERS_.day;
    const open = all.filter(t => TENDERS_.open.indexOf(t.status) >= 0 && t.kind !== "ترسية" && t.verdict !== "تجاهل");
    const due = open.filter(t => t.bidsMs && t.bidsMs <= soon).sort((a, b) => a.bidsMs - b.bidsMs);
    const r = tendersReadiness_(tendersProfile_());
    const lines = ["- المنافسات: جديدة في الفترة " + all.filter(t => t.atMs >= from).length + " · مفتوحة مناسبة " + open.length + " · ترسيات للشراكة " + all.filter(t => t.kind === "ترسية" && TENDERS_.open.indexOf(t.status) >= 0).length
      + " · جاهزية المكتب " + r.percent + "%"];
    due.slice(0, 5).forEach(t => lines.push("  - موعد قريب " + t.bidsBy + ": " + String(t.title).slice(0, 100) + " (" + (t.entity || "") + ") — " + t.verdict));
    if (r.expiring.length) lines.push("  - مستندات تنتهي خلال 30 يوماً: " + r.expiring.map(d => d.name + " (" + d.expires + ")").join("، "));
    return lines.join("\n");
  } catch (e) { return ""; }
}

// ---------------- المشغل والإجراءات ----------------
function officeRunTenders() {
  if (!tendersCfg_().enabled || !officeTeamReady_([TENDERS_.agent])) return;
  executionDeadline_ = Date.now() + PLAN_BUDGET_MS;
  try { tendersRun_("آلي", true); }
  catch (err) { officeLog_("تعذر رصد بدر", TENDERS_.agent, String(err.message || err).slice(0, 300), "آلي"); }
}

function tendersState_() {
  tendersExpire_();
  const all = tendersAll_(), p = tendersProfile_(), r = tendersReadiness_(p);
  const open = all.filter(t => TENDERS_.open.indexOf(t.status) >= 0 && t.kind !== "ترسية" && t.verdict !== "تجاهل");
  const fits = open.map(t => t.fit).filter(v => v !== null && v !== undefined);
  const today = startOfDay_(new Date(), 0).getTime();
  return {
    status: "success", cfg: tendersCfg_(), profile: p, readiness: r, webReady: tendersWebReady_(),
    stats: { total: all.length, open: open.length, awards: all.filter(t => t.kind === "ترسية" && TENDERS_.open.indexOf(t.status) >= 0).length,
      dueSoon: open.filter(t => t.bidsMs && t.bidsMs <= today + 7 * TENDERS_.day).length, fitAvg: fits.length ? Math.round(fits.reduce((a, b) => a + b, 0) / fits.length) : null,
      readiness: r.percent, byStatus: TENDERS_.statuses.reduce((o, s) => { o[s] = all.filter(t => t.status === s).length; return o; }, {}) },
    items: all.slice(-TENDERS_.listed).reverse().map(t => {
      const x = {};
      TENDERS_.fields.forEach(([k]) => { x[k] = t[k]; });
      x.daysLeft = t.bidsMs ? Math.round((t.bidsMs - today) / TENDERS_.day) : null;
      return x;
    })
  };
}

function handleTendersAction_(data, user) {
  try {
    officeApply_();
    const by = officeBy_(user), a = data.action;
    let extra = {};
    if (a === "tenders_get" && data.statsOnly) { const st = tendersState_(); return json_({ status: "success", stats: st.stats, readiness: { percent: st.readiness.percent } }); }
    if (a === "tenders_get") { /* القراءة فقط */ }
    else if (a === "tenders_run") { executionDeadline_ = Date.now() + 270000; extra = { run: tendersRun_(by, false) }; }
    else if (a === "tenders_add") { executionDeadline_ = Date.now() + 270000; extra = { added: tendersAdd_(data, by).id }; }
    else if (a === "tenders_update") {
      const t = tendersAll_().find(x => x.id === String(data.id || ""));
      if (!t) throw appError_("NOT_FOUND", "المنافسة غير موجودة");
      const f = {};
      if (data.status !== undefined) { if (TENDERS_.statuses.indexOf(data.status) < 0) throw appError_("VALIDATION_ERROR", "حالة غير معروفة"); f.status = data.status; }
      if (data.note !== undefined) f.note = String(data.note).slice(0, 500);
      tendersWrite_(t, f);
      if (f.status) officeLog_("منافسة: " + f.status, TENDERS_.agent, String(t.title).slice(0, 150), by);
    }
    else if (a === "tenders_to_mazen") extra = { prospectId: tendersToMazen_(String(data.id || ""), by) };
    else if (a === "tenders_profile") { tendersSaveProfile_(data); officeLog_("تحديث جاهزية المكتب", TENDERS_.agent, "", by); }
    else if (a === "tenders_cfg") {
      const cfg = officeLoad_().cfg, x = data.cfg || {}, hour = Number(x.hour), per = Number(x.perRun), aw = Number(x.awards);
      if (!(Number.isInteger(hour) && hour >= 0 && hour <= 23)) throw appError_("VALIDATION_ERROR", "ساعة الرصد من 0 إلى 23");
      if (!(per >= 1 && per <= 8) || !(aw >= 0 && aw <= 5)) throw appError_("VALIDATION_ERROR", "الفرص من 1 إلى 8 والترسيات من 0 إلى 5");
      cfg.automation.tenders = { enabled: !!x.enabled, hour: hour, perRun: per, awards: aw, keywords: String(x.keywords || "").slice(0, 300) };
      officeProps_().setProperty("OFFICE_CFG", JSON.stringify(cfg));
      officeCache_ = null; officeInstallTriggers_();
      officeLog_("إعدادات بدر", TENDERS_.agent, "", by);
    }
    else throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    return json_(Object.assign(tendersState_(), extra));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
