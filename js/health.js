"use strict";
// صحة المكتب (Health.gs): فحص واحد لكل ما يحتاجه المكتب ليعمل، مع طريقة إصلاح كل خلل.
// تبويب في إدارة المكتب، ونقطة على زر إدارة المكتب إن وُجدت مشكلة (يُفحص بهدوء عند الفتح ثم كل 30 دقيقة).

const HEALTH_ICON = { ok: "✓", warn: "!", bad: "✕", info: "i" };
const HEALTH_LABEL = { ok: "سليم", warn: "تنبيه", bad: "مشكلة", info: "معلومة" };
const HEALTH_TONE = { ok: "ok", warn: "warn", bad: "bad", info: "none" };

async function loadHealth(quiet) {
  if (!state.url || !hasAuth()) { if (!quiet) { state.healthError = "اربط اللوحة بالخادم أولاً."; renderHealthTab(); } return; }
  state.healthLoading = true;
  if (!quiet) renderHealthTab();
  try { acceptHealth(await api({ action: "health_get" })); state.healthError = ""; }
  catch (e) { state.healthError = officeError(e); if (/النسخة القديمة/.test(state.healthError)) state.healthUnsupported = true; }
  finally { state.healthLoading = false; renderHealthTab(); paintHealthBadge(); }
}

function acceptHealth(d) {
  state.health = { at: d.at, server: d.server, checks: d.checks || [], agents: d.agents || [] };
  state.healthUnsupported = false;
}

// فحوصات تعرفها اللوحة وحدها: توافق نسخة الخادم، ودعم الصوت في هذا المتصفح
function healthLocalChecks() {
  const h = state.health, out = [];
  if (h) {
    const s = Number(h.server) || 0;
    if (s < SERVER_VERSION) out.push({ area: "اللوحة", title: "نسخة الخادم", status: "bad", detail: "الخادم المنشور (" + s + ") أقدم من اللوحة (" + SERVER_VERSION + ")؛ بعض الميزات لن تعمل",
      fix: "الصق كود الخادم الكامل الجديد ثم Deploy ← Manage deployments ← Edit ← New version." });
    else if (s > SERVER_VERSION) out.push({ area: "اللوحة", title: "نسخة اللوحة", status: "warn", detail: "اللوحة في هذا المتصفح أقدم من الخادم", fix: "حدّث الصفحة بـ Ctrl+F5." });
    else out.push({ area: "اللوحة", title: "نسخة الخادم", status: "ok", detail: "مطابقة للوحة (" + s + ")" });
  }
  const rec = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const ar = "speechSynthesis" in window && speechSynthesis.getVoices().some(v => /^ar/i.test(v.lang));
  out.push({ area: "اللوحة", title: "راكان بالصوت في هذا المتصفح", status: rec && ar ? "ok" : "info",
    detail: (rec ? "الميكروفون مدعوم" : "الميكروفون غير مدعوم (اكتب أوامرك)") + " · " + (ar ? "صوت عربي مثبت" : "لا يوجد صوت عربي للنطق"),
    fix: rec && ar ? "" : "استخدم Chrome أو Edge، وأضف العربية من إعدادات Windows ← الوقت واللغة ← الكلام." });
  return out;
}

function healthAll() {
  return healthLocalChecks().concat(state.health ? state.health.checks : []);
}

function paintHealthBadge() {
  const b = $("#btnOffice");
  if (!b) return;
  if (!state.health || state.healthUnsupported) { b.removeAttribute("data-health"); return; }
  const all = healthAll(), bad = all.filter(c => c.status === "bad").length, warn = all.filter(c => c.status === "warn").length;
  b.dataset.health = bad ? "bad" : warn ? "warn" : "ok";
  b.title = bad ? "إدارة المكتب · صحة المكتب: " + voiceNum(bad, ["", "مشكلة واحدة", "مشكلتين", "مشاكل", "مشكلة"]) : warn ? "إدارة المكتب · صحة المكتب: " + voiceNum(warn, ["", "تنبيه واحد", "تنبيهين", "تنبيهات", "تنبيهاً"]) : "إدارة المكتب";
}

function renderHealthTab() {
  if (state.view === "office" && state.officeTab === "health") renderOfficeView();
}

function officeHealthHtml() {
  const intro = `<p class="hint sh-pad">فحص واحد لكل ما يحتاجه المكتب ليعمل: الخادم، والعامل على جهازك، والبريد، والمشغلات، والوكلاء، والنشر. لا يغيّر شيئاً؛ كل خلل معه طريقة إصلاحه.</p>`;
  if (!state.health) {
    if (!state.healthLoading && !state.healthError) setTimeout(() => loadHealth(false), 0);
    return intro + (state.healthError ? empty(ICON.alert, "تعذر الفحص", state.healthError, `<button type="button" class="btn btn-line" data-hact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`) : skeleton());
  }
  const all = healthAll(), n = s => all.filter(c => c.status === s).length;
  const bad = n("bad"), warn = n("warn");
  const tone = bad ? "bad" : warn ? "warn" : "ok";
  const P = ["", "مشكلة واحدة", "مشكلتين", "مشاكل", "مشكلة"], T = ["", "تنبيه واحد", "تنبيهين", "تنبيهات", "تنبيهاً"];
  const head = bad ? "يحتاج إصلاحاً: " + voiceNum(bad, P) + (warn ? "، و" + voiceNum(warn, T) : "")
    : warn ? "المكتب يعمل، مع " + voiceNum(warn, T) : "المكتب سليم، وكل الفحوصات تمام";
  const areas = [];
  all.forEach(c => { if (areas.indexOf(c.area) < 0) areas.push(c.area); });
  const actBtn = c => {
    const map = { triggers: "أعد تثبيت المشغلات", pipeline: "افتح نموذج الموقع", prospects: "افتح صفحة مازن", log: "افتح سجل المكتب", agents: "افتح الوكلاء", brain: "افتح العقل", auto: "افتح الأتمتة" };
    return c.action && map[c.action] ? `<button type="button" class="btn ${c.action === "triggers" ? "btn-primary" : "btn-line"} sm" data-hact="${esc(c.action)}"><span class="lbl-text">${map[c.action]}</span></button>` : "";
  };
  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  const groups = areas.map(area => `<h3 class="news-title">${esc(area)}</h3><div class="list">${all.filter(c => c.area === area).sort((a, b) => order[a.status] - order[b.status]).map(c => `
    <article class="item health-item" data-status="${c.status}">
      <div class="item-head"><span class="health-dot" data-status="${c.status}" aria-hidden="true">${HEALTH_ICON[c.status]}</span><b>${esc(c.title)}</b>
        <span class="badge" data-tone="${HEALTH_TONE[c.status]}" style="margin-inline-start:auto">${HEALTH_LABEL[c.status]}</span></div>
      ${c.detail ? `<p class="hint">${esc(c.detail).replace(/\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?/g, m => ltr(m))}</p>` : ""}
      ${c.fix && c.status !== "ok" ? `<p class="health-fix">${esc(c.fix)}</p>` : ""}
      ${c.status !== "ok" && actBtn(c) ? `<div class="row-actions">${actBtn(c)}</div>` : ""}
    </article>`).join("")}</div>`).join("");
  const ag = state.health.agents;
  const table = ag.length ? `<h3 class="news-title">الوكلاء في آخر 7 أيام</h3>
    <div class="health-table" role="table">
      <div class="ht-row ht-head" role="row"><span>الوكيل</span><span>الحالة</span><span>تكليفات</span><span>تقدير سالم</span><span>آخر تكليف</span></div>
      ${ag.map(a => `<div class="ht-row" role="row"><span>${avatar(a.name, "xs")} ${esc(a.name)}</span>
        <span><span class="badge" data-tone="${!a.active ? "bad" : a.onDuty ? "ok" : "warn"}">${!a.active ? "موقوف" : a.onDuty ? "في الدوام" : "خارج الدوام"}</span></span>
        <span>${a.tasks}</span><span>${a.avg === null ? "—" : a.avg + "%" + (a.low ? ` <small class="muted">(${a.low} منخفضة)</small>` : "")}</span>
        <span>${a.last ? esc(ltr(a.last)) : "—"}</span></div>`).join("")}
    </div>` : "";
  return intro + `<div class="sh-pad"><div class="health-head" data-tone="${tone}"><b>${esc(head)}</b>
      <span class="muted">آخر فحص: ${esc(ltr(state.health.at || ""))}</span>
      <button type="button" class="btn btn-line sm" data-hact="reload"${state.healthLoading ? " disabled" : ""}><span class="lbl-text">${state.healthLoading ? "جاري الفحص…" : "أعد الفحص"}</span></button></div>
    ${groups}${table}
    <p class="hint">تقدر تسأل راكان بالصوت: «هل المكتب سليم؟». والعامل يبدأ وحده مع Windows إن شغّلت worker/install-autostart.cmd مرة واحدة.</p></div>`;
}

async function healthAction(btn) {
  const act = btn.dataset.hact;
  if (act === "reload") return loadHealth(false);
  if (act === "triggers") {
    const stop = busy(btn, "جاري التثبيت");
    try { acceptHealth(await api({ action: "health_fix", fix: "triggers" })); toast("أُعيد تثبيت المشغلات حسب إعدادات الأتمتة", "ok"); }
    catch (e) { toast(officeError(e), "bad"); }
    finally { stop(); renderHealthTab(); paintHealthBadge(); }
    return;
  }
  if (act === "prospects") return openView("prospects");
  if (act === "pipeline") { state.pipeTab = "site"; return openView("pipeline"); }
  if (["log", "agents", "brain", "auto"].indexOf(act) >= 0) { state.officeTab = act; state.officeEdit = ""; state.officeTaskEdit = ""; return renderOfficeView(); }
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-hact]");
  if (b) healthAction(b);
});

// فحص هادئ بعد فتح اللوحة، ثم كل 30 دقيقة (لا يُعاد إن كان الخادم لا يعرف الفحص)
setTimeout(() => loadHealth(true), 8000);
setInterval(() => { if (!state.healthUnsupported) loadHealth(true); }, 30 * 60000);
