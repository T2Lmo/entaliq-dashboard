"use strict";
// مسار المبيعات (Pipeline.gs): كل صفقة من أول اهتمام حتى الربح أو الخسارة، بقيمتها وخطوتها القادمة.
// الصفقات تُنشأ وحدها من ردود مازن المهتمة ومنافسات بدر وعروض الصيانة، وتضيف أنت ما يأتيك من غيرها.

const PIPE_TABS = [{ id: "today", label: "خطوات اليوم" }, { id: "open", label: "المسار" }, { id: "closed", label: "المغلقة" }];
const PIPE_TONE = { "مهتم": "none", "اجتماع": "none", "زيارة ودراسة": "warn", "عرض مرسل": "warn", "تفاوض": "ok", "ربحنا": "ok", "خسرنا": "bad" };
const pipeMoney = n => n === null || n === undefined || n === "" ? "—" : Math.round(Number(n)).toLocaleString("en-US") + " ر.س";
const pipeToday = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const pipeIn = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

async function loadPipeline(quiet) {
  if (!state.url || !hasAuth()) { state.pipeError = "اربط اللوحة بالخادم أولاً."; renderPipelineView(); return; }
  if (!quiet) { state.pipeLoading = true; renderPipelineView(); }
  try { acceptPipeline(await api({ action: "pipeline_get" })); state.pipeError = ""; }
  catch (e) { state.pipeError = officeError(e); }
  finally { state.pipeLoading = false; renderPipelineView(); }
}
function acceptPipeline(d) { state.pipe = { items: d.items || [], stats: d.stats || {}, due: d.due || [], cfg: d.cfg || {} }; }

async function pipeSend(btn, body, ok) {
  const stop = btn ? busy(btn, "جاري الحفظ") : () => {};
  try { const d = await api(body); acceptPipeline(d); if (ok) toast(ok, "ok"); return d; }
  catch (e) { toast(officeError(e), "bad"); return null; }
  finally { stop(); renderPipelineView(); }
}

// ---------------- الرسم ----------------
function renderPipelineView() {
  const box = $("#pipelineBody");
  if (!box || state.view !== "pipeline") return;
  if (!state.pipe) {
    box.innerHTML = state.pipeLoading ? skeleton() : empty(ICON.alert, "تعذر تحميل مسار المبيعات", state.pipeError || "", `<button type="button" class="btn btn-line" data-qact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`);
    return;
  }
  const p = state.pipe, s = p.stats, today = pipeToday();
  const open = p.items.filter(d => (p.cfg.open || []).indexOf(d.stage) >= 0);
  const nums = `<div class="sh-pad"><div class="x-nums">
      <div class="x-num"><b>${s.open || 0}</b><span>مفتوحة · ${esc(pipeMoney(s.openValue))}</span></div>
      <div class="x-num" data-tone="${s.weighted ? "ok" : ""}"><b>${esc(pipeMoney(s.weighted))}</b><span>المتوقع (القيمة × الاحتمال)</span></div>
      <div class="x-num" data-tone="${s.wonMonth ? "ok" : ""}"><b>${esc(pipeMoney(s.wonMonthValue))}</b><span>ربحنا هذا الشهر (${s.wonMonth || 0})</span></div>
      <div class="x-num"><b>${s.winRate === null || s.winRate === undefined ? "—" : s.winRate + "%"}</b><span>نسبة الفوز (90 يوماً)</span></div>
      <div class="x-num" data-tone="${s.overdue ? "bad" : s.due ? "warn" : ""}"><b>${s.due || 0}</b><span>خطوات حان موعدها${s.overdue ? " · متأخرة " + s.overdue : ""}</span></div>
    </div>${s.noValue ? `<p class="hint">${s.noValue} ${s.noValue === 1 ? "صفقة مفتوحة بلا قيمة" : "صفقات مفتوحة بلا قيمة"}؛ أضف القيمة التقديرية ليصح «المتوقع».</p>` : ""}</div>`;
  const count = { today: p.due.length + open.filter(d => !d.nextStep).length, open: open.length, closed: p.items.length - open.length };
  const tabs = `<div class="sh-pad row-actions"><div class="seg-ctl" role="tablist">${PIPE_TABS.map(t => `<button type="button" data-qtab="${t.id}" aria-pressed="${state.pipeTab === t.id}">${t.label} (${count[t.id]})</button>`).join("")}</div>
    <button type="button" class="btn btn-primary sm" data-qact="new"><span class="lbl-text">+ صفقة</span></button>
    <button type="button" class="btn btn-line sm" data-qact="reload"${state.pipeLoading ? " disabled" : ""}><span class="lbl-text">تحديث</span></button></div>`;
  const form = state.pipeEdit === "new" ? pipeFormHtml(null) : "";
  let body = "";
  if (state.pipeTab === "today") {
    const due = p.due.map(x => p.items.find(d => d.id === x.id)).filter(Boolean);
    const noStep = open.filter(d => !d.nextStep && due.indexOf(d) < 0);
    body = (due.length ? `<div class="list">${due.map(pipeDealHtml).join("")}</div>` : `<p class="hint sh-pad">ما فيه خطوات حان موعدها اليوم.</p>`)
      + (noStep.length ? `<h3 class="news-title sh-pad">صفقات بلا خطوة قادمة</h3><div class="list">${noStep.map(pipeDealHtml).join("")}</div>` : "");
  } else if (state.pipeTab === "open") {
    body = (p.cfg.open || []).map(st => {
      const list = open.filter(d => d.stage === st), b = (s.byStage || {})[st] || { n: 0, value: 0 };
      return `<h3 class="news-title sh-pad pipe-stage"><span class="badge" data-tone="${PIPE_TONE[st]}">${esc(st)}</span> ${b.n} · ${esc(pipeMoney(b.value))} <small class="muted">· احتمال ${(p.cfg.prob || {})[st]}%</small></h3>`
        + (list.length ? `<div class="list">${list.map(pipeDealHtml).join("")}</div>` : `<p class="hint sh-pad">لا صفقات في هذه المرحلة.</p>`);
    }).join("");
  } else {
    const closed = p.items.filter(d => (p.cfg.open || []).indexOf(d.stage) < 0).sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)));
    body = closed.length ? `<div class="list">${closed.map(pipeDealHtml).join("")}</div>` : `<p class="hint sh-pad">لم تُغلق صفقات بعد.</p>`;
  }
  const intro = p.items.length ? "" : `<p class="hint sh-pad">المسار فارغ. أول ما يرد عميل مهتم على مازن، أو يجهز بدر عرض منافسة، أو تعمل عرض صيانة، تنضاف الصفقة وحدها. وتقدر تضيف صفقة بنفسك من «+ صفقة».</p>`;
  box.innerHTML = nums + tabs + form + intro + body
    + `<p class="hint sh-pad">الاحتمال الافتراضي لكل مرحلة يُحسب به «المتوقع». خطوات اليوم تصلك في ملخص الصباح، وتقدر تسأل راكان: «وش الصفقات اللي تنتظرني؟».</p>`;
}

function pipeDealHtml(d) {
  const today = pipeToday(), openSt = (state.pipe.cfg.open || []).indexOf(d.stage) >= 0;
  const late = openSt && d.nextAt && d.nextAt < today, due = openSt && d.nextAt && d.nextAt === today;
  const stale = openSt && d.updated && (Date.now() - new Date(String(d.updated).replace(" ", "T")).getTime()) > (state.pipe.cfg.staleDays || 14) * 86400000;
  const b = (act, label, cls, extra) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-qact="${act}" data-id="${esc(d.id)}"${extra || ""}><span class="lbl-text">${label}</span></button>`;
  // كل جزء مهرّب هنا (جهة الاتصال قد تأتي من بريد خارجي)
  const who = [d.contact ? esc(d.contact) : "", d.email ? `<bdi dir="ltr">${esc(d.email)}</bdi>` : "", d.phone ? `<bdi dir="ltr">${esc(d.phone)}</bdi>` : ""].filter(Boolean);
  const meta = [esc(d.source || "يدوي") + (d.sourceId ? ` <small class="muted">${esc(d.sourceId)}</small>` : ""), d.city ? esc(d.city) : "", d.sector ? esc(d.sector) : ""].filter(Boolean).join(" · ");
  const solar = /شمس|صيان|ألواح|الواح|وهج/.test((d.service || "") + " " + (d.note || ""));
  let tools = "";
  if (state.pipeEdit === d.id) tools = pipeFormHtml(d);
  else if (state.pipeNext === d.id) tools = `<div class="office-form pipe-inline" data-qnext="${esc(d.id)}">
      <label class="lbl">الخطوة القادمة<input class="input" id="qn-step" maxlength="300" value="${esc(d.nextStep || "")}" placeholder="مثال: اتصل بمدير المرافق واتفق على موعد زيارة"></label>
      <div class="row-actions"><label class="hint">موعدها <input class="input" type="date" id="qn-at" value="${esc(d.nextAt || pipeIn(2))}"></label>
        ${[["اليوم", 0], ["بكرة", 1], ["بعد أسبوع", 7]].map(([l, n]) => `<button type="button" class="btn btn-line sm" data-qdate="${pipeIn(n)}"><span class="lbl-text">${l}</span></button>`).join("")}</div>
      <div class="row-actions">${b("next-save", "حفظ", "btn-primary")}${b("cancel", "إلغاء")}</div></div>`;
  else if (state.pipeClose === d.id) tools = `<div class="office-form pipe-inline" data-qclose="${esc(d.id)}">
      ${state.pipeCloseKind === "won"
        ? `<label class="lbl">قيمة الصفقة (ر.س)<input class="input ltr" id="qc-value" type="number" min="0" step="100" value="${d.value === null ? "" : esc(d.value)}"></label>`
        : `<label class="lbl">السبب<select class="input" id="qc-reason">${(state.pipe.cfg.lostReasons || []).map(r => `<option>${esc(r)}</option>`).join("")}</select></label>`}
      <label class="lbl">ملاحظة (اختياري)<input class="input" id="qc-note" maxlength="300"></label>
      <div class="row-actions">${b("close-save", state.pipeCloseKind === "won" ? "سجّل الربح" : "سجّل الخسارة", state.pipeCloseKind === "won" ? "btn-primary" : "btn-line")}${b("cancel", "إلغاء")}</div></div>`;
  else if (openSt) tools = `<div class="row-actions">
      ${b("next", d.nextStep ? "غيّر الخطوة" : "حدد الخطوة القادمة", d.nextStep ? "btn-line" : "btn-primary")}
      <select class="input pipe-move" data-qmove="${esc(d.id)}" aria-label="نقل إلى مرحلة">${(state.pipe.cfg.stages || []).map(st => `<option${st === d.stage ? " selected" : ""}>${esc(st)}</option>`).join("")}</select>
      ${b("won", "ربحنا", "btn-primary")}${b("lost", "خسرنا")}${b("edit", "تعديل")}
      ${b("sultan", "اطلب عرضاً من سلطان")}${solar ? b("contract", "عرض صيانة شمسية") : ""}</div>`;
  else tools = `<div class="row-actions">${b("reopen", "أعد فتحها")}${b("edit", "تعديل")}</div>`;
  const hist = (d.history || []).slice().reverse();
  return `<article class="item deal" data-stage="${esc(d.stage)}">
    <div class="item-head"><b>${esc(d.company)}</b>${d.service ? `<small class="muted">${esc(d.service)}</small>` : ""}
      <span class="badge" data-tone="${PIPE_TONE[d.stage] || "none"}" style="margin-inline-start:auto">${esc(d.stage)}</span><b class="deal-value">${esc(pipeMoney(d.value))}</b></div>
    <p class="hint">${meta}${who.length ? " · " + who.join(" · ") : ""}</p>
    ${d.note ? `<p class="deal-note">${esc(d.note)}</p>` : ""}
    ${openSt ? `<p class="deal-next" data-late="${late}">${d.nextStep ? `<b>الخطوة القادمة:</b> ${esc(d.nextStep)}` : `<span class="muted">بلا خطوة قادمة</span>`}
      ${d.nextAt ? ` · <span class="badge" data-tone="${late ? "bad" : due ? "warn" : "none"}">${late ? "متأخرة · " : due ? "اليوم · " : ""}${esc(ltr(d.nextAt))}</span>` : ""}${stale ? ` <span class="badge" data-tone="warn">بلا حركة +${state.pipe.cfg.staleDays || 14} يوماً</span>` : ""}</p>`
      : d.stage === "خسرنا" && d.lostReason ? `<p class="hint">السبب: ${esc(d.lostReason)}${d.closedAt ? " · " + esc(ltr(d.closedAt.slice(0, 10))) : ""}</p>` : d.closedAt ? `<p class="hint">أُغلقت ${esc(ltr(d.closedAt.slice(0, 10)))}</p>` : ""}
    ${tools}
    ${hist.length ? `<details class="vmsg-more"><summary>السجل (${hist.length})</summary><ul>${hist.map(h => `<li>${esc(ltr(h.at))} · ${h.from ? esc(h.from) + " ← " : ""}${esc(h.to)}${h.note ? " · " + esc(h.note) : ""} <small class="muted">${esc(h.by || "")}</small></li>`).join("")}</ul></details>` : ""}
  </article>`;
}

function pipeFormHtml(d) {
  const v = k => d ? esc(d[k] === null || d[k] === undefined ? "" : d[k]) : "";
  return `<div class="sh-pad office-form pipe-form" data-qform="${d ? esc(d.id) : "new"}">
    <h3 class="news-title">${d ? "تعديل الصفقة" : "صفقة جديدة"}</h3>
    <div class="cn-grid">
      <label class="lbl">المنشأة<input class="input" id="qf-company" maxlength="160" value="${v("company")}" placeholder="اسم الشركة أو الجهة"></label>
      <label class="lbl">الخدمة<input class="input" id="qf-service" maxlength="200" value="${v("service")}" placeholder="مثال: وهج للأسطح، تدقيق طاقة، صيانة شمسية"></label>
      <label class="lbl">القيمة التقديرية (ر.س)<input class="input ltr" id="qf-value" type="number" min="0" step="100" value="${v("value")}"></label>
      <label class="lbl">جهة الاتصال<input class="input" id="qf-contact" maxlength="120" value="${v("contact")}" placeholder="الاسم والمسمى"></label>
      <label class="lbl">البريد<input class="input ltr" id="qf-email" type="email" maxlength="160" value="${v("email")}"></label>
      <label class="lbl">الجوال<input class="input ltr" id="qf-phone" maxlength="40" value="${v("phone")}"></label>
      <label class="lbl">المدينة<input class="input" id="qf-city" maxlength="60" value="${v("city")}"></label>
      <label class="lbl">القطاع<input class="input" id="qf-sector" maxlength="80" value="${v("sector")}"></label>
      ${d ? "" : `<label class="lbl">المرحلة<select class="input" id="qf-stage">${(state.pipe.cfg.open || []).map(st => `<option>${esc(st)}</option>`).join("")}</select></label>
      <label class="lbl">المصدر<select class="input" id="qf-source"><option>يدوي</option><option>الموقع</option></select></label>`}
      <label class="lbl">الخطوة القادمة<input class="input" id="qf-next" maxlength="300" value="${v("nextStep")}"></label>
      <label class="lbl">موعدها<input class="input" id="qf-at" type="date" value="${d ? v("nextAt") : pipeIn(1)}"></label>
    </div>
    <label class="lbl" for="qf-note">ملاحظات</label>
    <textarea class="field" id="qf-note" rows="2" maxlength="500">${v("note")}</textarea>
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-qact="form-save"><span class="lbl-text">${d ? "حفظ" : "أضف الصفقة"}</span></button>
      <button type="button" class="btn btn-line sm" data-qact="cancel"><span class="lbl-text">إلغاء</span></button></div>
  </div>`;
}

// ---------------- الإجراءات ----------------
async function pipeAction(btn) {
  const act = btn.dataset.qact, id = btn.dataset.id, d = id && state.pipe ? state.pipe.items.find(x => x.id === id) : null;
  if (act === "reload") return loadPipeline(!!state.pipe);
  if (act === "new") { state.pipeEdit = "new"; state.pipeNext = state.pipeClose = ""; renderPipelineView(); const i = $("#qf-company"); if (i) i.focus(); return; }
  if (act === "cancel") { state.pipeEdit = state.pipeNext = state.pipeClose = ""; return renderPipelineView(); }
  if (act === "edit") { state.pipeEdit = id; state.pipeNext = state.pipeClose = ""; return renderPipelineView(); }
  if (act === "next") { state.pipeNext = id; state.pipeEdit = state.pipeClose = ""; renderPipelineView(); const i = $("#qn-step"); if (i) i.focus(); return; }
  if (act === "won" || act === "lost") { state.pipeClose = id; state.pipeCloseKind = act; state.pipeEdit = state.pipeNext = ""; return renderPipelineView(); }
  if (act === "form-save") {
    const f = btn.closest("[data-qform]"), g = k => field(f, k) ? field(f, k).value : undefined;
    const deal = { company: g("qf-company"), service: g("qf-service"), value: g("qf-value"), contact: g("qf-contact"), email: g("qf-email").trim(), phone: g("qf-phone"),
      city: g("qf-city"), sector: g("qf-sector"), nextStep: g("qf-next"), nextAt: g("qf-at"), note: g("qf-note") };
    if (f.dataset.qform === "new") Object.assign(deal, { stage: g("qf-stage"), source: g("qf-source") }); else deal.id = f.dataset.qform;
    if (!String(deal.company || "").trim()) { toast("اكتب اسم المنشأة", "warn"); return; }
    if (await pipeSend(btn, { action: "pipeline_save", deal }, deal.id ? "حُفظت الصفقة" : "أُضيفت الصفقة إلى المسار")) { state.pipeEdit = ""; renderPipelineView(); }
    return;
  }
  if (!d) return;
  if (act === "next-save") {
    const f = btn.closest("[data-qnext]"), step = field(f, "qn-step").value.trim(), at = field(f, "qn-at").value;
    if (!step) { toast("اكتب الخطوة القادمة", "warn"); return; }
    if (await pipeSend(btn, { action: "pipeline_save", deal: { id, nextStep: step, nextAt: at } }, "حُفظت الخطوة القادمة")) { state.pipeNext = ""; renderPipelineView(); }
    return;
  }
  if (act === "close-save") {
    const f = btn.closest("[data-qclose]"), won = state.pipeCloseKind === "won";
    const body = { action: "pipeline_stage", id, stage: won ? "ربحنا" : "خسرنا", note: field(f, "qc-note").value };
    if (won) body.value = field(f, "qc-value").value; else body.lostReason = field(f, "qc-reason").value;
    if (await pipeSend(btn, body, won ? "مبروك! سُجّل الربح: " + d.company : "سُجّلت الخسارة: " + d.company)) { state.pipeClose = ""; renderPipelineView(); }
    return;
  }
  if (act === "reopen") return pipeSend(btn, { action: "pipeline_stage", id, stage: "تفاوض", note: "أُعيد فتحها" }, "أُعيد فتح الصفقة");
  if (act === "sultan") {
    state.agent = "سلطان"; store.set(KEYS.agent, state.agent);
    store.set(KEYS.draft, `جهّز عرضاً لـ${d.company}${d.city ? " في " + d.city : ""}${d.service ? " لخدمة: " + d.service : ""}.`
      + (d.note ? `\nما نعرفه عنهم: ${d.note}` : "") + (d.contact ? `\nجهة الاتصال: ${d.contact}` : "") + `\nالمرحلة الحالية: ${d.stage}.`);
    openView("compose"); return;
  }
  if (act === "contract") {
    state.contractsPrefill = { client: d.company, city: d.city, source: d.source === "مازن" ? d.sourceId : "" };
    state.contractsNew = true; state.contractsTab = "offers";
    openView("contracts"); return;
  }
}

async function pipeMove(sel) {
  const id = sel.dataset.qmove, d = state.pipe.items.find(x => x.id === id), stage = sel.value;
  if (!d || stage === d.stage) return;
  if (stage === "ربحنا" || stage === "خسرنا") { state.pipeClose = id; state.pipeCloseKind = stage === "ربحنا" ? "won" : "lost"; return renderPipelineView(); }
  await pipeSend(null, { action: "pipeline_stage", id, stage }, d.company + " ← " + stage);
}

document.addEventListener("click", e => {
  const t = e.target;
  if (!t.closest("#pipelineBody")) return;
  const tab = t.closest("[data-qtab]");
  if (tab) { state.pipeTab = tab.dataset.qtab; state.pipeEdit = state.pipeNext = state.pipeClose = ""; return renderPipelineView(); }
  const dt = t.closest("[data-qdate]");
  if (dt) { const i = dt.closest("[data-qnext]").querySelector("#qn-at"); if (i) i.value = dt.dataset.qdate; return; }
  const b = t.closest("[data-qact]");
  if (b) pipeAction(b);
});
document.addEventListener("change", e => { if (e.target && e.target.matches && e.target.matches("[data-qmove]")) pipeMove(e.target); });

if ($("#btnPipeline")) $("#btnPipeline").innerHTML = ICON.funnel;
