"use strict";
// الثوابت: الوكلاء والفترات ومفاتيح التخزين والحالة والأيقونات

// نفس أسماء الوكلاء في AGENTS_PROMPTS داخل Code.gs
const AGENTS = [
  { name: "راكان", role: "مدير المكتب", c: "#5cc7b1",
    desc: "يدير الفريق ويلخّص التقارير ويقترح أولويات المحتوى والفرص في كفاءة الطاقة.",
    examples: ["لخّص أبرز أخبار الطاقة هذا الأسبوع في تقرير تنفيذي قصير", "اقترح خطة محتوى أسبوعية لانطلق ووهج"] },
  { name: "نواف", role: "رصد أخبار الطاقة", c: "#7fb2ec",
    desc: "يرصد أخبار كفاءة الطاقة والطاقة الشمسية والتنظيمات في السعودية، ويقيّم صلتها بخدماتنا.",
    examples: ["ما أبرز تنظيمات كفاءة الطاقة التي يجب أن نتابعها؟", "لخّص هذا الخبر وحدد الخدمة المرتبطة به: …"] },
  { name: "فيصل", role: "محلل سوق الطاقة", c: "#b89af0",
    desc: "يحلل أثر الأخبار والتعرفة والتنظيمات على عملائنا، ويستخرج الفرص لكل قطاع.",
    examples: ["ما فرص تدقيق الطاقة في المستشفيات الخاصة؟", "كيف يؤثر صافي القياس على الطلب على وهج؟"] },
  { name: "لمى", role: "المحتوى والتواصل", f: true, c: "#f08fb8",
    desc: "تكتب منشورات LinkedIn تربط كل فكرة بخدمة أو منتج من انطلق أو وهج.",
    examples: ["منشور يعرّف بأثر لقياس الوفر في المباني الحكومية", "نصائح ترشيد التكييف في ذروة الصيف لأصحاب المنازل"] },
  { name: "سلطان", role: "تطوير الأعمال", c: "#f0b766",
    desc: "يصوغ عروض تدقيق الطاقة وخطط القياس والتحقق وعقود الأداء والصيانة.",
    examples: ["مسودة عرض تدقيق طاقة لمبنى حكومي", "اتفاقية مستوى خدمة لنظام ساعد لإدارة المباني"] },
  { name: "سالم", role: "الجودة والامتثال", c: "#6fd09a",
    desc: "يدقق النصوص مقابل المصدر وملف الشركة، ويمنع الأرقام والوعود غير الموثقة.",
    examples: ["راجع هذا المنشور مقابل ملف الشركة: …", "ضع قائمة تدقيق لمحتوى الطاقة قبل نشره"] },
  { name: "خالد", role: "الأنظمة والبرمجيات", c: "#a5b4c8",
    desc: "يجهّز تكامل أنظمة المباني والطاقة (BACnet وModbus) والواجهات ولوحات القياس.",
    examples: ["اشرح ربط عدادات Modbus بنظام أثر", "اكتب دالة تحسب الوفر مقارنة بخط الأساس"] },
  { name: "ريم", role: "تصميم الهوية", f: true, c: "#ef8a6f",
    desc: "تصمم صور المنشورات لـ LinkedIn وX بهوية انطلق ووهج وأثر، بنصوص قصيرة من المنشور نفسه.",
    examples: ["اقترحي ثلاثة عناوين بصرية لمنشور عن أثر في المستشفيات", "ما القالب الأنسب لنصائح ترشيد التكييف لوهج؟"] },
  { name: "الباحث", role: "باحث الإنترنت", c: "#75c7dd",
    desc: "يساعدك على إعداد بحث عن الشركات والمنتجات والأسواق والموضوعات العامة في Claude، ثم حفظ التقرير ومصادره يدوياً في المكتب.",
    examples: ["ابحث عن شركة سابك: نشاطها ومنتجاتها وأحدث المعلومات المنشورة عنها مع المصادر", "قارن بين ثلاثة أنظمة لإدارة المشاريع باستخدام مصادرها الرسمية، واذكر تاريخ المعلومات"] },
  { name: "زياد", role: "محتوى منصة X", c: "#8fd3e8",
    desc: "يحوّل منشورات LinkedIn إلى تغريدات قصيرة بصوت كل علامة ضمن 280 حرفاً.",
    examples: ["حوّل هذا المنشور إلى تغريدة: …", "اقترح هاشتاقات X مناسبة لمحتوى كفاءة الطاقة في السعودية"] }
];
const AGENT_BY_NAME = Object.fromEntries(AGENTS.map(a => [a.name, a]));

// توزيع البطاقات حول العدّاد: r = العمود الأيمن، l = الأيسر، c5 = أسفل العدّاد
const SLOTS = [
  { pos: "r1", agent: "راكان" }, { pos: "r2", agent: "نواف" }, { pos: "r3", agent: "فيصل" },
  { pos: "r4", agent: "لمى" }, { pos: "r5", agent: "سلطان" },
  { pos: "l1", agent: "سالم" }, { pos: "l2", agent: "خالد" }, { pos: "l3", sys: "newsQuality" },
  { pos: "l4", sys: "coverage" }, { pos: "l5", sys: "highRate" },
  { pos: "c5", sys: "completion" },
  { pos: "r6", agent: "ريم" }, { pos: "c6", sys: "ready" }, { pos: "l6", agent: "زياد" }
];
const SYS = {
  completion: { title: "إنجاز التكليفات", sub: "التكليفات المباشرة المكتملة في الفترة", view: "tasks", sort: "new" },
  newsQuality: { title: "جودة الأخبار", sub: "متوسط تقدير سالم للأخبار", view: "news" },
  coverage: { title: "تدقيق التكليفات", sub: "تكليفات مباشرة لها تقدير رقمي", view: "tasks", sort: "low" },
  highRate: { title: "الاعتماد العالي", sub: "مخرجات بتقدير 85% فأكثر", view: "tasks", sort: "high" },
  ready: { title: "جاهزية النشر", sub: "معتمدة بتصميم ونسخة X", view: "content", cfilter: "approved" }
};
const TONE_LABEL = { ok: "جيد", warn: "متوسط", bad: "ضعيف", none: "لا بيانات" };
const TONE_COLOR = { ok: "#2bd47d", warn: "#f3b03d", bad: "#ef5350", none: "#3a3f46" };
const VIEWS = {
  compose: { title: "تكليف وكيل", sub: "اختر الوكيل واكتب المهمة؛ الباحث يتيح نقل تقرير Claude يدوياً." },
  tasks: { title: "سجل المهام", sub: "أحدث 20 مهمة، مع الأبحاث الجارية حتى اكتمالها." },
  news: { title: "الأخبار", sub: "آخر 10 أخبار طاقة رصدها نواف وربطها الفريق بخدماتنا." },
  team: { title: "التكليفات المباشرة للوكلاء", sub: "التكليفات المباشرة خلال الفترة؛ لا تشمل الأدوار الآلية في الأخبار وخطط المحتوى والتصاميم." },
  alerts: { title: "تنبيهات الفترة", sub: "كل المخرجات منخفضة التقدير أو غير مكتملة التدقيق في الفترة المختارة." },
  office: { title: "إدارة المكتب", sub: "تعليمات الوكلاء وتوجيهاتك، ساعات العمل، المهام المجدولة، الأتمتة، وهوية التصاميم." },
  content: { title: "المحتوى والاعتماد", sub: "منشورات الأخبار وخطة الأسبوع والنصائح الموسمية؛ لا يُعتبر شيء جاهزاً للنشر قبل اعتمادك." }
};
// نفس قيم RANGE_DAYS في Code.gs
const RANGES = [
  { id: "day", label: "اليوم", note: "اليوم" },
  { id: "week", label: "آخر 7 أيام", note: "آخر 7 أيام" },
  { id: "month", label: "آخر 30 يوماً", note: "آخر 30 يوماً" },
  { id: "all", label: "الكل", note: "كل البيانات" }
];

// معرّف عميل OAuth من Google Cloud (عام وليس سراً). فارغ = تسجيل الدخول بـ Google مخفي، ويبقى الرمز المشترك
const GOOGLE_CLIENT_ID = "";

const KEYS = { url: "entaliq.url", token: "entaliq.token", idToken: "entaliq.idToken", agent: "entaliq.agent", draft: "entaliq.draft", auto: "entaliq.auto", range: "entaliq.range", linkedin: "entaliq.linkedin", research: "entaliq.research", manualResearch: "entaliq.research.manual" };
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
};
// الرمز في sessionStorage افتراضياً (يُمسح بإغلاق المتصفح)، وفي localStorage فقط إذا اختار المستخدم «تذكّر الرمز»
const tokenStore = {
  remembered() { return !!store.get(KEYS.token); },
  get() { try { return store.get(KEYS.token) || sessionStorage.getItem(KEYS.token) || ""; } catch (e) { return store.get(KEYS.token); } },
  set(token, remember) {
    store.set(KEYS.token, remember ? token : "");
    try { !remember && token ? sessionStorage.setItem(KEYS.token, token) : sessionStorage.removeItem(KEYS.token); } catch (e) {}
  }
};

const state = {
  url: store.get(KEYS.url),
  token: tokenStore.get(),
  linkedin: store.get(KEYS.linkedin),
  agent: AGENT_BY_NAME[store.get(KEYS.agent)] ? store.get(KEYS.agent) : "راكان",
  range: RANGES.some(r => r.id === store.get(KEYS.range)) ? store.get(KEYS.range) : "week",
  tasks: [], news: [], content: [], stats: null, alerts: null, sig: "",
  taskVersions: {}, taskBusyId: null, taskOpenId: null,
  manualDraft: { task: "", report: "", sourcesText: "", requestId: "", payloadKey: "" }, researchTasks: {}, researchIntents: {}, researchFocus: "", researchTimer: 0, researchPollSeq: 0, researchPolling: false, researchRevision: 0, resultOwner: "",
  contentVersions: {}, contentMeta: null, contentFloor: null, contentPageLoading: false, connectionEpoch: 0, refreshSeq: 0,
  editingVersion: "", editingDraft: "", askingVersion: "", askingDraft: "", conflictId: null, recoveryDraft: null,
  contentFilter: "review", editingId: null, askingId: null, askingKind: "", contentBusy: false, designSize: {},
  loaded: false, loading: false, error: "", lastSync: null,
  sending: false, fetching: false,
  idToken: (() => { try { return sessionStorage.getItem(KEYS.idToken) || ""; } catch (e) { return ""; } })(),
  social: null, socialPosts: {}, socialBusy: false,
  office: null, officeTab: "agents", officeEdit: "", officeTaskEdit: "", officeLoading: false, officeError: "", designEditId: "",
  view: "", filterAgent: "", query: "", sort: "new"
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  refresh: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  play: svg('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  full: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  send: svg('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  ext: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>'),
  news: svg('<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  clip: svg('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  team: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>')
};
// رسومات البلاطات العلوية (64×36)
const GLYPH = {
  news: '<svg viewBox="0 0 64 36" aria-hidden="true"><rect x="4" y="5" width="22" height="18" rx="2" fill="#c9ced4"/><path d="M31 7h29M31 14h29M31 21h29M4 30h56" stroke="#c9ced4" stroke-width="2.4"/></svg>',
  best: '<svg viewBox="0 0 64 36" aria-hidden="true"><rect x="9" y="16" width="13" height="19" fill="#5d636b"/><rect x="25" y="2" width="14" height="33" fill="#eceff2"/><rect x="42" y="12" width="13" height="23" fill="#5d636b"/></svg>',
  assign: '<svg viewBox="0 0 64 36" aria-hidden="true" fill="none" stroke="#c9ced4" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M46 4 24 18M46 4 38 33l-6-12-13-5z"/></svg>',
  log: '<svg viewBox="0 0 64 36" aria-hidden="true"><rect x="22" y="1" width="20" height="9" rx="2" fill="#eceff2"/><path d="M32 10v6M12 16h40M12 16v5M32 16v5M52 16v5" stroke="#868d95" stroke-width="2" fill="none"/><rect x="3" y="23" width="18" height="9" rx="2" fill="#868d95"/><rect x="23" y="23" width="18" height="9" rx="2" fill="#868d95"/><rect x="43" y="23" width="18" height="9" rx="2" fill="#868d95"/></svg>'
};
