"use strict";
// أدوات الحساب والعرض والمؤشرات

// ---------------- أدوات الحساب والعرض ----------------
if (window.DOMPurify) {
  DOMPurify.addHook("afterSanitizeAttributes", node => {
    if (node.tagName === "A") { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
  });
}
// تُنقّى مخرجات Markdown دائماً قبل إدراجها في الصفحة
function md(text) {
  const s = String(text ?? "").trim();
  if (!s) return '<p class="hint">—</p>';
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(s, { gfm: true, breaks: true }), { FORBID_TAGS: ["img", "style", "form", "input", "button"] });
  }
  return '<p class="pre">' + esc(s) + "</p>";
}

// يستخرج النسبة المئوية من نص تدقيق سالم (يدعم الأرقام العربية و ٪)
function salemScore(text) {
  // توافق محافظ مع التدقيق القديم: تسمية درجة صريحة، دون الكود أو الاقتباسات أو سجل التدقيق السابق.
  const current = String(text === undefined || text === null ? "" : text).split(AUDIT_HISTORY_MARKER)[0];
  if (/^حالة التدقيق:\s*تعذر التقييم/.test(current.trim())) return null;
  // الرد المنظم الذي صاغه الخادم يحدد درجته في الرأس؛ الأرقام المقتبسة داخل الأسباب ليست درجات بديلة.
  const lines = current.trim().split(/\r?\n/);
  if (/^نوع التدقيق: (?:تدقيق برمجي|فحص روابط|تدقيق محتوى|تدقيق عام)$/.test(lines[1] || "")) {
    const header = lines[0].match(/^نسبة الدقة: ([+-]?\d+(?:\.\d+)?)%$/);
    const number = header ? Number(header[1]) : NaN;
    return isFinite(number) && number >= 0 && number <= 100 ? Math.round(number) : null;
  }
  const tick = String.fromCharCode(96);
  const clean = current.replace(new RegExp(tick + "{3}[\\s\\S]*?(?:" + tick + "{3}|$)|~~~[\\s\\S]*?(?:~~~|$)", "g"), " ")
    .replace(/^\s*>.*$/gm, " ").replace(/^\s*(?:مثال|مقتطف|اقتباس|النص الأصلي|النص المنقول)\s*[:：].*$/gm, " ")
    .replace(new RegExp(tick + "[^" + tick + "\\r\\n]*" + tick, "g"), " ")
    .replace(/"[^"\r\n]*"|'[^'\r\n]*'|“[^”]*”|«[^»]*»/g, " ")
    .replace(/<[^>]*>/g, " ").replace(/[*_#]/g, "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/٫/g, ".");
  const label = /(^|[^\p{L}\p{N}_])(?:نسبة\s+(?:الدقة(?:\s+المئوية)?|الجودة)|درجة\s+(?:الدقة|الجودة)|تقدير\s+سالم|الدقة|دقة|الجودة|جودة|التقييم|تقييم)\s*[:：–]?\s*(?:([+-]?\d+(?:\.\d+)?)\s*[%٪]|[%٪]\s*([+-]?\d+(?:\.\d+)?))/gu;
  const values = [];
  let match;
  while ((match = label.exec(clean)) !== null) {
    if (/^\s*(?:[-–—]|إلى|الى|to)\s*[+-]?\d/i.test(clean.slice(label.lastIndex))) return null;
    values.push(Number(match[2] === undefined ? match[3] : match[2]));
  }
  if (!values.length) {
    // درجة عارية مسموحة فقط إن كانت وحدها في أول سطر؛ «0% من الاستهلاك» ليس تقييماً.
    const first = clean.trim().split(/\r?\n/)[0];
    const bare = first.match(/^([+-]?\d+(?:\.\d+)?)\s*[%٪](?:\s*$|\s*[:|]\s*\S)/);
    if (bare) values.push(Number(bare[1]));
  }
  if (!values.length || values.some(n => !isFinite(n) || n < 0 || n > 100) || new Set(values).size !== 1) return null;
  return Math.round(values[0]);
}

const isNum = v => typeof v === "number";
const mean = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
const pct = (part, total) => total ? Math.round(part / total * 100) : null;
const tone = v => v === null ? "none" : v >= 85 ? "ok" : v >= 70 ? "warn" : "bad";
function tasksWord(n) {
  if (!n) return "لا مهام";
  if (n === 1) return "مهمة واحدة";
  if (n === 2) return "مهمتان";
  return n <= 10 ? n + " مهام" : n + " مهمة";
}

// الخادم المحدّث يرسل "yyyy-MM-dd HH:mm"، والنسخة الأصلية ترسل ISO؛ نوحّد العرض
function fmtDate(v) {
  const s = String(v ?? "");
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return s;
}
const dayKey = v => { const m = fmtDate(v).match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ""; };
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const shortDay = v => { const k = dayKey(v); return k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : ""; };
const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };

const rangeNote = () => RANGES.find(r => r.id === state.range).note;

// المؤشرات من إحصاءات الخادم لكل البيانات في الفترة؛ وإن كان الخادم أقدم فمن أحدث العناصر
function computeMetrics() {
  const s = state.stats;
  if (!s) return metricsFromRecent();
  const perAgent = {};
  AGENTS.forEach(a => {
    const g = s.agents[a.name] || { count: 0, scored: 0, avg: null };
    perAgent[a.name] = { a, count: g.count, scored: g.scored, avg: g.avg };
  });
  return {
    overall: s.overall.avg,
    scoredCount: s.overall.scored,
    perAgent,
    done: s.tasks.done,
    total: s.tasks.total,
    completion: pct(s.tasks.done, s.tasks.total),
    newsQuality: s.news.avg,
    coverage: pct(s.tasks.scored, s.tasks.total),
    highRate: pct(s.overall.high, s.overall.scored),
    ready: readyRate(),
    ...outreachRates(),
    activeAgents: AGENTS.filter(a => perAgent[a.name].count).length,
    todayTasks: s.today.tasks,
    todayNews: s.today.news,
    trend: s.series.points.map(p => p.avg).filter(isNum),
    alerts: Array.isArray(state.alerts) ? state.alerts.length : s.alerts,
    series: s.series
  };
}

// مؤشرا مازن (Prospects.gs): متوسط تقدير سالم لمسوداته، ومعدل الرد من الرسائل المرسلة
function outreachRates() {
  const p = state.prospectsStats;
  return { outreach: p ? p.draftAvg : null, replyRate: p ? p.replyRate : null };
}

// نسبة المنشورات المعتمدة المجهزة بتصميم ونسخة X من جميع منشورات الخادم
function readyRate() {
  if (!state.contentMeta) return null;
  return pct(state.contentMeta.approvedPrepared || 0, state.contentMeta.counts["معتمد"] || 0);
}
function contentCount(statuses) {
  return state.contentMeta ? statuses.reduce((n, status) => n + (state.contentMeta.counts[status] || 0), 0) : null;
}

function metricsFromRecent() {
  const taskScores = state.tasks.map(r => salemScore(r[5]));
  const newsScores = state.news.map(r => salemScore(r[6])).filter(isNum);
  const all = taskScores.filter(isNum).concat(newsScores);
  const perAgent = {};
  AGENTS.forEach(a => {
    const rows = state.tasks.filter(r => r[2] === a.name);
    const sc = rows.map(r => salemScore(r[5])).filter(isNum);
    perAgent[a.name] = { a, count: rows.length, scored: sc.length, avg: mean(sc) };
  });
  const today = todayKey();
  const done = state.tasks.filter(r => r[6] === "مكتمل").length;
  return {
    overall: mean(all),
    scoredCount: all.length,
    perAgent,
    done,
    total: state.tasks.length,
    completion: pct(done, state.tasks.length),
    newsQuality: mean(newsScores),
    coverage: pct(taskScores.filter(isNum).length, state.tasks.length),
    highRate: pct(all.filter(s => s >= 85).length, all.length),
    ready: readyRate(),
    ...outreachRates(),
    activeAgents: AGENTS.filter(a => perAgent[a.name].count).length,
    todayTasks: state.tasks.filter(r => dayKey(r[1]) === today).length,
    todayNews: state.news.filter(r => dayKey(r[0]) === today).length,
    trend: state.tasks.slice().reverse().map(r => salemScore(r[5])).filter(isNum),
    alerts: alertItems().length,
    series: null
  };
}

function alertItems() {
  const out = [];
  state.tasks.forEach(r => {
    if (r[2] === "الباحث" && (researchIsPending(state.researchTasks[r[0]]) || researchIsManual(state.researchTasks[r[0]]))) return;
    const s = salemScore(r[5]);
    if (r[6] && r[6] !== "مكتمل") out.push({ kind: "task", row: r, reason: String(r[6]) });
    else if (s !== null && s < 70) out.push({ kind: "task", row: r, reason: "تقدير منخفض" });
  });
  state.news.forEach(r => {
    const s = salemScore(r[6]);
    if (s !== null && s < 70) out.push({ kind: "news", row: r, reason: "تقدير منخفض" });
  });
  return out;
}

function segbar(v, n) {
  n = n || 26;
  const on = v === null ? 0 : Math.max(1, Math.round(v / 100 * n));
  let s = "";
  for (let i = 0; i < n; i++) s += i < on ? '<i class="on"></i>' : "<i></i>";
  return `<div class="seg" aria-hidden="true">${s}</div>`;
}
function valueHtml(v, cls) {
  return v === null ? `<span class="${cls} none">—</span>` : `<span class="${cls}" dir="ltr">${v}<small>%</small></span>`;
}
function scoreBadge(text) {
  const s = salemScore(text);
  return s === null ? "" : `<span class="badge" data-tone="${tone(s)}" title="تقدير من نموذج الذكاء الاصطناعي، وليس قياساً مؤكداً">تقدير سالم ${s}%</span>`;
}
function statusBadge(status) {
  if (!status) return "";
  return `<span class="badge" data-tone="${status === "مكتمل" ? "ok" : String(status).includes("بانتظار") ? "warn" : "none"}">${esc(status)}</span>`;
}
function avatar(name, size) {
  const a = AGENT_BY_NAME[name];
  return `<span class="av ${size || ""}" style="--c:${a ? a.c : "#94a3b8"}" aria-hidden="true">${esc(a ? name.charAt(0) : "؟")}</span>`;
}

const copyMap = new Map();
let copySeq = 0;
function copyable(text) { copyMap.set(++copySeq, String(text ?? "")); return copySeq; }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (err) {}
    ta.remove(); return ok;
  }
}
const copyButton = (text, label) =>
  `<button type="button" class="btn btn-line sm" data-copy="${copyable(text)}">${ICON.copy}<span class="lbl-text">${esc(label)}</span></button>`;

// LinkedIn لا يعرض Markdown: نحذف رموز التنسيق ونحوّل القوائم والروابط إلى نص عادي، والهاشتاقات تبقى كما هي
function linkedinText(text) {
  return String(text ?? "").replace(/\r/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) => label === url ? url : label + ": " + url)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}
// صفحة الشركة في LinkedIn من الإعدادات، وإلا الصفحة الرئيسية حيث يمكن التبديل إلى صفحة الشركة
const linkedinUrl = () => /^https:\/\/([\w-]+\.)?linkedin\.com\//i.test(state.linkedin) ? state.linkedin : "https://www.linkedin.com/feed/";

function toast(text, kind) {
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = text;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), kind === "bad" ? 6000 : 3500);
}

// يعطّل الزر ويعرض عدّاد ثوانٍ، لأن ردود Gemini قد تستغرق دقيقة أو أكثر
function busy(btn, label) {
  const lbl = btn.querySelector(".lbl-text");
  const original = lbl.textContent;
  const t0 = Date.now();
  const tick = () => { lbl.textContent = `${label}… ${Math.round((Date.now() - t0) / 1000)} ث`; };
  btn.disabled = true; tick();
  const iv = setInterval(tick, 1000);
  return () => { clearInterval(iv); btn.disabled = false; lbl.textContent = original; };
}

const empty = (icon, title, text, extra) =>
  `<div class="empty"><div class="empty-ico">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra || ""}</div>`;
const skeleton = () => Array.from({ length: 3 }, () => `<div class="item"><div class="sk w40"></div><div class="sk w80"></div><div class="sk w60"></div></div>`).join("");
function notReady() {
  if (!state.url) return empty(ICON.link, "اربط اللوحة بالخادم", "أضف رابط تطبيق الويب المنشور من Google Apps Script.",
    `<button type="button" class="btn btn-primary" data-open-settings>${ICON.settings}<span>إعدادات الاتصال</span></button>`);
  if (state.loading) return skeleton();
  return empty(ICON.alert, "تعذر تحميل البيانات", state.error,
    `<button type="button" class="btn btn-line" data-refresh>${ICON.refresh}<span>إعادة المحاولة</span></button>`);
}
