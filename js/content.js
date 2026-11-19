"use strict";
// المحتوى والاعتماد

// ---------------- المحتوى والاعتماد ----------------
const CONTENT_FILTERS = [
  { id: "review", label: "للمراجعة", match: s => s === "مسودة" || s === "فكرة" },
  { id: "approved", label: "معتمد", match: s => s === "معتمد" },
  { id: "published", label: "منشور", match: s => s === "منشور" },
  { id: "rejected", label: "مرفوض", match: s => s === "مرفوض" },
  { id: "all", label: "الكل", match: () => true }
];
const STATUS_TONE = { "فكرة": "none", "مسودة": "warn", "معتمد": "ok", "منشور": "none", "مرفوض": "bad" };

function contentItem(row) {
  const [id, , scheduled, pillar, audience, service, idea, text, audit, status, source, note, designCell, tweet] = row;
  const editing = state.editingId === id, asking = state.askingId === id ? state.askingKind : "";
  const version = state.contentVersions[id] || "";
  const btn = (act, label, cls) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-cact="${act}" data-id="${esc(id)}" data-version="${esc(version)}"><span class="lbl-text">${esc(label)}</span></button>`;
  const actions = {
    "فكرة": [btn("write", "اكتب المنشور", "btn-primary")],
    "مسودة": [btn("approve", "اعتماد", "btn-primary"), btn("edit", "تعديل"), btn("rewrite", "إعادة كتابة"), btn("reject", "رفض"),
      designCell ? "" : btn("prepare", "جهّز التصميم ونسخة X")],
    "معتمد": [text ? `<button type="button" class="btn btn-primary sm" data-li-open="${copyable(linkedinText(text))}" data-id="${esc(id)}" data-version="${esc(version)}">${ICON.ext}<span class="lbl-text">انسخ وافتح LinkedIn</span></button>` : "",
      btn("publish", "تم النشر"), btn("edit", "تعديل"), btn("draft", "إرجاع لمسودة"), designCell ? "" : btn("prepare", "جهّز التصميم ونسخة X")],
    "مرفوض": [btn("rewrite", "إعادة كتابة", "btn-primary"), btn("draft", "إرجاع لمسودة")]
  }[status] || [];
  const href = /^https?:\/\//i.test(String(source || "")) ? String(source) : "";
  const day = String(scheduled || "").slice(0, 10);
  const tags = [pillar, audience ? (audience === "وهج" ? "وهج · المنازل" : "انطلق · الشركات والجهات") : "", service]
    .filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join("")
    + (href ? `<a class="tag" href="${esc(href)}" target="_blank" rel="noopener noreferrer">المصدر${ICON.ext}</a>` : source ? `<span class="tag">${esc(source)}</span>` : "");
  let body;
  if (editing) body = `<textarea class="field" id="edit-${esc(id)}" rows="12"${state.contentBusy ? " readonly" : ""} aria-label="نص المنشور">${esc(state.editingDraft)}</textarea><p class="hint">تغيير النص يلغي الاعتماد والتدقيق والتصميم السابق؛ يعود المنشور للمراجعة.</p><div class="row-actions">${btn("save", "حفظ", "btn-primary")}${btn("cancel", "إلغاء")}</div>`;
  else body = text ? `<div class="md">${md(text)}</div>` : `<p class="hint">لم يُكتب المنشور بعد؛ هذه فكرة من خطة الأسبوع.</p>`;
  let footer = "";
  if (asking) {
    footer = `<div class="note-box"><label class="lbl" for="note-${esc(id)}">${asking === "reject" ? "سبب الرفض (اختياري)" : "ملاحظاتك للمى (اختياري)"}</label>
      <textarea class="field" id="note-${esc(id)}" rows="3"${state.contentBusy ? " readonly" : ""}>${esc(state.askingDraft)}</textarea>
      <div class="row-actions">${btn("send-note", asking === "reject" ? "تأكيد الرفض" : "أعد الكتابة", "btn-primary")}${btn("cancel", "إلغاء")}</div></div>`;
  } else if (!editing) {
    footer = `<div class="row-actions">${actions.join("")}${text && status !== "معتمد" ? copyButton(linkedinText(text), "نسخ") : ""}</div>`;
  }
  return `<article class="item">
    <div class="item-head">
      <span class="badge" data-tone="${STATUS_TONE[status] || "none"}">${esc(status)}</span>
      <small class="muted" style="margin-inline-end:auto">${day ? "موعد مقترح " + esc(day) : ""}</small>
      ${scoreBadge(audit)}
    </div>
    <h3 class="news-title">${esc(idea)}</h3>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    ${body}
    ${note ? `<p class="hint">ملاحظات المراجع: ${esc(note)}</p>` : ""}
    ${audit && !editing ? `<details class="fold"><summary>${avatar("سالم", "xs")} تدقيق سالم</summary><div class="fold-body"><div class="md">${md(audit)}</div></div></details>` : ""}
    ${!editing ? designPanel(id, designCell, tweet, status) : ""}
    ${footer}
    ${state.conflictId === id ? `<div class="note-box"><p>تغير المنشور منذ فتحه. احتفظنا بنصك؛ افتح أحدث نسخة قبل المحاولة مجدداً.</p><div class="row-actions">${copyButton(state.editingId === id ? state.editingDraft : state.askingId === id ? state.askingDraft : text, "نسخ نصي")}${btn("conflict-open", "افتح الأحدث مع الاحتفاظ بنصي")}</div></div>` : ""}
  </article>`;
}

// تصميم ريم بالقالب المختار ومقاس المنصة، ونسخة زياد على X بعدّاد حروفها
function designPanel(id, designCell, tweet, status) {
  const d = parseDesign(designCell);
  if (!d) return "";
  const size = state.designSize[id] || "li";
  const sizes = Object.keys(DESIGN_SIZES).map(k =>
    `<button type="button" data-dsize="${k}" data-id="${esc(id)}" aria-pressed="${k === size}">${esc(DESIGN_SIZES[k].label)}</button>`).join("");
  const len = xLength(tweet);
  return `<details class="fold"${status === "معتمد" ? " open" : ""}><summary>${avatar("ريم", "xs")}${avatar("زياد", "xs")} التصميم ونسخة X · ${esc(d.brand)}</summary>
    <div class="fold-body">
      <div class="seg-ctl design-sizes" role="group" aria-label="مقاس التصميم">${sizes}</div>
      <canvas class="design-canvas" data-design="${esc(id)}" data-size="${size}" role="img" aria-label="${esc(d.headline)}"></canvas>
      <div class="row-actions">
        <button type="button" class="btn btn-line sm" data-ddownload="${esc(id)}">${ICON.download}<span class="lbl-text">تنزيل الصورة</span></button>
        <button type="button" class="btn btn-line sm" data-cact="prepare" data-id="${esc(id)}" data-version="${esc(state.contentVersions[id] || "")}"><span class="lbl-text">أعد التصميم ونسخة X</span></button>
      </div>
      ${tweet ? `<div class="tweet">
        <div class="by">${avatar("زياد", "xs")} نسخة X <small class="tweet-len" data-tone="${len > 280 ? "bad" : "ok"}">${len}/280</small></div>
        <p>${esc(tweet)}</p>
        <div class="row-actions">
          ${status === "معتمد" ? `<button type="button" class="btn btn-primary sm" data-x-open="${copyable(tweet)}" data-id="${esc(id)}" data-version="${esc(state.contentVersions[id] || "")}">${ICON.ext}<span class="lbl-text">افتح X بالتغريدة</span></button>` : `<span class="hint">فتح X متاح بعد اعتماد المنشور.</span>`}
          ${copyButton(tweet, "نسخ")}
        </div>
      </div>` : ""}
    </div>
  </details>`;
}
function parseDesign(cell) {
  if (!cell) return null;
  try { const d = JSON.parse(cell); return d && d.headline ? d : null; } catch (e) { return null; }
}
// طول التغريدة كما يحسبه X تقريباً (نفس xLength_ في الخادم)
function xLength(text) {
  return Array.from(String(text || "").replace(/https?:\/\/\S+/g, "x".repeat(23))).reduce((n, ch) => n + (ch.codePointAt(0) > 0xFFFF ? 2 : 1), 0);
}
