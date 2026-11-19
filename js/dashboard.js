"use strict";
// العدّاد والبطاقات والبلاطات والفترة وتطور الأداء والشريط

// ---------------- العدّاد ----------------
const TICKS = 54;
function buildGauge() {
  const f = n => n.toFixed(2);
  // 0 في أسفل اليسار، 50 في الأعلى، 100 في أسفل اليمين (قوس 270°)
  const P = (r, v) => { const a = (-135 + 2.7 * v) * Math.PI / 180; return [200 + r * Math.sin(a), 200 - r * Math.cos(a)]; };
  const hue = v => v < 35 ? 2 + v * .9 : v < 65 ? 33.5 + (v - 35) * .5 : 48.5 + (v - 65) * 2.6;
  let arc = "", ticks = "", labels = "";
  for (let i = 0; i < 100; i++) {
    const [x1, y1] = P(182, i), [x2, y2] = P(182, i + 1.05);
    arc += `<path d="M${f(x1)} ${f(y1)}A182 182 0 0 1 ${f(x2)} ${f(y2)}" stroke="hsl(${f(hue(i))} 82% 56%)"/>`;
  }
  for (let i = 0; i < TICKS; i++) {
    const v = (i + .5) * 100 / TICKS;
    const [x1, y1] = P(122, v), [x2, y2] = P(163, v);
    ticks += `<line class="tk" style="--i:${i}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  }
  for (let v = 0; v <= 100; v += 10) {
    const [x, y] = P(212, v);
    labels += `<text x="${f(x)}" y="${f(y)}">${v}</text>`;
  }
  $("#gaugeSvg").innerHTML = `
    <defs><radialGradient id="gdisc"><stop offset="0" stop-color="#0c0f12"/><stop offset=".78" stop-color="#090b0d"/><stop offset="1" stop-color="#15191d"/></radialGradient></defs>
    <circle cx="200" cy="200" r="172" fill="url(#gdisc)" stroke="#1c2025"/>
    <g fill="none" stroke-width="3.5">${arc}</g>
    <g>${ticks}</g>
    <circle cx="200" cy="200" r="110" fill="none" stroke="#2c3238" stroke-width="1.2" stroke-dasharray="1.5 5"/>
    <g class="g-labels">${labels}</g>`;
}
let gaugeShown = null, gaugeAnim = 0;
function renderGauge(m) {
  const v = m.overall;
  const val = $("#gaugeVal");
  const on = v === null ? 0 : Math.round(v / 100 * TICKS);
  document.querySelectorAll("#gaugeSvg .tk").forEach((t, i) => t.classList.toggle("on", i < on));
  $("#gauge").setAttribute("aria-label", v === null ? "المؤشر العام: لا توجد بيانات" : `المؤشر العام ${v}%`);
  $("#gaugeSub").textContent = !state.url ? "غير متصل بالخادم" : !state.loaded ? (state.loading ? "جاري التحميل…" : "تعذر التحميل")
    : (m.scoredCount ? `متوسط ${m.scoredCount} تقديراً من سالم` : "لا توجد تقديرات") + (state.stats ? " · " + rangeNote() : "");
  $("#gConnect").hidden = !!state.url;
  cancelAnimationFrame(gaugeAnim);
  if (v === null) { val.textContent = "—"; val.classList.add("none"); gaugeShown = null; return; }
  val.classList.remove("none");
  const from = gaugeShown ?? 0, t0 = performance.now(), dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800;
  const step = now => {
    const p = dur ? Math.min(1, (now - t0) / dur) : 1;
    val.textContent = Math.round(from + (v - from) * (1 - Math.pow(1 - p, 3))) + "%";
    if (p < 1) gaugeAnim = requestAnimationFrame(step);
  };
  gaugeAnim = requestAnimationFrame(step);
  gaugeShown = v;
}

// ---------------- البطاقات ----------------
function metricCard(slot, m) {
  let title, value, sub, hint, open;
  if (slot.agent) {
    const p = m.perAgent[slot.agent];
    title = slot.agent; value = p.avg;
    sub = `${p.a.role} · ${tasksWord(p.count)}`;
    hint = `${slot.agent}: متوسط تقدير سالم لـ ${p.scored} من ${p.count} مهام — ${state.stats ? rangeNote() : "أحدث المهام"}`;
    open = `data-open="tasks" data-filter-agent="${esc(slot.agent)}" data-sort="new"`;
  } else {
    const s = SYS[slot.sys];
    title = s.title; value = m[slot.sys]; sub = s.sub; hint = s.sub;
    open = `data-open="${s.view}"` + (s.sort ? ` data-filter-agent="" data-sort="${s.sort}"` : "") + (s.cfilter ? ` data-cfilter-open="${s.cfilter}"` : "");
  }
  const t = tone(value);
  return `<button type="button" class="metric pos-${slot.pos}" data-tone="${t}" title="${esc(hint)}" ${open}>
    <div class="m-row">
      <div class="m-head">
        <div class="m-line"><span class="m-name">${esc(title)}</span><span class="m-status"><i></i>${TONE_LABEL[t]}</span></div>
        <span class="m-role">${esc(sub)}</span>
      </div>
      ${valueHtml(value, "m-val")}
    </div>
    ${segbar(value)}
  </button>`;
}
function renderStage(m) {
  const stage = $("#stage");
  stage.querySelectorAll(".metric").forEach(e => e.remove());
  stage.insertAdjacentHTML("beforeend", SLOTS.map(s => metricCard(s, m)).join(""));
}

// ---------------- البلاطات العلوية ----------------
function setNum(id, text, t) { $(id).dataset.tone = t; $(id).innerHTML = `<i></i><b>${esc(text)}</b>`; }
function sparkline(values) {
  if (values.length < 2) return '<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M6 18H58" stroke="#4a5058" stroke-width="2" stroke-dasharray="3 4"/></svg>';
  let lo = Math.min(...values) - 5, hi = Math.max(...values) + 5;
  if (hi - lo < 20) { const mid = (hi + lo) / 2; lo = mid - 10; hi = mid + 10; }
  const pts = values.map((v, i) => `${(4 + i * 56 / (values.length - 1)).toFixed(1)} ${(32 - (v - lo) / (hi - lo) * 28).toFixed(1)}`);
  return `<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M${pts.join(" L")}" fill="none" stroke="#eceff2" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function miniBars(m) {
  const bw = 6, gap = (64 - AGENTS.length * bw) / (AGENTS.length + 1);
  return '<svg viewBox="0 0 64 36" aria-hidden="true">' + AGENTS.map((a, i) => {
    const v = m.perAgent[a.name].avg;
    const h = v === null ? 3 : Math.max(3, v / 100 * 32);
    return `<rect x="${(gap + i * (bw + gap)).toFixed(1)}" y="${(34 - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" fill="${TONE_COLOR[tone(v)]}"/>`;
  }).join("") + "</svg>";
}
function renderTiles(m) {
  const ready = state.loaded;
  $("#tvTrend").innerHTML = sparkline(m.trend);
  $("#tvCompare").innerHTML = miniBars(m);
  setNum("#tnActive", ready ? `${m.activeAgents}/${AGENTS.length}` : "—", !ready || !m.activeAgents ? "none" : m.activeAgents >= 5 ? "ok" : "warn");
  setNum("#tnToday", ready ? (m.todayTasks ? "+" + m.todayTasks : "0") : "—", ready && m.todayTasks ? "ok" : "none");
  setNum("#tnDone", ready ? `${m.done}/${m.total}` : "—", !ready || !m.total ? "none" : m.done === m.total ? "ok" : "warn");
  setNum("#tnNewsToday", ready ? String(m.todayNews) : "—", ready && m.todayNews ? "ok" : "none");
  setNum("#tnAlerts", ready ? String(m.alerts) : "—", ready && m.alerts ? "bad" : ready ? "ok" : "none");
  const review = contentCount(["مسودة", "فكرة"]);
  setNum("#tnReview", ready && review !== null ? String(review) : "—", ready && review ? "warn" : ready ? "ok" : "none");
  const badge = $("#fabBadge");
  badge.hidden = !(ready && m.alerts);
  badge.textContent = m.alerts;
  badge.title = m.alerts + " تنبيه";
}

// ---------------- فلتر الفترة ----------------
const dm = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";
function renderFilters() {
  $("#rangeCtl").innerHTML = RANGES.map(r =>
    `<button type="button" data-range="${r.id}" aria-pressed="${r.id === state.range}">${esc(r.label)}</button>`).join("");
  const s = state.stats;
  $("#rangeNote").textContent = !s || s.range !== state.range ? ""
    : s.from ? (s.from === s.to ? dm(s.to) : `${dm(s.from)} – ${dm(s.to)}`) : "";
}
async function setRange(id) {
  if (id === state.range || !RANGES.some(r => r.id === id)) return;
  const previous = state.stats ? state.stats.range : state.range;
  state.range = id;
  store.set(KEYS.range, id);
  renderFilters();
  if (!state.url) return;
  document.querySelectorAll(".scoped").forEach(e => e.classList.add("refetching"));
  const expected = state.refreshSeq + 1;
  const ok = await refresh();
  if (!ok && state.refreshSeq === expected && state.range === id && !state.loading) {
    state.range = state.stats ? state.stats.range : previous;
    store.set(KEYS.range, state.range);
    renderBoard();
  }
  if (!state.loading) document.querySelectorAll(".scoped").forEach(e => e.classList.remove("refetching"));
}

// ---------------- تطور الأداء ----------------
// لوحتان بمحور زمني واحد: متوسط تقدير سالم (0–100) وعدد المخرجات؛ لا محور ثانٍ على نفس الرسم
let trendTableOn = false, trendGeom = null;
const fx = n => n.toFixed(1);
const niceMax = v => { if (v <= 5) return Math.max(1, v); const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p) * p; };
function barPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${fx(x)} ${fx(y + h)}V${fx(y + r)}Q${fx(x)} ${fx(y)} ${fx(x + r)} ${fx(y)}H${fx(x + w - r)}Q${fx(x + w)} ${fx(y)} ${fx(x + w)} ${fx(y + r)}V${fx(y + h)}Z`;
}
function trendSvg(pts, W) {
  const n = pts.length, ml = 34, mr = 8, iw = Math.max(60, W - ml - mr), band = iw / n;
  const cx = i => ml + (i + .5) * band;
  // مسافة كافية فوق اللوحة حتى لا تتداخل قيمة قريبة من 100 مع العنوان
  const t1 = 46, h1 = 150, y1 = v => t1 + h1 * (1 - v / 100);
  const top = niceMax(Math.max(...pts.map(p => p.tasks + p.news)));
  const t2 = t1 + h1 + 46, h2 = 74, y2 = v => t2 + h2 * (1 - v / top);
  const H = t2 + h2 + 26;
  trendGeom = { ml, band, t1, bottom: t2 + h2, n };

  let g = `<text class="ptitle" x="${fx(W - mr)}" y="${t1 - 30}" text-anchor="end">متوسط تقدير سالم</text>`;
  [0, 50, 100].forEach(v => { g += `<line class="grid" x1="${ml}" x2="${fx(W - mr)}" y1="${fx(y1(v))}" y2="${fx(y1(v))}"/><text class="tick" x="${ml - 6}" y="${fx(y1(v) + 4)}" text-anchor="end">${v}</text>`; });
  // حدود التقييم المستخدمة في البطاقات: 85 جيد، 70 متوسط
  [70, 85].forEach(v => { g += `<line class="ref" x1="${ml}" x2="${fx(W - mr)}" y1="${fx(y1(v))}" y2="${fx(y1(v))}"/><text class="tick" x="${ml - 6}" y="${fx(y1(v) + 4)}" text-anchor="end">${v}</text>`; });

  let d = "", pen = false, last = -1;
  pts.forEach((p, i) => {
    if (p.avg === null) { pen = false; return; }
    d += (pen ? "L" : "M") + fx(cx(i)) + " " + fx(y1(p.avg));
    pen = true; last = i;
  });
  g += `<path class="line" d="${d}"/>`;
  const r = n <= 40 ? 4 : 3;
  pts.forEach((p, i) => { if (p.avg !== null) g += `<circle class="dot" cx="${fx(cx(i))}" cy="${fx(y1(p.avg))}" r="${r}"/>`; });
  if (last >= 0) {
    const lx = cx(last), anchor = lx > W - mr - 24 ? "end" : lx < ml + 24 ? "start" : "middle";
    g += `<text class="vlabel" x="${fx(lx)}" y="${fx(y1(pts[last].avg) - 10)}" text-anchor="${anchor}">${pts[last].avg}%</text>`;
  }

  g += `<text class="ptitle" x="${fx(W - mr)}" y="${t2 - 12}" text-anchor="end">عدد المخرجات</text>`;
  g += `<rect class="bar-t" x="${ml}" y="${t2 - 21}" width="10" height="10" rx="2"/><text class="tick" x="${ml + 15}" y="${t2 - 12}">المهام</text>`;
  g += `<rect class="bar-n" x="${ml + 62}" y="${t2 - 21}" width="10" height="10" rx="2"/><text class="tick" x="${ml + 77}" y="${t2 - 12}">الأخبار</text>`;
  g += `<text class="tick" x="${ml - 6}" y="${fx(y2(top) + 4)}" text-anchor="end">${top}</text><text class="tick" x="${ml - 6}" y="${fx(y2(0) + 4)}" text-anchor="end">0</text>`;
  g += `<line class="grid" x1="${ml}" x2="${fx(W - mr)}" y1="${fx(y2(top))}" y2="${fx(y2(top))}"/>`;
  const bw = Math.max(3, Math.min(26, band * .62));
  pts.forEach((p, i) => {
    const x = cx(i) - bw / 2;
    if (p.tasks) {
      const h = y2(0) - y2(p.tasks);
      g += `<path class="bar-t" d="${barPath(x, y2(p.tasks), bw, h, p.news ? 0 : 4)}"/>`;
    }
    if (p.news) {
      // فاصل 2px بين المهام والأخبار في نفس العمود
      const yTop = y2(p.tasks + p.news), h = y2(p.tasks) - yTop - (p.tasks ? 2 : 0);
      if (h > 0) g += `<path class="bar-n" d="${barPath(x, yTop, bw, h, 4)}"/>`;
    }
  });
  g += `<line class="base" x1="${ml}" x2="${fx(W - mr)}" y1="${fx(y2(0))}" y2="${fx(y2(0))}"/>`;

  const step = Math.max(1, Math.ceil(46 / band));
  pts.forEach((p, i) => { if ((n - 1 - i) % step === 0) g += `<text class="tick" x="${fx(cx(i))}" y="${t2 + h2 + 18}" text-anchor="middle">${esc(p.label)}</text>`; });

  g += `<rect class="hl" id="trendHl" x="0" y="${t1}" width="${fx(band)}" height="${t2 + h2 - t1}" visibility="hidden"/>`;
  g += `<line class="cross" id="trendCross" x1="0" x2="0" y1="${t1}" y2="${t2 + h2}" visibility="hidden"/>`;
  pts.forEach((p, i) => {
    const label = `${p.label}: ${p.avg === null ? "بلا تقدير" : "متوسط " + p.avg + "%"}، ${p.tasks} مهام، ${p.news} أخبار`;
    g += `<rect class="hit" data-i="${i}" x="${fx(ml + i * band)}" y="${t1}" width="${fx(band)}" height="${t2 + h2 - t1}" tabindex="0" aria-label="${esc(label)}"/>`;
  });
  return `<svg viewBox="0 0 ${fx(W)} ${H}" role="img" aria-label="تطور متوسط تقدير سالم وعدد المخرجات">${g}</svg>`;
}
function showTrendTip(i) {
  const p = state.stats && state.stats.series.points[i];
  const tip = $("#trendTip");
  if (!p || !tip || !trendGeom) return;
  const x = trendGeom.ml + (i + .5) * trendGeom.band;
  ["#trendCross", "#trendHl"].forEach(id => $(id).setAttribute("visibility", "visible"));
  $("#trendCross").setAttribute("x1", fx(x)); $("#trendCross").setAttribute("x2", fx(x));
  $("#trendHl").setAttribute("x", fx(x - trendGeom.band / 2));
  tip.innerHTML = `<div class="tip-h">${esc(p.label)}</div>
    <div class="tip-row"><span><i class="tip-key" style="background:#e9edf1"></i>متوسط التقدير</span><b>${p.avg === null ? "—" : p.avg + "%"}</b></div>
    <div class="tip-row"><span><i class="tip-key" style="background:#3987e5"></i>المهام</span><b>${p.tasks}</b></div>
    <div class="tip-row"><span><i class="tip-key" style="background:#d95926"></i>الأخبار</span><b>${p.news}</b></div>`;
  tip.hidden = false;
  const box = $("#trendCharts"), scale = box.clientWidth / parseFloat(box.querySelector("svg").viewBox.baseVal.width);
  const px = x * scale, w = tip.offsetWidth;
  tip.style.left = (px + 14 + w > box.clientWidth ? px - 14 - w : px + 14) + "px";
  tip.style.top = (trendGeom.t1 * scale) + "px";
}
function hideTrendTip() {
  const tip = $("#trendTip");
  if (tip) tip.hidden = true;
  ["#trendCross", "#trendHl"].forEach(id => { const el = $(id); if (el) el.setAttribute("visibility", "hidden"); });
}
function trendTableHtml(pts) {
  return `<table><thead><tr><th>الفترة</th><th>متوسط التقدير</th><th>المهام</th><th>الأخبار</th></tr></thead><tbody>` +
    pts.slice().reverse().map(p => `<tr><td>${esc(p.label)}</td><td>${p.avg === null ? "—" : p.avg + "%"}</td><td>${p.tasks}</td><td>${p.news}</td></tr>`).join("") +
    "</tbody></table>";
}
function renderTrend(m) {
  const box = $("#trendCharts"), table = $("#trendTable"), btn = $("#btnTrendTable");
  const series = m.series;
  const unit = series ? { hour: "لكل ساعة", day: "لكل يوم", month: "لكل شهر" }[series.unit] + " · " : "";
  $("#trendSub").textContent = `متوسط تقدير سالم وعدد المخرجات ${unit}${rangeNote()}`;
  const empty = text => { box.innerHTML = `<div class="trend-empty">${esc(text)}</div>`; table.hidden = true; btn.hidden = true; trendGeom = null; };
  if (!state.url) return empty("اربط اللوحة بالخادم لعرض تطور الأداء.");
  if (!state.loaded) return empty(state.loading ? "جاري التحميل…" : "تعذر تحميل البيانات.");
  if (!series) return empty("حدّث الخادم إلى الإصدار الجديد لعرض تطور الأداء.");
  if (!series.points.some(p => p.tasks || p.news)) return empty("لا توجد مهام أو أخبار في هذه الفترة.");
  btn.hidden = false;
  btn.setAttribute("aria-pressed", String(trendTableOn));
  btn.textContent = trendTableOn ? "إخفاء الجدول" : "عرض كجدول";
  box.innerHTML = trendSvg(series.points, box.clientWidth || 600) + '<div class="tip" id="trendTip" hidden></div>';
  table.hidden = !trendTableOn;
  table.innerHTML = trendTableOn ? trendTableHtml(series.points) : "";
}

// ---------------- شريط الأحداث والأخبار السفلية ----------------
function renderTicker() {
  const events = state.tasks.map(r => ({ when: fmtDate(r[1]), who: r[2], text: r[3] }))
    .concat(state.news.map(r => ({ when: fmtDate(r[0]), who: "نواف · خبر", text: r[1] })))
    .sort((a, b) => b.when.localeCompare(a.when)).slice(0, 14);
  const track = $("#tickerTrack");
  if (!events.length) {
    track.style.animation = "none";
    track.innerHTML = `<span class="tk-item">${state.url ? "لا توجد أحداث بعد" : "اربط اللوحة بالخادم لعرض آخر الأحداث"}</span>`;
    return;
  }
  const one = events.map(e => `<span class="tk-item"><i></i><time>${esc(shortDay(e.when))}</time><b>${esc(e.who)}</b>${esc(clip(e.text, 70))}</span>`).join("");
  track.style.animation = "none";
  track.innerHTML = one;
  // نكرر المحتوى حتى يغطي الشريط، ثم نضاعفه لحلقة متصلة بلا فجوة
  const view = track.parentElement.clientWidth;
  let html = one, reps = 1;
  while (track.scrollWidth < view && reps < 6) { html += one; track.innerHTML = html; reps++; }
  const width = track.scrollWidth;
  track.innerHTML = html + html;
  track.style.setProperty("--dur", Math.max(20, width / 45) + "s");
  track.style.animation = "";
}

function stripCell(row) {
  if (!row) return `<div class="cell" data-tone="none"><span class="c-ico">${ICON.news}</span><span class="c-main"><span class="c-title muted">لا يوجد خبر</span><span class="c-date">—</span></span>${valueHtml(null, "c-val")}${segbar(null, 22)}</div>`;
  const s = salemScore(row[6]);
  return `<button type="button" class="cell" data-tone="${tone(s)}" data-open="news" title="${esc(row[1])}">
    <span class="c-ico">${ICON.news}</span>
    <span class="c-main"><span class="c-title">${esc(row[1])}</span><span class="c-date">${esc(fmtDate(row[0]))} · ${esc(row[7] || "تقدير سالم")}</span></span>
    ${valueHtml(s, "c-val")}
    ${segbar(s, 22)}
  </button>`;
}
function renderStrip() {
  const cells = [0, 1, 2].map(i => stripCell(state.news[i])).join("");
  $("#strip").innerHTML = cells + `<button type="button" class="cell add" data-action="fetch-news">${ICON.plus}<span class="lbl-text">رصد الأخبار الآن</span></button>`;
}
