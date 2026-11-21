/**
 * Voice.gs — راكان بالصوت: تكلّم المكتب من اللوحة، فينفذ ويرد عليك بالصوت.
 *
 * المرحلة الأولى: الأوامر المعروفة تُفهم هنا مباشرة بلا نموذج، فالرد فوري ودقيق وبلا تكلفة.
 * - أسئلة: ما ينتظرك اليوم، الموافقات، ردود العملاء، حالة العامل، من يداوم ومن موقوف،
 *   ماذا فعل وكيل اليوم، المنافسات القريبة، زيارات الصيانة والتجديدات.
 * - أوامر: إيقاف وكيل أو أكثر أو الكل (الكل يحتاج تأكيدك)، وإعادته للدوام، وإرسال ملخص الصباح لبريدك،
 *   وتشغيل مازن وبدر والاستوديو وملخص راكان (تشغّلها اللوحة بإجراءاتها المعتادة وتقرأ عليك نتيجتها).
 * - المرحلة الثانية: طلب حر («لمى اكتبي منشور عن…»، «جهّز عرض تدقيق لفندق»، أو سؤال لا تجيبه السجلات) يُكلَّف به الوكيل المناسب
 *   (بالاسم، أو بنوع العمل، وإلا راكان) بعد أن يقرأ عليك راكان ما فهمه وتؤكد؛ تنفذه اللوحة بالتكليف المباشر المعتاد عبر العامل،
 *   ويدققه سالم، ثم يقرأ راكان عليك خلاصته وتقدير سالم. الباحث يدوي، فطلبه يُجهَّز في «تكليف وكيل».
 * - لا حذف، ولا موافقة على إرسال الرسائل أو النشر بالصوت.
 * التعرف على الكلام ونطق الرد يتمّان في المتصفح؛ الخادم يستقبل النص فقط.
 *
 * يعتمد على Office.gs: officeApply_, officeAgentCfg_, officeSetActive_, officeLog_, officeBy_, officeHoursOf_, officeInHours_, officeHoursText_
 * وعلى Digest.gs: digestCollect_, digestWorkerSeen_, digestSend_ — وعلى Executive.gs: execCollect_, execReports_
 * ويستخدم إن وُجد: prospectsAll_, prospectsCfg_, prospectsStats_, tendersAll_
 */

const VOICE_ = {
  maxText: 300,
  female: ["لمى", "ريم"],
  // صيغ الأسماء بعد التطبيع (ى←ي، ة←ه، بلا همزات)
  names: { "راكان": ["راكان", "ركان"], "نواف": ["نواف"], "فيصل": ["فيصل"], "لمى": ["لمي"], "سلطان": ["سلطان"], "سالم": ["سالم"],
    "خالد": ["خالد"], "ريم": ["ريم"], "الباحث": ["الباحث", "باحث"], "زياد": ["زياد"], "مازن": ["مازن"], "بدر": ["بدر"] },
  // أفعال الأمر: من تأمره يأتي بعدها (أوقف خالد)؛ والمضارع: من يفعل يأتي قبلها (خالد يداوم)
  stopImp: ["اوقف", "وقف", "اوقفه", "وقفه", "اوقفها", "وقفها", "اوقفهم", "وقفهم", "ايقاف", "طفي", "بطل", "علق", "اقفل", "سكر"],
  startImp: ["شغل", "شغله", "شغلها", "شغلهم", "فعل", "فعله", "فعلها", "فعلهم", "رجع", "رجعه", "رجعها", "رجعهم", "ارجع", "داوم"],
  stopPres: ["يوقف", "توقف", "يتوقف", "تتوقف", "يرتاح", "ترتاح", "يوقفون", "يتوقفون"],
  startPres: ["يداوم", "تداوم", "يداومون", "يداومو", "يشتغل", "تشتغل", "يشتغلون", "يرجع", "ترجع", "يرجعون", "يكمل", "تكمل"],
  all: ["الكل", "الجميع", "كلهم", "الفريق", "الوكلاء", "المكتب"],
  question: ["كم", "وش", "ايش", "اش", "شو", "هل", "متي", "مين", "من", "ليش", "كيف", "وين", "شلون", "ماذا"],
  // طلب عمل حر لوكيل (يُجهَّز في «تكليف وكيل»)
  task: ["اكتب", "اكتبي", "اقترح", "اقترحي", "حلل", "حللي", "راجع", "راجعي", "صمم", "صممي", "ترجم", "ترجمي", "قارن", "قارني", "اشرح", "اشرحي",
    "اعطني", "عطني", "ابي", "ابغي", "ودي", "اعد", "اعدي", "صيغ", "صيغي", "حول", "حولي"],
  // الوكيل المناسب لطلب بلا اسم: أول كلمة في الجملة تدل على نوع العمل
  route: [
    ["راكان", ["خطه", "اولويات", "استراتيجيه", "رايك", "تنصحني", "نركز"]],
    ["زياد", ["تغريده", "تغريدات", "تويتر", "تويته", "اكس", "هاشتاق", "هاشتاقات"]],
    ["ريم", ["تصميم", "تصاميم", "صمم", "صممي", "صوره", "شعار", "بوستر", "انفوجرافيك"]],
    ["لمى", ["منشور", "منشورات", "بوست", "لينكدان", "لينكد", "مقال", "كابشن", "محتوي"]],
    ["سلطان", ["عرض", "عروض", "عقد", "اتفاقيه", "مقترح", "تسعير"]],
    ["مازن", ["رساله", "ايميل", "تعريفيه"]],
    ["بدر", ["منافسه", "مناقصه", "كراسه"]],
    ["فيصل", ["حلل", "حللي", "تحليل", "السوق", "سوق", "فرص", "فرصه", "تعرفه"]],
    ["نواف", ["خبر", "اخبار", "تنظيمات", "تنظيم"]],
    ["سالم", ["راجع", "راجعي", "دقق", "تدقيق", "صحح"]],
    ["خالد", ["برمجه", "كود", "داله", "سكربت", "modbus", "bacnet", "api", "تكامل"]]
  ],
  // ما يدل على عمل حر لا على تشغيل مهمة جاهزة («مازن جهّز رسالة …» ليس دورة مازن)
  freeObj: ["رساله", "رسالتين", "منشور", "عرض", "خطه", "مقال", "تغريده", "نص", "فكره", "افكار", "تقرير", "ملخص", "قايمه", "جدول", "داله"],
  // أسئلة عن حال الوكيل (تمنع اعتبار الجملة تكليفاً)
  status: ["سوا", "سوت", "سويت", "انجز", "انجزت", "اخبار", "وضع", "حال", "صار"],
  maxTask: 1500,
  topics: ["رد", "ردود", "ردو", "ردوا", "منافسه", "منافسات", "مناقصات", "زياره", "زيارات", "صيانه", "عقود", "العامل", "موافقتي", "موافقات"],
  run: ["جهز", "يجهز", "جهزي", "تجهز", "دور", "يدور", "دوري", "ادور", "ابحث", "يبحث", "ابحثي", "طلع", "يطلع", "ارصد", "يرصد", "رصد",
    "ابدا", "يبدا", "شوف", "يشوف", "لقي", "يلقي", "جيب", "يجيب", "هات", "سو", "سوي", "يسوي", "حضر", "يحضر"],
  fillers: ["لو سمحت", "الله يعافيك", "يعطيك العافيه", "من فضلك", "تكفي", "بليز", "ممكن", "طيب", "يا ليت", "ياليت", "اذا تكرمت"],
  months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  // العدد مع معدوده: [صفر، 1، 2، 3–10، 11+]
  w: {
    task: ["ولا مهمة", "مهمة واحدة", "مهمتين", "مهام", "مهمة"],
    place: ["ولا منشأة", "منشأة واحدة", "منشأتين", "منشآت", "منشأة"],
    msg: ["ولا رسالة", "رسالة واحدة", "رسالتين", "رسائل", "رسالة"],
    reply: ["ولا رد", "رد واحد", "ردين", "ردود", "رداً"],
    tender: ["ولا منافسة", "منافسة واحدة", "منافستين", "منافسات", "منافسة"],
    news: ["ولا خبر", "خبر واحد", "خبرين", "أخبار", "خبراً"],
    post: ["ولا منشور", "منشور واحد", "منشورين", "منشورات", "منشوراً"],
    item: ["ولا شيء", "بند واحد", "بندين", "بنود", "بنداً"],
    out: ["ولا مخرج", "مخرج واحد", "مخرجين", "مخرجات", "مخرجاً"]
  }
};

const voiceNum_ = (n, w) => n === 0 ? w[0] : n === 1 ? w[1] : n === 2 ? w[2] : n + " " + (n <= 10 ? w[3] : w[4]);
const voiceJoin_ = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join("، ") + " و" + a[a.length - 1];

// ---------------- فهم الجملة ----------------
function voiceNorm_(s) {
  let t = String(s || "").slice(0, VOICE_.maxText)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[^ء-ي0-9a-zA-Z\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  VOICE_.fillers.forEach(f => { t = (" " + t + " ").split(" " + f + " ").join(" ").trim(); });
  return t;
}

// الكلمة نفسها، أو بلا حرف عطف أو جر (و، ف، ب، ل)، أو بلا «ال» و«وال» و«بال» و«لل»
function voiceForms_(w) {
  const out = [w];
  if (w.length > 3 && /^[وفبل]/.test(w)) out.push(w.slice(1));
  if (w.length > 4 && /^(ال|لل)/.test(w)) out.push(w.slice(2));
  if (w.length > 5 && /^(وال|بال|فال|ولل)/.test(w)) out.push(w.slice(3));
  return out;
}
const voiceIs_ = (w, list) => voiceForms_(w).some(f => list.indexOf(f) >= 0);
const voiceHas_ = (toks, list) => toks.some(w => voiceIs_(w, list));

function voiceNameAt_(toks, i) {
  const w = toks[i];
  if (!w) return "";
  for (const f of voiceForms_(w)) {
    const n = Object.keys(VOICE_.names).find(k => VOICE_.names[k].indexOf(f) >= 0);
    if (n) return n;
  }
  // «لما» قد تكون لمى إذا نُوديت أو جاءت بعد أمر إيقاف أو تشغيل
  const verbs = VOICE_.stopImp.concat(VOICE_.startImp, VOICE_.stopPres, VOICE_.startPres);
  if (w === "لما" && ((i > 0 && (toks[i - 1] === "يا" || voiceIs_(toks[i - 1], verbs))) || (toks[i + 1] && voiceIs_(toks[i + 1], verbs)))) return "لمى";
  return "";
}

// سؤال: علامة استفهام، أو أداة سؤال في أول ثلاث كلمات («سالم وش دقق اليوم»)، أو «فيه …» / «في منافسات …»
function voiceIsQuestion_(raw, toks) {
  if (/[؟?]/.test(String(raw || ""))) return true;
  if (toks.length && voiceIs_(toks[0], VOICE_.question)) return true;
  if (toks.slice(1, 3).some(w => voiceIs_(w, VOICE_.question.filter(q => q !== "من")))) return true;
  return toks.some((w, i) => w === "فيه" || (w === "في" && i < 3 && toks[i + 1] && voiceIs_(toks[i + 1], ["منافسات", "مناقصات", "ردود", "رد", "شي", "شيء", "جديد", "زيارات", "رسايل", "احد"])));
}

function voiceParse_(raw) {
  let toks = voiceNorm_(raw).split(" ").filter(Boolean);
  // «يا راكان …» أو «راكان، …» في أول الجملة نداء وليس موضوعاً
  if (toks[0] === "يا" && voiceNameAt_(toks, 1) === "راكان" && toks.length > 2) toks = toks.slice(2);
  else if (voiceNameAt_(toks, 0) === "راكان" && toks.length > 1) toks = toks.slice(1);
  if (toks[0] === "يا" && toks.length > 1) toks = toks.slice(1);
  const names = [];
  toks.forEach((w, i) => { const n = voiceNameAt_(toks, i); if (n && names.indexOf(n) < 0) names.push(n); });
  return { toks: toks, text: toks.join(" "), names: names, question: voiceIsQuestion_(raw, toks) };
}

// أوامر الدوام: كل فعل وما يخصه من أسماء أو «الكل»
function voiceDuty_(p) {
  const toks = p.toks, verbs = [], marks = toks.map(() => null);
  toks.forEach((w, i) => {
    const kind = voiceIs_(w, VOICE_.stopImp) ? ["off", "imp"] : voiceIs_(w, VOICE_.startImp) ? ["on", "imp"]
      : voiceIs_(w, VOICE_.stopPres) ? ["off", "pres"] : voiceIs_(w, VOICE_.startPres) ? ["on", "pres"] : null;
    if (kind) verbs.push({ i: i, mode: kind[0], type: kind[1], names: [], all: false });
    else { const n = voiceNameAt_(toks, i); if (n) marks[i] = n; else if (voiceIs_(w, VOICE_.all)) marks[i] = "*"; }
  });
  if (!verbs.length) return [];
  const claimed = {};
  const give = (v, j) => { if (marks[j] === "*") v.all = true; else if (v.names.indexOf(marks[j]) < 0) v.names.push(marks[j]); claimed[j] = true; };
  // المضارع: الفاعل قبله مباشرة (خالد يداوم)، أو بعده (يداوم خالد)
  verbs.filter(v => v.type === "pres").forEach(v => {
    if (v.i > 0 && marks[v.i - 1]) give(v, v.i - 1); else if (marks[v.i + 1]) give(v, v.i + 1);
  });
  // الباقي لأقرب أمر قبله، وإلا لأول فعل بعده، وإلا لأي فعل
  marks.forEach((m, j) => {
    if (!m || claimed[j]) return;
    const before = verbs.filter(v => v.type === "imp" && v.i < j).pop();
    const after = verbs.find(v => v.i > j);
    give(before || after || verbs[0], j);
  });
  return verbs.filter(v => v.all || v.names.length);
}

// ---------------- الكلام المنطوق ----------------
// التواريخ تُنطق «اليوم» و«أمس» و«20 نوفمبر» بدل 2026-11-20
function voiceSpeak_(s) {
  const tz = Session.getScriptTimeZone(), now = Date.now(), ymd = ms => Utilities.formatDate(new Date(ms), tz, "yyyy-MM-dd");
  const today = ymd(now), yest = ymd(now - 86400000), tom = ymd(now + 86400000);
  return String(s || "").replace(/[⁦-⁩]/g, "")
    .replace(/(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/g, (m, y, mo, d, t) => {
      const key = y + "-" + mo + "-" + d;
      const day = key === today ? "اليوم" : key === yest ? "أمس" : key === tom ? "بكرة"
        : Number(d) + " " + VOICE_.months[Number(mo) - 1] + (y !== today.slice(0, 4) ? " " + y : "");
      return t ? day + " الساعة " + t : day;
    })
    .replace(/اليوم اليوم/g, "اليوم").replace(/\s·\s/g, "، ").replace(/\s—\s/g, "، ").replace(/\s+/g, " ").trim();
}
const voiceSay_ = lines => lines.filter(Boolean).map(voiceSpeak_).join(". ").replace(/\.\./g, ".") + ".";

const voiceShort_ = x => String(x).replace(" تنتظر موافقتك", "");

function voiceGreeting_() {
  const h = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "H"));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

// ---------------- الأسئلة ----------------
function voiceBrief_(full) {
  const d = digestCollect_(), say = [voiceGreeting_()];
  const waiting = d.approvals.length;
  say.push(waiting ? "ينتظر موافقتك: " + d.approvals.map(voiceShort_).join("، ") : "ما فيه شيء ينتظر موافقتك الآن");
  const human = d.replies.filter(x => !/^ردود أخرى/.test(x));
  if (d.replies.length) say.push("ردود العملاء منذ أمس: " + d.replies.slice(0, 3).join("، "));
  if (full) {
    if (d.today.length) say.push("اليوم: " + d.today.slice(0, 4).join("، ") + (d.today.length > 4 ? "، وغيرها في اللوحة" : ""));
    const issues = d.team.filter(x => !/متصل$/.test(x));
    if (issues.length) say.push(issues.join("، "));
    else say.push("والفريق كله تمام");
  }
  return { say: voiceSay_(say), lines: d.approvals.concat(d.replies, full ? d.today : [], full ? d.team : []),
    open: d.approvals.some(x => /مازن/.test(x)) ? { view: "prospects", label: "افتح رسائل مازن" } : d.approvals.some(x => /منشورات/.test(x)) ? { view: "content", label: "افتح المنشورات" } : null,
    human: human.length };
}

function voiceApprovals_() {
  const d = digestCollect_();
  if (!d.approvals.length) return { say: "ما فيه شيء ينتظر موافقتك الآن." };
  return { say: voiceSay_(["ينتظر موافقتك: " + d.approvals.map(voiceShort_).join("، ")]), lines: d.approvals,
    open: d.approvals.some(x => /مازن/.test(x)) ? { view: "prospects", label: "افتح رسائل مازن" } : { view: "content", label: "افتح المنشورات" } };
}

function voiceReplies_() {
  const d = digestCollect_();
  if (!d.replies.length) return { say: "ما جانا ردود جديدة من العملاء منذ أمس." };
  return { say: voiceSay_(["ردود العملاء منذ أمس: " + d.replies.join("، ")]), lines: d.replies, open: { view: "prospects", label: "افتح ردود مازن" } };
}

function voiceToday_(re, none) {
  const d = digestCollect_(), items = d.today.filter(x => re.test(x)).concat(d.approvals.filter(x => re.test(x)));
  if (!items.length) return { say: none };
  return { say: voiceSay_(items), lines: items };
}

function voiceWorker_() {
  const w = digestWorkerSeen_(), tz = Session.getScriptTimeZone();
  if (!w.last) return { say: "العامل على جهازك ما اتصل بالخادم بعد. شغّل start-worker.cmd من مجلد worker واتركه مفتوح." };
  const mins = Math.round((Date.now() - w.last) / 60000);
  if (mins <= DIGEST_.offlineMin) return { say: "العامل على جهازك متصل، والوكلاء يقدرون يشتغلون." };
  return { say: voiceSay_(["العامل على جهازك متوقف من " + Utilities.formatDate(new Date(w.last), tz, "yyyy-MM-dd HH:mm"),
    "الوكلاء والإرسال وقراءة الوارد متوقفة حتى تشغّل start-worker.cmd"]) };
}

function voiceTeam_() {
  const names = Object.keys(AGENTS_PROMPTS).filter(n => n !== "الباحث");
  const stopped = names.filter(n => officeAgentCfg_(n).active === false);
  const out = names.filter(n => stopped.indexOf(n) < 0 && !officeInHours_(officeHoursOf_(n)));
  const on = names.filter(n => stopped.indexOf(n) < 0 && out.indexOf(n) < 0);
  if (!stopped.length && !out.length) return { say: "كل الوكلاء يداومون الآن." };
  const say = [];
  if (on.length) say.push("يداوم الآن: " + voiceJoin_(on));
  if (out.length) say.push("خارج الدوام: " + voiceJoin_(out));
  if (stopped.length) say.push("موقوف: " + voiceJoin_(stopped));
  return { say: voiceSay_(say), lines: say };
}

function voiceAgent_(name) {
  const f = VOICE_.female.indexOf(name) >= 0, g = (m, w) => f ? w : m, W = VOICE_.w;
  const c = execCollect_(1), a = c.agents[name];
  if (!a) return { say: "ما أعرف وكيلاً بهذا الاسم." };
  const parts = [];
  const status = !a.active ? g("موقوف حالياً", "موقوفة حالياً") : a.onDuty ? g("في دوامه الآن", "في دوامها الآن") : g("خارج دوامه الآن", "خارج دوامها الآن");
  if (name === "مازن" && typeof prospectsAll_ === "function") {
    const s = prospectsStats_(prospectsAll_(), prospectsCfg_()), ready = (s.byStatus["جاهز للإرسال"] || 0) + (s.byStatus["متابعة جاهزة"] || 0);
    parts.push("جهّز اليوم " + voiceNum_(s.today.found, W.place) + " من هدف " + s.dailyTarget + (s.today.sent ? "، وأُرسل " + voiceNum_(s.today.sent, W.msg) : "، وما أُرسل شيء بعد"));
    if (ready) parts.push(voiceNum_(ready, W.msg) + " تنتظر موافقتك");
    if (s.repliesToday) parts.push("وجانا اليوم " + voiceNum_(s.repliesToday, W.reply));
  } else if (name === "بدر" && typeof tendersAll_ === "function") {
    const all = tendersAll_(), from = c.start.getTime(), soon = Date.now() + 7 * 86400000;
    parts.push("رصد اليوم " + voiceNum_(all.filter(t => t.atMs >= from).length, W.tender));
    const closing = all.filter(t => ["جديد", "نتابعها", "نجهز العرض"].indexOf(t.status) >= 0 && t.kind !== "ترسية" && t.verdict !== "تجاهل" && t.bidsMs >= Date.now() && t.bidsMs <= soon).length;
    if (closing) parts.push(voiceNum_(closing, W.tender) + " تنتهي خلال أسبوع");
  } else if (name === "راكان") {
    const r = execReports_(1)[0];
    if (r) parts.push("آخر ملخص كتبه " + r.at + (r.report && r.report.headline ? ": " + r.report.headline : ""));
  } else if (name === "نواف" && a.news) parts.push("رصد اليوم " + voiceNum_(a.news, W.news));
  else if (name === "فيصل" && a.news) parts.push("حلّل اليوم " + voiceNum_(a.news, W.news));
  else if (name === "لمى" && (a.content || a.news)) parts.push("كتبت اليوم " + voiceNum_(a.content + a.news, W.post));
  else if (name === "ريم" && a.content) parts.push("صممت اليوم " + voiceNum_(a.content, W.post));
  else if (name === "زياد" && a.content) parts.push("كتب اليوم نسخة X لـ " + voiceNum_(a.content, W.post));
  else if (name === "سالم" && (a.scored + a.news + a.content)) parts.push("دقق اليوم " + voiceNum_(a.scored + a.news + a.content, W.out));
  if (a.tasks) parts.push(g("نفّذ", "نفّذت") + " من التكليفات " + voiceNum_(a.tasks, W.task) + (a.avg !== null ? " بمتوسط تقدير سالم " + a.avg + "%" : "") + (a.low ? "، منها " + a.low + " بتقدير منخفض" : ""));
  if (a.pending) parts.push(voiceNum_(a.pending, W.task) + " قيد التنفيذ");
  if (!parts.length) parts.push(g("ما سجّل نشاطاً اليوم", "ما سجّلت نشاطاً اليوم"));
  return { say: voiceSay_([name + " " + status].concat(parts)), lines: parts.concat(["الدوام: " + a.hours]),
    open: name === "مازن" ? { view: "prospects", label: "افتح صفحة مازن" } : name === "بدر" ? { view: "tenders", label: "افتح صفحة بدر" } : name === "راكان" ? { view: "exec", label: "افتح ملخص راكان" } : null };
}

function voiceHelp_() {
  return { say: "أقدر أقول لك وش ينتظرك اليوم، والموافقات، وردود العملاء، وحالة العامل، ومين يداوم، ووش سوى أي وكيل اليوم، والمنافسات وزيارات الصيانة. "
    + "وأقدر أوقف أي وكيل أو أرجعه للدوام، وأخلي مازن يجهز الشركات، وبدر يدور المنافسات، وأكمل المنشورات، وأكتب ملخص اليوم أو الأسبوع، وأرسل ملخص الصباح لبريدك. وتقدر تكلّف أي وكيل بمهمة تقولها بكلامك، وأقرأ لك النتيجة إذا خلص.",
    examples: ["وش ينتظرني اليوم؟", "كم رد جانا؟", "وش سوى مازن اليوم؟", "هل العامل شغال؟", "مين موقوف؟", "أوقف خالد", "خل خالد يداوم", "مازن جهّز شركات اليوم", "بدر دوّر منافسات", "أرسل ملخص اليوم على إيميلي", "لمى اكتبي منشور عن ترشيد التكييف في المستشفيات", "جهّز عرض تدقيق طاقة لفندق في الرياض"] };
}

// ---------------- الأوامر ----------------
function voiceDoDuty_(clauses, by, confirmed) {
  const offAll = clauses.some(c => c.mode === "off" && c.all);
  if (offAll && !confirmed) return { say: "أكيد توقف كل الوكلاء؟ ما راح ينفذون أي عمل يدوي أو آلي حتى ترجعهم. قل أكّد أو إلغاء.", confirm: { op: "off_all", prompt: "إيقاف كل الوكلاء" } };
  const said = [];
  clauses.forEach(c => {
    const on = c.mode === "on", names = c.all ? Object.keys(AGENTS_PROMPTS) : c.names;
    officeSetActive_(c.all ? { all: true, active: on } : { names: names, active: on });
    officeCache_ = null;
    officeLog_(on ? "تشغيل" : "إيقاف", c.all ? "الكل" : names.join("، "), (on ? "يداوم ويقبل المهام" : "لا ينفذ مهاماً يدوية ولا آلية") + " — بالصوت", by);
    if (c.all) { said.push(on ? "كل الوكلاء يداومون الآن" : "أوقفت كل الوكلاء"); return; }
    if (!on) { said.push("أوقفت " + voiceJoin_(names)); return; }
    const outside = names.filter(n => n !== "الباحث" && !officeInHours_(officeHoursOf_(n)));
    said.push(names.length > 1 ? voiceJoin_(names) + " يداومون الآن" : names[0] + (VOICE_.female.indexOf(names[0]) >= 0 ? " تداوم الآن" : " يداوم الآن"));
    if (outside.length) said.push("لكن " + voiceJoin_(outside) + " خارج ساعات الدوام الآن، فالأعمال الآلية تنتظر بداية الدوام");
  });
  return { say: "تم، " + voiceSay_(said), refreshOffice: true };
}

function voiceRun_(kind, p) {
  const needs = { prospects: "مازن", tenders: "بدر", studio: "لمى", exec: "راكان" }[kind];
  if (needs && officeAgentCfg_(needs).active === false) return { say: needs + (VOICE_.female.indexOf(needs) >= 0 ? " موقوفة" : " موقوف") + " حالياً. قل: خل " + needs + " يداوم، ثم اطلب منه." };
  if (kind === "prospects") return { say: "تمام، مازن بدأ يكتب المتابعات والمسودات ثم يبحث عن منشآت جديدة. تأخذ من ثلاث إلى خمس دقائق، وأبلغك إذا خلص.", run: { kind: kind, body: { action: "prospects_run" } } };
  if (kind === "tenders") return { say: "تمام، بدر بدأ يدوّر المنافسات والترسيات. تأخذ من ثلاث إلى خمس دقائق، وأبلغك إذا خلص.", run: { kind: kind, body: { action: "tenders_run" } } };
  if (kind === "studio") return { say: "تمام، لمى تكتب وسالم يدقق وريم تصمم وزياد يكتب نسخة X. تأخذ من دقيقتين إلى أربع، وأبلغك إذا خلصوا.", run: { kind: kind, body: { action: "studio_run" } } };
  const k = voiceHas_(p.toks, ["الاسبوع", "اسبوع", "اسبوعي", "الاسبوعي"]) ? "week" : voiceHas_(p.toks, ["الشهر", "شهر", "شهري", "الشهري"]) ? "month" : "day";
  const label = { day: "ملخص اليوم", week: "ملخص الأسبوع", month: "ملخص الشهر" }[k];
  return { say: "تمام، أكتب " + label + " الآن. يأخذ دقيقة تقريباً.", run: { kind: "exec", body: { action: "exec_run", kind: k } } };
}

function voiceSendDigest_(by) {
  try {
    const r = digestSend_(by);
    return { say: "أرسلت ملخص اليوم إلى بريدك" + (r.sections.approvals ? "، وفيه " + voiceNum_(r.sections.approvals, VOICE_.w.item) + " تنتظر موافقتك" : "") + "." };
  } catch (err) {
    if (/permission|authorization|Authorization is required/i.test(String(err.message))) return { say: "يحتاج الخادم إذن Google لإرسال البريد. افتح محرر Apps Script وشغّل الدالة digestAuthorize مرة ووافق." };
    throw err;
  }
}

// نص المهمة كما قلته بلا النداء («يا لمى»، «راكان،»، «خل مازن»)
function voiceTaskText_(raw, name) {
  let task = String(raw || "").trim();
  const forms = [name].concat(name === "لمى" ? ["لمي", "لما"] : []);
  forms.forEach(n => { task = task.replace(new RegExp("^\\s*(?:يا\\s+)?(?:راكان[،,\\s]+)?(?:خل(?:ي)?\\s+)?(?:يا\\s+)?" + n + "[،,:\\s]*"), ""); });
  return (task.replace(/^\s*(?:يا\s+)?راكان[،,:\s]+/, "").trim() || String(raw).trim()).slice(0, VOICE_.maxTask);
}

function voiceRoute_(toks) {
  for (const w of toks) {
    const hit = VOICE_.route.find(([, words]) => voiceIs_(w, words));
    if (hit) return hit[0];
  }
  return "";
}

// الباحث يدوي (تنقل تقرير Claude بنفسك)، فطلبه يُجهَّز في «تكليف وكيل»
function voiceCompose_(raw, name) {
  return { say: "جهزت طلب " + name + " في صفحة التكليف. البحث ينقل يدوياً من Claude، فراجعه وأكمل من هناك.", compose: { agent: name, task: voiceTaskText_(raw, name) } };
}

// يقرأ عليك ما فهمه ثم ينتظر تأكيدك قبل التكليف
function voiceAssign_(raw, name) {
  if (name === "الباحث") return voiceCompose_(raw, name);
  const task = voiceTaskText_(raw, name), f = VOICE_.female.indexOf(name) >= 0;
  if (officeAgentCfg_(name).active === false)
    return { say: name + (f ? " موقوفة" : " موقوف") + " حالياً. قل: خل " + name + " يداوم، ثم اطلب منه مرة ثانية.", compose: { agent: name, task: task } };
  return { say: "أكلّف " + name + " بهذا: " + task + ". قل أكّد، أو إلغاء، أو اذكر وكيلاً غيره.",
    confirm: { op: "task", agent: name, task: task, prompt: "تكليف " + name }, compose: { agent: name, task: task } };
}

// بعد تأكيدك: تنفذه اللوحة بالتكليف المباشر المعتاد (عبر العامل، ويدققه سالم)
function voiceTaskStart_(c) {
  const name = String(c.agent || ""), task = String(c.task || "").trim().slice(0, VOICE_.maxTask), f = VOICE_.female.indexOf(name) >= 0;
  if (!AGENTS_PROMPTS[name] || name === "الباحث") throw appError_("VALIDATION_ERROR", "وكيل غير معروف");
  if (task.length < 3) throw appError_("VALIDATION_ERROR", "نص المهمة قصير");
  if (officeAgentCfg_(name).active === false) return { say: name + (f ? " موقوفة" : " موقوف") + " حالياً. قل: خل " + name + " يداوم، ثم اطلب منه مرة ثانية." };
  return { say: "تمام، " + name + (f ? " بدأت" : " بدأ") + " على المهمة ويدققها سالم بعد" + (f ? "ها" : "ه") + ". أبلغك إذا خلص" + (f ? "ت" : "") + ".",
    run: { kind: "task", agent: name, body: { agent: name, task: task } } };
}

// ---------------- التوجيه ----------------
function voiceAsk_(data, user) {
  const by = officeBy_(user) + " · بالصوت";
  if (data.confirm) {
    if (data.confirm.op === "off_all") return voiceDoDuty_([{ mode: "off", all: true, names: [] }], by, true);
    if (data.confirm.op === "task") return voiceTaskStart_(data.confirm);
    throw appError_("VALIDATION_ERROR", "تأكيد غير معروف");
  }
  const raw = String(data.text || "").slice(0, VOICE_.maxText);
  const p = voiceParse_(raw), t = p.text, toks = p.toks;
  if (!t) return { say: "ما سمعت شيء. اضغط الميكروفون وتكلم." };
  const subject = p.names.filter(n => n !== "راكان" || p.names.length === 1);
  const has = list => voiceHas_(toks, list);
  const activity = has(["سوا", "سوي", "سوت", "سويت", "عمل", "انجز", "انجزت", "اخبار", "وضع", "حال", "صار", "اشتغل", "اشتغلت", "دقق", "كتب", "كتبت", "صمم", "صممت", "رصد", "حلل"]);

  if (has(["مساعده", "الاوامر", "اوامر", "تقدر"]) && (p.question || has(["مساعده"]))) return voiceHelp_();
  if (has(["احذف", "امسح", "شيل", "حذف", "مسح"])) return { say: "الحذف ما يكون بالصوت، حتى ما يضيع شيء بالغلط. احذف من صفحة القسم نفسه." };

  if (!p.question) {
    // موافقات الإرسال والنشر تبقى من صفحاتها في هذه المرحلة
    if (has(["وافق", "اعتمد", "انشر", "ارسلها", "ارسلهم"]) || (has(["ارسل", "رسل", "ابعث", "طرش"]) && has(["رسايل", "الرسايل", "ايميلات", "الايميلات", "مازن", "منشور", "المنشورات"])))
      return { say: "الموافقة على إرسال الرسائل ونشر المنشورات تكون من صفحاتها، حتى تشوف النص قبل ما يطلع.", open: has(["منشور", "المنشورات", "انشر"]) ? { view: "content", label: "افتح المنشورات" } : { view: "prospects", label: "افتح رسائل مازن" } };
    if (has(["ارسل", "رسل", "ابعث", "طرش", "ارسله", "ارسلي"]) && has(["ملخص", "الملخص"])) return voiceSendDigest_(by);
    const duty = voiceDuty_(p);
    const runVerb = has(VOICE_.run), freeObj = has(VOICE_.freeObj);
    if (!duty.length || runVerb) {
      if (!freeObj && ((subject.indexOf("مازن") >= 0 && (runVerb || has(["شركات", "منشات", "عملاء", "ايميلات"]))) || (!subject.length && runVerb && has(["شركات", "منشات", "عملاء", "ايميلات", "عملا"])))) return voiceRun_("prospects", p);
      if (!freeObj && ((subject.indexOf("بدر") >= 0 && (runVerb || has(["منافسات", "مناقصات", "فرص", "ترسيات"]))) || (!subject.length && runVerb && has(["منافسات", "مناقصات", "ترسيات"])))) return voiceRun_("tenders", p);
      if (has(["كمل", "اكمل", "خلص", "جهز", "سو", "سوي"]) && has(["منشور", "منشورات", "المنشورات", "بوست", "البوستات", "المحتوي"]) && !has(["عن"])) return voiceRun_("studio", p);
    }
    const summary = (has(["ملخص", "الملخص"]) || (has(["تقرير", "التقرير"]) && has(["الاسبوع", "اسبوعي", "الشهر", "شهري", "اليوم", "يومي", "التنفيذي", "تنفيذي"])))
      && !has(["عن"]) && (!subject.length || subject.indexOf("راكان") >= 0);
    if (summary && has(["الاسبوع", "اسبوع", "اسبوعي", "الشهر", "شهر", "شهري", "تنفيذي", "التنفيذي"])) return voiceRun_("exec", p);
    if (summary && has(["اكتب", "سو", "سوي", "جهز", "حضر"]) && !has(["الصباح"])) return voiceRun_("exec", p);
    if (summary && !duty.length) return voiceBrief_(true);
    if (duty.length) return voiceDoDuty_(duty, by, false);
    // طلب حر: للوكيل المذكور، أو لمن يناسب نوع العمل، وإلا لراكان.
    // فعل عمل أو موضوع عمل («جهّز عرض صيانة») يغلب كلمات الأسئلة («زيارات الصيانة»)
    const work = has(VOICE_.task) || runVerb || freeObj;
    if (!has(VOICE_.status) && toks.length >= 3 && (work || (!has(VOICE_.topics) && (subject.length || voiceRoute_(toks)))))
      return voiceAssign_(raw, subject[0] || voiceRoute_(toks) || "راكان");
  }

  // أسئلة
  if (has(["العامل", "عامل", "الوركر", "جهازي", "الجهاز", "الكمبيوتر", "اللابتوب"])) return voiceWorker_();
  if (!subject.length && has(["موقف", "موقوف", "موقفين", "موقوفين", "واقف", "واقفين", "يداوم", "يداومون", "بالدوام", "الدوام", "دوام", "شغالين"])) return voiceTeam_();
  if (subject.length && activity) return voiceAgent_(subject[0]);
  if (has(["رد", "ردود", "ردو", "ردوا", "ردت", "يرد", "ردهم", "جاوب", "جاوبو", "جاوبوا"])) return voiceReplies_();
  if (has(["موافقتي", "موافقه", "موافقات", "ينتظر", "ينتظرني", "اعتماد", "مراجعه", "مراجعتي"]) && !has(["اليوم", "عندي"])) return voiceApprovals_();
  if (has(["منافسه", "منافسات", "مناقصه", "مناقصات", "ترسيه", "ترسيات", "مستند", "مستندات", "شهاده", "شهادات"])) return voiceToday_(/منافسة|مستند/, "ما فيه منافسات تنتهي هذا الأسبوع ولا مستندات قريبة الانتهاء.");
  if (has(["زياره", "زيارات", "صيانه", "عقد", "عقود", "تجديد", "العقود"])) return voiceToday_(/زيارة|تجديد|عروض صيانة/, "ما فيه زيارات صيانة اليوم ولا تجديدات قريبة.");
  if (subject.length && toks.length >= 5) return voiceAssign_(raw, subject[0]);
  if (subject.length) return voiceAgent_(subject[0]);
  if (has(["ملخص", "الملخص", "لخص", "لخصلي", "عندي", "ينتظرني", "الجديد", "جديد", "يومي", "اليوم", "صباح", "مساء", "ابدا"])) return voiceBrief_(true);
  if (has(["مرحبا", "هلا", "السلام", "اهلا", "هاي"])) { const b = voiceBrief_(false); if (has(["السلام"])) b.say = "وعليكم السلام. " + b.say; return b; }
  if (toks.length >= 3) return voiceAssign_(raw, voiceRoute_(toks) || "راكان");
  return { say: "ما فهمت الطلب. جرّب مثلاً: وش ينتظرني اليوم، أو أوقف خالد، أو لمى اكتبي منشور عن ترشيد التكييف.", examples: voiceHelp_().examples };
}

function handleVoiceAction_(data, user) {
  try {
    officeApply_();
    if (data.action !== "voice_ask") throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    return json_(Object.assign({ status: "success" }, voiceAsk_(data, user)));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
