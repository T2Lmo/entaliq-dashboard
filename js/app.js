"use strict";
// الرسم الكامل والتحديث والإجراءات والإعدادات

// ---------------- الرسم الكامل ----------------
function renderStatus() {
  const pill = $("#status");
  let kind = "idle", text = "غير مربوط بالخادم";
  if (state.loading) { kind = "busy"; text = "جاري التحديث…"; }
  else if (state.error) { kind = "error"; text = "تعذر الاتصال"; }
  else if (state.lastSync) {
    const d = state.lastSync;
    kind = "ok"; text = `آخر تحديث ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $("#statusDate").textContent = ` ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  $("#statusDate").hidden = kind !== "ok";
  pill.dataset.state = kind;
  pill.title = state.error || text;
  $("#statusText").textContent = text;
  $("#btnRefresh").classList.toggle("spin", state.loading);
}
function renderBoard() {
  const m = computeMetrics();
  renderFilters();
  renderTiles(m);
  renderGauge(m);
  renderStage(m);
  renderTrend(m);
  renderTicker();
  renderStrip();
}

function acceptContent(data, append) {
  const rows = Array.isArray(data.content) ? data.content : [];
  if (append) {
    const known = new Set(state.content.map(r => r[0]));
    state.content = state.content.concat(rows.filter(r => !known.has(r[0])));
    Object.assign(state.contentVersions, data.contentVersions || {});
  } else {
    state.content = rows;
    state.contentVersions = data.contentVersions || {};
  }
  state.contentMeta = data.contentMeta || null;
  state.contentFloor = state.contentMeta ? (state.contentMeta.nextCursor === null ? 2 : state.contentMeta.nextCursor + 1) : null;
}
function sameConnection(epoch, url, token) { return epoch === state.connectionEpoch && url === state.url && token === state.token; }
async function refresh(opts) {
  const quiet = opts && opts.quiet;
  if (!state.url) { renderStatus(); renderBoard(); return false; }
  const seq = ++state.refreshSeq, epoch = state.connectionEpoch, url = state.url, token = state.token, range = state.range, researchRevision = state.researchRevision;
  const researchSnapshot = Object.fromEntries(Object.entries(state.researchTasks).map(([id, meta]) => [id, JSON.stringify([meta, state.taskVersions[id]])]));
  const current = () => seq === state.refreshSeq && sameConnection(epoch, url, token) && range === state.range;
  state.loading = true;
  renderStatus();
  let changed = !state.loaded;
  try {
    const request = { action: "dashboard", range };
    if (state.contentFloor !== null) request.contentCursor = state.contentFloor;
    const data = await api(request);
    if (!current()) return false;
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const news = Array.isArray(data.news) ? data.news : [];
    const stats = data.stats && data.stats.series ? data.stats : null;
    if (!stats || stats.range !== range) throw new Error("الخادم لم يُرجع مؤشرات الفترة المطلوبة؛ تحقق من نشر النسخة المحدثة.");
    const researchTasks = { ...(data.researchTasks || {}) };
    const taskVersions = { ...(data.taskVersions || {}) };
    // إذا سبقت متابعة البحث رد اللوحة، نحفظ تقدم ذلك البحث وحده ونحمّل بقية بيانات اللوحة.
    if (researchRevision !== state.researchRevision) {
      const phase = { queued: 0, searching: 1, auditing: 2, partial: 3, failed: 3, completed: 4, imported: 4 };
      Object.entries(state.researchTasks).forEach(([id, meta]) => {
        if (researchSnapshot[id] === JSON.stringify([meta, state.taskVersions[id]])) return;
        const incoming = researchTasks[id], row = state.tasks.find(r => r[0] === id);
        if (!row) return;
        const time = m => m ? Date.parse(m.updatedAt || m.completedAt || m.startedAt || m.createdAt || "") : NaN;
        if (incoming && ((time(incoming) > time(meta)) || ((phase[incoming.status] ?? -1) > (phase[meta.status] ?? -1)))) return;
        researchTasks[id] = meta;
        taskVersions[id] = state.taskVersions[id];
        const at = tasks.findIndex(r => r[0] === id);
        if (at >= 0) tasks[at] = row; else tasks.push(row);
      });
    }
    const alerts = Array.isArray(data.alerts) ? data.alerts.filter(a => !(a.kind === "task" && a.row[2] === "الباحث" && (researchIsPending(researchTasks[a.row[0]]) || researchIsManual(researchTasks[a.row[0]])))) : null;
    const sig = JSON.stringify([tasks, news, data.content, stats, alerts, taskVersions, researchTasks, data.contentVersions, data.contentMeta]);
    changed = changed || sig !== state.sig;
    acceptContent(data, false);
    Object.assign(state, { tasks, news, stats, alerts, taskVersions, sig, loaded: true, error: "", lastSync: new Date() });
    ingestResearchMetadata(researchTasks, tasks);
    renderResearchResult();
    syncOffice();
    return true;
  } catch (e) {
    if (!current()) return false;
    state.error = e.message;
    changed = true;
    if (!quiet) toast(e.message, "bad");
    return false;
  } finally {
    if (current()) {
      state.loading = false;
      renderStatus();
      const typing = state.view === "content" && (state.editingId || state.askingId);
      if (changed) { renderBoard(); if (sheet.open && state.view !== "compose" && !typing) renderView(); }
    }
  }
}
async function loadOlderContent() {
  if (state.contentPageLoading || state.loading || state.contentBusy || !state.contentMeta || state.contentMeta.nextCursor === null) return;
  const cursor = state.contentMeta.nextCursor, epoch = state.connectionEpoch, url = state.url, token = state.token, seq = ++state.refreshSeq;
  state.contentPageLoading = true;
  renderContentView();
  try {
    const data = await api({ action: "content_page", cursor });
    if (seq !== state.refreshSeq || !sameConnection(epoch, url, token)) return;
    acceptContent(data, true);
    state.sig = "";
    renderBoard();
  } catch (e) {
    if (sameConnection(epoch, url, token)) contentFeedback(e.message, "bad");
  } finally {
    state.contentPageLoading = false;
    if (sameConnection(epoch, url, token)) renderContentView();
  }
}

// ---------------- الإجراءات ----------------
async function sendTask(ev) {
  if (ev) ev.preventDefault();
  if (state.sending) return;
  const input = $("#taskInput");
  const task = input.value.trim();
  if (!task) { toast("اكتب المهمة أولاً", "warn"); input.focus(); return; }
  if (!state.url) { openSettings(); return; }

  const agent = state.agent;
  if (agent === "الباحث") { await submitManualResearch(); return; }
  state.resultOwner = "task";
  const submittedDraft = input.value;
  const epoch = state.connectionEpoch, url = state.url, token = state.token;
  const a = AGENT_BY_NAME[agent];
  const result = $("#result");
  result.hidden = false;
  result.className = "result";
  result.innerHTML = `<div class="result-head">${avatar(agent, "sm")}
      <div class="item-meta"><strong>${esc(agent)} ${a.f ? "تعمل" : "يعمل"} على المهمة، ثم يدققها سالم</strong><small>قد يستغرق ذلك من بضع ثوانٍ إلى دقيقة</small></div></div>
    <div class="result-body"><div class="sk w80"></div><div class="sk"></div><div class="sk w60"></div></div>`;

  state.sending = true;
  const stop = busy($("#btnSend"), "جاري التنفيذ");
  try {
    const data = await api({ agent, task });
    if (!sameConnection(epoch, url, token)) return;
    result.innerHTML = `<div class="result-head">${avatar(data.agent, "sm")}
        <div class="item-meta"><strong>${esc(data.agent)}</strong><small class="mono">${esc(data.taskId)}</small></div>
        ${scoreBadge(data.audit)}</div>
      <div class="result-body">
        <div class="md">${md(data.output)}</div>
        <div class="audit"><div class="audit-h">${avatar("سالم", "xs")} تدقيق سالم</div><div class="md">${md(data.audit)}</div></div>
        <div class="row-actions">${copyButton(data.output, "نسخ المخرجات")}</div>
      </div>`;
    if (input.value === submittedDraft) { input.value = ""; store.set(KEYS.draft, ""); }
    refresh({ quiet: true });
  } catch (e) {
    if (!sameConnection(epoch, url, token)) return;
    result.className = "result err";
    result.innerHTML = `<div class="result-head">${ICON.alert}<strong>لم تكتمل المهمة</strong></div>
      <div class="result-body"><p style="margin:0">${esc(e.message)}</p><p class="hint" style="margin:6px 0 0">نص المهمة ما زال في الخانة، يمكنك المحاولة مجدداً.</p></div>`;
  } finally {
    state.sending = false;
    stop();
    renderCompose();
  }
}

async function fetchNews(btn) {
  if (!state.url) { openSettings(); return; }
  if (state.fetching) { toast("دورة الرصد تعمل حالياً", "warn"); return; }
  const epoch = state.connectionEpoch, url = state.url, token = state.token;
  state.fetching = true;
  const stop = busy(btn, "جاري الرصد");
  contentFeedback("بدأ الرصد: يقيّم نواف صلة الأخبار ثم يمر المناسب على الفريق؛ قد يستغرق ذلك دقيقة إلى أربع.", "none", "newsFeedback");
  toast("بدأ رصد الأخبار؛ ستبقى تفاصيل النتيجة في قائمة الأخبار.");
  try {
    const data = await api({ action: "fetch_news" });
    if (!sameConnection(epoch, url, token)) return;
    jobFeedback(data, "اكتمل رصد الأخبار", "newsFeedback");
    if (!await refresh({ quiet: true })) jobFeedback({ ...data, warnings: [...(data.warnings || []), "تعذر تحديث البيانات: " + state.error] }, "اكتمل رصد الأخبار", "newsFeedback");
  } catch (e) {
    if (sameConnection(epoch, url, token)) { contentFeedback(e.message, "bad", "newsFeedback"); toast(e.message, "bad"); }
  } finally { state.fetching = false; stop(); }
}

function exportCsv() {
  if (!state.tasks.length) { toast("لا توجد مهام للتصدير", "warn"); return; }
  // علامة ' تمنع Excel من تفسير النص كمعادلة
  const q = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = [["ID", "التاريخ", "الوكيل", "المهمة", "المخرجات", "تدقيق سالم", "الحالة"]].concat(state.tasks.map(r => r.map((v, i) => i === 1 ? fmtDate(v) : v)));
  const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `entaliq-tasks-${todayKey()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let autoTimer = 0;
function setAuto(on) {
  store.set(KEYS.auto, on ? "1" : "");
  const b = $("#btnAuto");
  b.setAttribute("aria-pressed", String(on));
  b.innerHTML = on ? ICON.pause : ICON.play;
  b.title = on ? "إيقاف التحديث التلقائي" : "تشغيل التحديث التلقائي (كل دقيقة)";
  b.setAttribute("aria-label", b.title);
  clearInterval(autoTimer);
  if (on) autoTimer = setInterval(() => { if (document.visibilityState === "visible" && !state.loading && !state.contentPageLoading && !state.contentBusy && !state.taskBusyId) refresh({ quiet: true }); }, 60000);
}

// ---------------- الإعدادات ----------------
const dlg = $("#settings");
function settingsMsg(text, kind) { const m = $("#settingsMsg"); m.textContent = text || ""; m.className = "msg " + (kind || ""); }
function openSettings() {
  $("#inUrl").value = state.url;
  $("#inToken").value = state.token;
  $("#inRemember").checked = tokenStore.remembered();
  renderGoogleBox();
  renderSocialBox();
  if (state.url && hasAuth()) loadSocialStatus();
  $("#inLinkedin").value = state.linkedin;
  settingsMsg("");
  if (!dlg.open) dlg.showModal();
}
async function saveSettings(ev) {
  ev.preventDefault();
  const url = $("#inUrl").value.trim();
  const token = $("#inToken").value.trim();
  const linkedin = $("#inLinkedin").value.trim();
  try { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" || parsed.username || parsed.password || !/\/exec\/?$/.test(parsed.pathname)) throw new Error(); }
  catch (e) { settingsMsg("استخدم رابط HTTPS لتطبيق Google Apps Script المنشور والمنتهي بـ /exec.", "bad"); return; }
  if (!token && !googleUser()) { settingsMsg(GOOGLE_CLIENT_ID ? "سجّل الدخول بحساب Google أو أدخل رمز ACCESS_TOKEN." : "رمز ACCESS_TOKEN مطلوب.", "bad"); return; }
  if (state.editingId || state.askingId) { settingsMsg("احفظ النص المفتوح أو ألغِ تحريره قبل تغيير الاتصال.", "bad"); return; }
  if (state.sending || state.contentBusy || state.fetching || state.taskBusyId) { settingsMsg("انتظر اكتمال العملية الحالية قبل تغيير الخادم.", "bad"); return; }
  if (linkedin && !/^https:\/\/([\w-]+\.)?linkedin\.com\//i.test(linkedin)) { settingsMsg("رابط LinkedIn يجب أن يبدأ بـ https://www.linkedin.com/", "bad"); return; }
  state.linkedin = linkedin;
  store.set(KEYS.linkedin, linkedin);

  Object.assign(state, { url, token, loaded: false, error: "", sig: "", connectionEpoch: state.connectionEpoch + 1, contentFloor: null, contentVersions: {}, contentMeta: null, taskVersions: {}, tasks: [], news: [], content: [], stats: null, alerts: null, lastSync: null, editingId: null, askingId: null, conflictId: null,
    office: null, officeAt: 0, officeError: "", officeUnsupported: false });
  store.set(KEYS.url, url); tokenStore.set(token, $("#inRemember").checked);
  restoreResearchTracking();
  const btn = $("#btnSaveSettings");
  btn.disabled = true;
  settingsMsg(/\/dev(\?|$)/.test(url) ? "تنبيه: رابط ‎/dev‎ يتطلب تسجيل الدخول، استخدم رابط ‎/exec‎. جاري الاختبار…" : "جاري اختبار الاتصال…");
  await refresh({ quiet: true });
  btn.disabled = false;
  if (state.loaded) { dlg.close(); toast("تم الاتصال بالخادم بنجاح", "ok"); loadSocialStatus(); }
  else settingsMsg(state.error, "bad");
}
