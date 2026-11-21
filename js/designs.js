"use strict";
// رسم التصاميم بهوية كل علامة وإجراءات المحتوى

// ---------------- رسم التصاميم بهوية كل علامة ----------------
// الألوان والخطوط من مواقع العلامات: انطلق (كحلي وفيروزي، Alexandria)، وهج (كحلي وذهبي، Tajawal)، أثر (فيروزي غامق على فاتح)
const BRANDS = {
  "انطلق": { bg: ["#030b18", "#061329"], ink: "#f4f5f2", muted: "#adc0d1", accent: "#19d3c5", accentInk: "#030b18", font: "Alexandria",
    mark: "انطلق للطاقة", markEn: "ENTALIQ ENERGY", url: "entaliq.com.sa", motif: "grid", slug: "entaliq" },
  "وهج": { bg: ["#0b2742", "#081a2a"], ink: "#fffdf8", muted: "#d0d7df", accent: "#f5b233", accentInk: "#12263a", font: "Tajawal",
    mark: "وهج", markEn: "WAHAJ", url: "wahaj-solar.netlify.app", motif: "sun", tagline: "طاقة أنظف. حياة أكثر إشراقًا.", slug: "wahaj" },
  "أثر": { bg: ["#eef7f5", "#dfeeea"], ink: "#10383d", muted: "#375e60", accent: "#087970", accentInk: "#ffffff", font: "Alexandria",
    mark: "أثر", markEn: "ATHAR · ENTALIQ ENERGY", url: "entaliq.com.sa", motif: "curve", slug: "athar" }
};
const DESIGN_SIZES = {
  li: { label: "LinkedIn أفقي", w: 1200, h: 627 },
  lip: { label: "LinkedIn عمودي", w: 1080, h: 1350 },
  x: { label: "X", w: 1600, h: 900 }
};

function wrapLines(ctx, text, maxW) {
  const lines = [];
  let line = "";
  String(text || "").split(/\s+/).filter(Boolean).forEach(word => {
    const next = line ? line + " " + word : word;
    if (!line || ctx.measureText(next).width <= maxW) line = next;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
}
// أكبر خط يتسع فيه النص ضمن عدد الأسطر، وإلا يُقص آخر سطر بنقاط
function fitText(ctx, text, weight, family, size, minSize, maxW, maxLines) {
  for (let s = size; s >= minSize; s *= 0.92) {
    ctx.font = `${weight} ${s}px ${family}`;
    const lines = wrapLines(ctx, text, maxW);
    if (lines.length <= maxLines) return { lines, size: s };
  }
  ctx.font = `${weight} ${minSize}px ${family}`;
  const lines = wrapLines(ctx, text, maxW);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += "…"; }
  return { lines, size: minSize };
}

function drawMotif(ctx, b, W, H, u) {
  ctx.save();
  if (b.motif === "grid") {
    // خطوط معمارية دقيقة وتوهج فيروزي خفيف كما في موقع انطلق
    const glow = ctx.createRadialGradient(W * 0.1, H * 0.95, 0, W * 0.1, H * 0.95, 60 * u);
    glow.addColorStop(0, "rgba(25,211,197,.22)"); glow.addColorStop(1, "rgba(25,211,197,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(25,211,197,.09)"; ctx.lineWidth = Math.max(1, u * 0.12);
    for (let x = 0; x <= W; x += 9 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 9 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(25,211,197,.35)"; ctx.lineWidth = Math.max(1.5, u * 0.25);
    [[0.05, 0.62], [0.2, 0.62], [0.35, 0.62]].forEach(([fx]) => { ctx.beginPath(); ctx.moveTo(W * fx, H); ctx.lineTo(W * (fx + 0.12), H * 0.62); ctx.stroke(); });
  } else if (b.motif === "sun") {
    // شمس وهج في الزاوية بتدرج ذهبي إلى كهرماني
    const cx = 0, cy = 0, r = 30 * u;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.4);
    glow.addColorStop(0, "rgba(245,178,51,.35)"); glow.addColorStop(1, "rgba(245,178,51,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    core.addColorStop(0, "#ffd978"); core.addColorStop(1, "#e98b2a");
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(245,178,51,.28)"; ctx.lineWidth = Math.max(1.5, u * 0.3);
    [1.45, 1.9].forEach(k => { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke(); });
  } else if (b.motif === "curve") {
    // منحنى استهلاك تحت خط أساس متقطع: فكرة أثر في قياس الوفر، رسم زخرفي بلا أرقام
    const top = H * 0.69, bottom = H * 0.81, x0 = W * 0.04, x1 = W * 0.96;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([2 * u, 1.4 * u]); ctx.strokeStyle = "#375e60"; ctx.lineWidth = Math.max(1.5, u * 0.3);
    ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.stroke(); ctx.setLineDash([]);
    const pts = [0, 0.02, 0.05, 0.04, 0.09, 0.12, 0.11, 0.15, 0.17, 0.16].map((v, i, a) => [x0 + (x1 - x0) * i / (a.length - 1), top + (bottom - top) * v * 5]);
    ctx.fillStyle = "rgba(8,121,112,.12)";
    ctx.beginPath(); ctx.moveTo(x0, top); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(x1, top); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#087970"; ctx.lineWidth = Math.max(2, u * 0.45);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  }
  ctx.restore();
}

async function drawDesign(canvas, d, sizeKey) {
  const b = BRANDS[d.brand] || BRANDS["انطلق"];
  const { w: W, h: H } = DESIGN_SIZES[sizeKey] || DESIGN_SIZES.li;
  await Promise.all([`800 40px ${b.font}`, `500 40px ${b.font}`, "700 20px Manrope"].map(f => document.fonts.load(f).catch(() => null)));
  canvas.width = W; canvas.height = H;
  canvas.dataset.size = sizeKey;
  const ctx = canvas.getContext("2d");
  const u = Math.min(W, H) / 100, pad = 7 * u, portrait = H > W;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, b.bg[0]); bg.addColorStop(1, b.bg[1]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  drawMotif(ctx, b, W, H, u);

  const right = W - pad;
  const textW = portrait ? W - 2 * pad : W * 0.68;
  const say = (text, x, y, font, color, align, dir) => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "right"; ctx.direction = dir || "rtl"; ctx.fillText(text, x, y);
  };
  // العلامة في الأعلى يميناً واسمها اللاتيني تحتها
  say(b.mark, right, pad + 5 * u, `800 ${5.4 * u}px ${b.font}`, b.motif === "sun" ? b.accent : b.ink);
  ctx.letterSpacing = `${0.35 * u}px`;
  say(b.markEn, right, pad + 8.6 * u, `700 ${1.9 * u}px Manrope`, b.muted, "right", "ltr");
  ctx.letterSpacing = "0px";
  if (b.tagline) say(b.tagline, right, pad + 12 * u, `500 ${2.3 * u}px ${b.font}`, b.muted);

  // جسم التصميم حسب القالب، محاذى عمودياً في منتصف المساحة بين الرأس والتذييل
  const top = pad + (b.tagline ? 17 : 14) * u, bottom = H - pad - (b.motif === "curve" ? 24 : 12) * u;
  const blocks = [];
  // marker: رقم النقطة بلون التمييز يسبق نصها، ويُحجز له عرض ثابت
  const add = (text, weight, size, min, color, lines, gap, marker) => {
    if (!text) return;
    const indent = marker ? size * u * 1.6 : 0;
    const fit = fitText(ctx, text, weight, b.font, size * u, min * u, textW - indent, lines);
    blocks.push({ ...fit, weight, color, gap: gap * u, family: b.font, marker, indent });
  };
  const big = portrait ? 1.25 : 1;
  if (d.template === "رقم") {
    add(d.headline, 800, 5.2 * big, 3.6, b.ink, 2, 3);
    add(d.figure, 800, 17 * big, 9, b.accent, 1, 1.2);
    add(d.figureLabel, 500, 3.6 * big, 2.8, b.muted, 2, 0);
  } else if (d.template === "نقاط") {
    add(d.headline, 800, 6 * big, 3.8, b.ink, 2, 3.4);
    (d.points || []).forEach((p, i) => add(p, 500, 3.6 * big, 2.6, b.ink, 2, 1.8, String(i + 1)));
  } else {
    add(d.headline, 800, 8.5 * big, 4.5, b.ink, 3, 3);
    add(d.subline, 500, 3.8 * big, 2.8, b.muted, 3, 0);
  }
  const lh = 1.38;
  const total = blocks.reduce((s, k) => s + k.lines.length * k.size * lh + k.gap, 0);
  let y = top + Math.max(0, (bottom - top - total) / 2);
  ctx.fillStyle = b.accent;
  ctx.fillRect(right - 10 * u, y - 2.2 * u, 10 * u, 0.9 * u);
  blocks.forEach(k => {
    k.lines.forEach((line, i) => {
      y += k.size * lh;
      if (k.marker && i === 0) say(k.marker, right, y - k.size * 0.32, `800 ${k.size * 1.15}px ${k.family}`, b.accent);
      say(line, right - k.indent, y - k.size * 0.32, `${k.weight} ${k.size}px ${k.family}`, k.color);
    });
    y += k.gap;
  });

  // التذييل: الدعوة في زر بلون التمييز يميناً والرابط يساراً
  const fy = H - pad;
  if (d.cta) {
    ctx.font = `800 ${2.8 * u}px ${b.font}`; ctx.direction = "rtl";
    const cw = ctx.measureText(d.cta).width + 5 * u, ch = 6 * u;
    ctx.fillStyle = b.accent;
    ctx.beginPath(); ctx.roundRect(right - cw, fy - ch, cw, ch, ch / 2); ctx.fill();
    say(d.cta, right - 2.5 * u, fy - ch / 2 + 1 * u, `800 ${2.8 * u}px ${b.font}`, b.accentInk);
  }
  say(b.url, pad, fy - 2 * u, `700 ${2.3 * u}px Manrope`, b.muted, "left", "ltr");
}

function drawDesigns(root) {
  root.querySelectorAll("canvas[data-design]").forEach(canvas => {
    const row = state.content.find(r => r[0] === canvas.dataset.design);
    const d = row && parseDesign(row[12]);
    if (d) drawDesign(canvas, d, canvas.dataset.size).catch(() => {});
  });
}
function downloadDesign(id) {
  const canvas = document.querySelector(`canvas[data-design="${CSS.escape(id)}"]`);
  const row = state.content.find(r => r[0] === id);
  const d = row && parseDesign(row[12]);
  if (!canvas || !d) return;
  canvas.toBlob(blob => {
    if (!blob) { toast("تعذر تجهيز الصورة", "bad"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(BRANDS[d.brand] || BRANDS["انطلق"]).slug}-${id}-${canvas.dataset.size}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
}
function filterContentCount(filter) {
  if (!state.contentMeta) return null;
  return Object.keys(state.contentMeta.counts).filter(status => filter.match(status)).reduce((n, status) => n + state.contentMeta.counts[status], 0);
}
function contentFeedback(text, kind, target) {
  const el = $("#" + (target || "contentFeedback"));
  el.hidden = !text; el.textContent = text || ""; el.dataset.tone = kind || "none";
  el.style.color = kind === "bad" ? "var(--red)" : kind === "warn" ? "var(--amber)" : "var(--text-2)";
}
function jobFeedback(data, fallback, target) {
  const warnings = (data.warnings || []).map(String);
  const partial = !!(data.failed || data.pending || warnings.length);
  const message = data.message || fallback;
  contentFeedback([message, ...warnings.map(w => "• " + w)].join("\n"), partial ? "warn" : "ok", target);
  toast(message, partial ? "warn" : "ok");
}
function renderRecovery() {
  const el = $("#contentRecovery"), saved = state.recoveryDraft;
  el.hidden = !saved;
  el.innerHTML = saved ? '<details open><summary>نصك المحفوظ قبل فتح النسخة الأحدث</summary><p class="hint">انسخه أو قارنه بالنسخة الحالية؛ لن يُرسل تلقائياً.</p><textarea class="field" rows="6" readonly aria-label="نص محفوظ">' + esc(saved.text) + '</textarea><div class="row-actions">' + copyButton(saved.text, "نسخ النص المحفوظ") + '</div></details>' : "";
}
function renderContentView() {
  $("#contentFilter").innerHTML = CONTENT_FILTERS.map(f => {
    const n = filterContentCount(f);
    return '<button type="button" data-cfilter="' + f.id + '" aria-pressed="' + (f.id === state.contentFilter) + '">' + esc(f.label) + (n === null ? "" : " " + n) + '</button>';
  }).join("");
  const el = $("#contentList"), older = $("#btnContentOlder"), pageInfo = $("#contentPageInfo");
  older.hidden = !state.loaded || !state.contentMeta || state.contentMeta.nextCursor === null;
  older.disabled = state.contentPageLoading || state.loading || state.contentBusy;
  older.querySelector(".lbl-text").textContent = state.contentPageLoading ? "جاري تحميل الأقدم…" : "تحميل منشورات أقدم";
  pageInfo.textContent = state.contentMeta ? "المحمّل " + state.content.length + " من " + state.contentMeta.total + " منشوراً؛ أعداد الحالات تشمل كل المنشورات." : "";
  renderRecovery();
  if (!state.loaded) { el.innerHTML = notReady(); return; }
  const f = CONTENT_FILTERS.find(x => x.id === state.contentFilter) || CONTENT_FILTERS[0];
  const rows = state.content.filter(r => f.match(r[9]));
  if (f.id === "review") rows.sort((a, b) => String(a[2] || "0").localeCompare(String(b[2] || "0")));
  const total = filterContentCount(f), more = !!(state.contentMeta && state.contentMeta.nextCursor !== null);
  el.innerHTML = rows.length ? rows.map(contentItem).join("")
    : empty(ICON.clip, more && total ? "توجد منشورات أقدم بهذه الحالة" : "لا توجد منشورات بهذه الحالة", more && total ? "اضغط تحميل منشورات أقدم للوصول إليها." : f.id === "review" ? "يمكنك طلب خطة الأسبوع أو نصائح موسمية." : "");
  drawDesigns(el);
}

async function contentAction(btn) {
  const id = btn.dataset.id, act = btn.dataset.cact;
  const row = state.content.find(r => r[0] === id);
  if (!row) return;
  if (state.contentBusy || state.contentPageLoading) { toast("انتظر حتى تكتمل العملية الحالية", "warn"); return; }
  if ((state.editingId && (state.editingId !== id || !["save", "cancel", "conflict-open"].includes(act))) || (state.askingId && (state.askingId !== id || !["send-note", "cancel", "conflict-open"].includes(act)))) { toast("احفظ النص المفتوح أو ألغِ تحريره قبل تنفيذ إجراء آخر.", "warn"); return; }
  if (act === "cancel") { Object.assign(state, { editingId: null, askingId: null, conflictId: null }); renderContentView(); return; }
  if (act === "conflict-open") {
    const saved = state.editingId === id ? state.editingDraft : state.askingId === id ? state.askingDraft : "";
    if (saved) { state.recoveryDraft = { id, text: saved }; renderRecovery(); }
    if (!await refresh({ quiet: true })) { contentFeedback(state.error || "تعذر تحميل النسخة الأحدث؛ نصك محفوظ.", "bad"); return; }
    const latest = state.content.find(r => r[0] === id);
    if (!latest) { contentFeedback("لم يعد المنشور ضمن البيانات المحملة؛ نصك محفوظ أعلاه.", "warn"); return; }
    Object.assign(state, { editingId: id, editingDraft: String(latest[7] || ""), editingVersion: state.contentVersions[id] || "", askingId: null, conflictId: null });
    contentFeedback("فُتحت أحدث نسخة للتحرير. نصك السابق محفوظ أعلاه للمقارنة والنسخ.", "warn");
    renderContentView(); return;
  }
  if (["edit", "reject", "rewrite"].includes(act)) {
    if ((state.editingId && state.editingId !== id) || (state.askingId && state.askingId !== id)) { toast("احفظ النص المفتوح أو ألغِ تحريره قبل فتح منشور آخر.", "warn"); return; }
    if (act === "edit") {
      Object.assign(state, { editingId: id, editingDraft: String(row[7] || ""), editingVersion: btn.dataset.version || "", askingId: null, conflictId: null });
      renderContentView(); const t = document.getElementById("edit-" + id); if (t) t.focus(); return;
    }
    Object.assign(state, { askingId: id, askingKind: act, askingDraft: "", askingVersion: btn.dataset.version || "", editingId: null, conflictId: null });
    renderContentView(); const n = document.getElementById("note-" + id); if (n) n.focus(); return;
  }
  const editField = document.getElementById("edit-" + id), noteField = document.getElementById("note-" + id);
  if (state.editingId === id && editField) state.editingDraft = editField.value;
  if (state.askingId === id && noteField) state.askingDraft = noteField.value;
  const note = state.askingId === id ? state.askingDraft : "";
  const rejecting = act === "send-note" && state.askingKind === "reject";
  const request = {
    approve: [{ action: "content_update", id, status: "معتمد" }, "اعتُمد المنشور"],
    publish: [{ action: "content_update", id, status: "منشور" }, "سُجّل كمنشور"],
    draft: [{ action: "content_update", id, status: "مسودة" }, "أُعيد إلى المسودات"],
    save: [{ action: "content_update", id, text: state.editingDraft }, "حُفظ النص"],
    write: [{ action: "content_rewrite", id }, "كُتب المنشور وينتظر مراجعتك"],
    prepare: [{ action: "content_prepare", id }, "جهّزت ريم التصميم وزياد نسخة X"],
    "send-note": rejecting ? [{ action: "content_update", id, status: "مرفوض", note }, "رُفض المنشور"]
      : [{ action: "content_rewrite", id, note }, "أُعيدت الكتابة وتنتظر مراجعتك"]
  }[act];
  if (!request) return;
  request[0].version = act === "save" ? state.editingVersion : act === "send-note" ? state.askingVersion : btn.dataset.version || "";
  if (!request[0].version) { state.conflictId = id; contentFeedback("نسخة المنشور غير متوفرة؛ افتح أحدث نسخة قبل الحفظ.", "warn"); renderContentView(); return; }
  const writing = request[0].action === "content_rewrite", preparing = act === "prepare";
  const epoch = state.connectionEpoch, url = state.url, token = state.token;
  state.contentBusy = true;
  const stop = busy(btn, writing ? "لمى تكتب" : preparing ? "ريم وزياد يجهّزان" : "جاري الحفظ");
  if (editField) editField.readOnly = true;
  if (noteField) noteField.readOnly = true;
  try {
    const data = await api(request[0]);
    if (!sameConnection(epoch, url, token)) return;
    if (data.item) { const at = state.content.findIndex(r => r[0] === id); if (at >= 0) state.content[at] = data.item; }
    if (data.version) state.contentVersions[id] = data.version;
    Object.assign(state, { editingId: null, askingId: null, conflictId: null });
    const savedMessage = request[1] + (act === "save" && data.item ? "؛ الحالة: " + data.item[9] : "");
    jobFeedback(data, savedMessage);
    // عقل المكتب: ملاحظتك على المنشور تصير درساً معتمداً للمى (brain.js)
    if (act === "send-note" && note.trim()) brainCaptureNote(id, note, rejecting);
    if (!await refresh({ quiet: true })) jobFeedback({ ...data, warnings: [...(data.warnings || []), "تعذر تحديث بقية البيانات: " + state.error] }, savedMessage);
  } catch (e) {
    if (!sameConnection(epoch, url, token)) return;
    if (e.code === "CONFLICT") state.conflictId = id;
    contentFeedback(e.message + (e.code === "CONFLICT" ? "\nنصك محفوظ؛ افتح النسخة الأحدث من خيارات المنشور." : ""), e.code === "CONFLICT" ? "warn" : "bad");
    toast(e.message, e.code === "CONFLICT" ? "warn" : "bad");
  } finally {
    state.contentBusy = false; stop();
    if (sameConnection(epoch, url, token)) renderContentView();
  }
}

async function contentJob(btn, kind) {
  if (!state.url) { openSettings(); return; }
  if (state.contentBusy || state.contentPageLoading) { toast("انتظر حتى تكتمل العملية الحالية", "warn"); return; }
  state.contentBusy = true;
  const epoch = state.connectionEpoch, url = state.url, token = state.token;
  const stop = busy(btn, kind === "plan" ? "راكان يخطط" : kind === "sites" ? "الفريق يقرأ المواقع" : "لمى تكتب");
  contentFeedback(kind === "plan" ? "يضع راكان خطة لأيام العمل المتبقية (حتى 5 منشورات)، ثم تكتبها لمى ويدققها سالم؛ قد يستغرق ذلك دقيقتين إلى أربع."
    : kind === "sites" ? "يقرأ الفريق صفحات موقعي انطلق ووهج، ويقترح راكان أفكاراً منها، ثم تكتب لمى أول منشورين ويدققهما سالم مقابل الصفحة، وتصممهما ريم ويكتب زياد نسخة X؛ دقيقتان إلى أربع."
    : "تكتب لمى نصيحتين موسميتين ويدققهما سالم؛ قرابة دقيقة.", "none");
  try {
    const data = await api({ action: kind === "plan" ? "weekly_plan" : kind === "sites" ? "sites_run" : "seasonal_tips", mode: "full" });
    if (!sameConnection(epoch, url, token)) return;
    jobFeedback(data, "اكتملت العملية");
    state.contentFilter = "review";
    if (!await refresh({ quiet: true })) jobFeedback({ ...data, warnings: [...(data.warnings || []), "تعذر تحديث البيانات: " + state.error] }, "اكتملت العملية");
  } catch (e) {
    if (sameConnection(epoch, url, token)) { contentFeedback(e.message, "bad"); toast(e.message, "bad"); }
  } finally {
    state.contentBusy = false; stop();
    if (sameConnection(epoch, url, token)) renderContentView();
  }
}

function renderView() {
  ({ tasks: renderTasksView, news: renderNewsView, team: renderTeamView, alerts: renderAlertsView, compose: renderCompose, content: renderContentView, office: renderOfficeView, exec: renderExecView, prospects: renderProspectsView, tenders: renderTendersView, contracts: renderContractsView, voice: renderVoiceView }[state.view] || (() => {}))();
}

const sheet = $("#sheet");
function openView(view, opts) {
  opts = opts || {};
  if (!VIEWS[view]) return;
  state.view = view;
  if (opts.agent !== undefined) { state.filterAgent = opts.agent; $("#taskFilter").value = opts.agent; }
  if (opts.sort !== undefined) { state.sort = opts.sort; $("#taskSort").value = opts.sort; }
  if (opts.cfilter) state.contentFilter = opts.cfilter;
  $("#sheetTitle").textContent = VIEWS[view].title;
  $("#sheetSub").textContent = VIEWS[view].sub;
  document.querySelectorAll("[data-view]").forEach(v => { v.hidden = v.dataset.view !== view; });
  renderView();
  if (!sheet.open) sheet.showModal();
  $(".sh-body").scrollTop = 0;
  if (view === "compose") $("#taskInput").focus();
  if (view === "office") loadOffice(!!state.office);
  if (view === "exec") loadExec();
  if (view === "prospects") loadProspects();
  if (view === "tenders") loadTenders();
  if (view === "contracts") loadContracts();
}
