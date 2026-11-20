"use strict";
// ملخص راكان التنفيذي (Executive.gs): ما أنجزه كل وكيل ونتائجه، وما يحتاج انتباهك، ومقترحات التكليف

const EXEC_KINDS = [{ id: "day", label: "ملخص اليوم" }, { id: "week", label: "ملخص الأسبوع" }, { id: "month", label: "ملخص الشهر" }];

async function loadExec() {
  if (!state.url || !hasAuth()) { state.execError = "اربط اللوحة بالخادم أولاً."; renderExecView(); return; }
  state.execLoading = !state.exec; renderExecView();
  try {
    const data = await api({ action: "exec_get" });
    state.exec = data.reports || []; state.execError = "";
    if (!state.exec.some(r => r.id === state.execSel)) state.execSel = state.exec.length ? state.exec[0].id : "";
  } catch (e) { state.execError = officeError(e); }
  finally { state.execLoading = false; renderExecView(); }
}

async function runExec(btn) {
  if (state.execBusy) return;
  const kind = btn.dataset.execRun;
  state.execBusy = true;
  const stop = busy(btn, "راكان يكتب الملخص");
  toast("يقرأ راكان سجلات الفريق ويكتب الملخص؛ قد يستغرق دقيقة.", "none");
  try {
    const data = await api({ action: "exec_run", kind });
    state.exec = data.reports || []; state.execError = "";
    if (data.report) state.execSel = data.report.id;
    toast("كتب راكان " + (data.report ? data.report.kind === "يومي" ? "الملخص اليومي" : data.report.kind === "أسبوعي" ? "الملخص الأسبوعي" : "الملخص الشهري" : "الملخص"), "ok");
  } catch (e) { toast(officeError(e), "bad"); }
  finally { state.execBusy = false; stop(); renderExecView(); }
}

const execPct = v => v === null || v === undefined ? "—" : v + "%";
const execTone = v => v === null || v === undefined ? "none" : tone(v);

function execNumbersHtml(t) {
  const cell = (label, value, tn) => `<div class="x-num"${tn ? ` data-tone="${tn}"` : ""}><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  const statuses = Object.entries(t.contentByStatus || {}).map(([k, v]) => k + " " + v).join("، ");
  return `<div class="x-nums">
    ${cell("مهام", t.tasks)}${cell("متوسط تقدير سالم", execPct(t.avg), execTone(t.avg))}${cell("أقل من 70%", t.low, t.low ? "bad" : "")}
    ${cell("غير مكتملة", t.pending, t.pending ? "warn" : "")}${cell("أخبار", t.news)}${cell("محتوى جديد", t.content)}${cell("أحداث المكتب", t.events)}
  </div>${statuses ? `<p class="hint">المحتوى: ${esc(statuses)}</p>` : ""}${t.stopped && t.stopped.length ? `<p class="hint">موقوفون الآن: ${esc(t.stopped.join("، "))}</p>` : ""}`;
}

function execAgentsHtml(r) {
  const notes = Object.fromEntries((r.report.agents || []).map(a => [a.name, a]));
  const rows = AGENTS.map(a => ({ a, s: (r.stats && r.stats.agents || {})[a.name], n: notes[a.name] }))
    .filter(x => x.s && (x.s.tasks || x.s.news || x.s.content || x.s.events || !x.s.active || x.n));
  if (!rows.length) return "";
  return `<h3 class="news-title">ما أنجزه كل وكيل</h3><div class="list x-agents">${rows.map(({ a, s, n }) => {
    const state_ = !s.active ? ["bad", "موقوف"] : s.onDuty ? ["ok", "في الدوام"] : ["warn", "خارج الدوام"];
    const parts = [s.tasks ? `مهام ${s.tasks}${s.scheduled ? ` (مجدولة ${s.scheduled})` : ""}` : "", s.news ? `أخبار ${s.news}` : "", s.content ? `محتوى ${s.content}` : "",
      s.low ? `أقل من 70%: ${s.low}` : "", s.pending ? `غير مكتملة: ${s.pending}` : ""].filter(Boolean).join(" · ");
    return `<article class="item" data-tone="${execTone(s.avg)}">
      <div class="item-head">${avatar(a.name, "xs")}<b>${esc(a.name)}</b><small class="muted">${esc(a.role)}</small>
        <span class="badge" data-tone="${state_[0]}">${state_[1]}</span>
        <span class="x-avg" style="margin-inline-start:auto" title="متوسط تقدير سالم لمهامه">${esc(execPct(s.avg))}</span></div>
      ${parts ? `<p class="hint">${esc(parts)}</p>` : ""}
      ${n ? `${n.did ? `<p>${esc(n.did)}</p>` : ""}${n.result ? `<p class="hint"><b>النتيجة:</b> ${esc(n.result)}</p>` : ""}${n.note ? `<p class="hint"><b>ملاحظة راكان:</b> ${esc(n.note)}</p>` : ""}` : ""}
      <div class="row-actions"><button type="button" class="btn btn-line sm" data-open="tasks" data-filter-agent="${esc(a.name)}" data-sort="new"><span class="lbl-text">سجل مهامه</span></button></div>
    </article>`;
  }).join("")}</div>`;
}

function execSuggestionsHtml(r) {
  const list = r.report.suggestions || [];
  if (!list.length) return "";
  return `<h3 class="news-title">مقترحات راكان للتكليف</h3><p class="hint">لا يُنفَّذ شيء قبل موافقتك؛ «كلّف» يفتح نافذة التكليف بالنص لتعدّله ثم تنفذه الآن أو تجدوله.</p>
    <div class="list">${list.map((s, i) => `<article class="item">
      <div class="item-head">${avatar(s.agent, "xs")}<b>${esc(s.agent)}</b><small class="muted">${esc((AGENT_BY_NAME[s.agent] || {}).role || "")}</small></div>
      <p>${esc(s.task)}</p>${s.why ? `<p class="hint">${esc(s.why)}</p>` : ""}
      <div class="row-actions"><button type="button" class="btn btn-primary sm" data-exec-assign="${i}"><span class="lbl-text">كلّف</span></button>
        <button type="button" class="btn btn-line sm" data-exec-assign="${i}" data-schedule="1"><span class="lbl-text">جدولة</span></button></div>
    </article>`).join("")}</div>`;
}

function execReportHtml(r) {
  const rep = r.report, t = r.stats && r.stats.totals;
  const bullets = (title, items, cls) => items && items.length ? `<h3 class="news-title">${title}</h3><ul class="x-list ${cls}">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  return `<article class="x-report">
    <div class="item-head">${avatar(EXEC_AGENT, "sm")}<div class="item-meta"><strong>ملخص ${esc(r.kind)} · ${esc(ltr(r.from))}${r.to && !r.to.startsWith(r.from) ? " إلى " + esc(ltr(r.to.slice(0, 10))) : ""}</strong>
      <small>كُتب ${esc(ltr(r.at))} · ${esc(r.by === "آلي" ? "تلقائياً" : r.by)}</small></div></div>
    <h3 class="x-headline">${esc(rep.headline)}</h3>
    ${rep.summary ? `<div class="md">${rep.parsed === false ? md(rep.summary) : `<p>${esc(rep.summary)}</p>`}</div>` : ""}
    ${t ? execNumbersHtml(t) : ""}
    ${bullets("أبرز النتائج", rep.wins, "ok")}
    ${bullets("ما يحتاج انتباهك", rep.issues, "warn")}
    ${execAgentsHtml(r)}
    ${execSuggestionsHtml(r)}
  </article>`;
}

function renderExecView() {
  const box = $("#execBody");
  if (!box || state.view !== "exec") return;
  const runs = `<div class="sh-pad row-actions">${EXEC_KINDS.map(k => `<button type="button" class="btn ${k.id === "day" ? "btn-primary" : "btn-line"} sm" data-exec-run="${k.id}"${state.execBusy ? " disabled" : ""}><span class="lbl-text">${k.label} الآن</span></button>`).join("")}</div>`;
  if (state.execLoading) { box.innerHTML = runs + skeleton(); return; }
  if (!state.exec) {
    box.innerHTML = runs + empty(ICON.alert, "تعذر تحميل الملخصات", state.execError || "",
      `<button type="button" class="btn btn-line" data-exec-reload>${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`);
    return;
  }
  if (!state.exec.length) {
    box.innerHTML = runs + empty(ICON.clip, "لا توجد ملخصات بعد", "اضغط «ملخص اليوم الآن»، أو فعّل الملخص اليومي والأسبوعي من إدارة المكتب ← الأتمتة والهوية ← حفظ وتحديث المشغلات.");
    return;
  }
  const r = state.exec.find(x => x.id === state.execSel) || state.exec[0];
  const picker = state.exec.length > 1 ? `<div class="sh-pad"><label class="lbl" for="execPick">ملخصات سابقة</label>
    <select class="input" id="execPick">${state.exec.map(x => `<option value="${esc(x.id)}"${x.id === r.id ? " selected" : ""}>${esc(ltr(x.at))} · ${esc(x.kind)} · ${esc(x.report.headline.slice(0, 60))}</option>`).join("")}</select></div>` : "";
  box.innerHTML = runs + picker + `<div class="sh-pad">${execReportHtml(r)}</div>`;
}

async function execAssign(btn) {
  const r = state.exec && (state.exec.find(x => x.id === state.execSel) || state.exec[0]);
  const s = r && r.report.suggestions[Number(btn.dataset.execAssign)];
  if (!s) return;
  if (!state.office) await syncOffice(true);
  if (!state.office) { toast(state.officeError || "تعذر تحميل حالة الوكلاء.", "bad"); return; }
  openAgentDlg(s.agent, "assign", { task: s.task, schedule: !!btn.dataset.schedule });
}
