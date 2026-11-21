"use strict";
// مسار المبيعات (Pipeline.gs): كل صفقة من أول اهتمام حتى الربح أو الخسارة، بقيمتها وخطوتها القادمة.
// الصفقات تُنشأ وحدها من ردود مازن المهتمة ومنافسات بدر وعروض الصيانة، وتضيف أنت ما يأتيك من غيرها.

const PIPE_TABS = [{ id: "today", label: "خطوات اليوم" }, { id: "open", label: "المسار" }, { id: "closed", label: "المغلقة" }, { id: "site", label: "من الموقع" }];
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
  const count = { today: p.due.length + open.filter(d => !d.nextStep).length, open: open.length, closed: p.items.length - open.length, site: state.leads ? state.leads.stats.fresh : "…" };
  const tabs = `<div class="sh-pad row-actions"><div class="seg-ctl" role="tablist">${PIPE_TABS.map(t => `<button type="button" data-qtab="${t.id}" aria-pressed="${state.pipeTab === t.id}">${t.label} (${count[t.id]})</button>`).join("")}</div>
    <button type="button" class="btn btn-primary sm" data-qact="new"><span class="lbl-text">+ صفقة</span></button>
    <button type="button" class="btn btn-line sm" data-qact="reload"${state.pipeLoading ? " disabled" : ""}><span class="lbl-text">تحديث</span></button></div>`;
  const form = state.pipeEdit === "new" ? pipeFormHtml(null) : "";
  let body = "";
  if (state.pipeTab === "site") body = leadsTabHtml();
  else if (state.pipeTab === "today") {
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
  const intro = p.items.length || state.pipeTab === "site" ? "" : `<p class="hint sh-pad">المسار فارغ. أول ما يرد عميل مهتم على مازن، أو يجهز بدر عرض منافسة، أو تعمل عرض صيانة، تنضاف الصفقة وحدها. وتقدر تضيف صفقة بنفسك من «+ صفقة».</p>`;
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
  if (/^lead-/.test(btn.dataset.qact)) return leadsAction(btn);
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

// ---------------- من الموقع: طلبات نموذج «اطلب تواصلاً» (Leads.gs) ----------------
async function loadLeads() {
  state.leadsLoading = true;
  try { state.leads = await api({ action: "leads_get" }); state.leadsError = ""; }
  catch (e) { state.leadsError = officeError(e); }
  finally { state.leadsLoading = false; if (state.view === "pipeline" && state.pipeTab === "site") renderPipelineView(); }
}

// رابط النموذج لكل علامة؛ رابط الخادم ورمز النموذج بعد # فلا يصلان لخادم الصفحات
function leadsLink(slug, embed) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, "") + "lead.html";
  return base + "#u=" + encodeURIComponent(state.url || "") + "&k=" + encodeURIComponent(state.leads.cfg.key) + "&b=" + slug + (embed ? "&e=1" : "");
}

function leadsTabHtml() {
  if (!state.leads) {
    if (!state.leadsLoading && !state.leadsError) { state.leadsLoading = true; setTimeout(loadLeads, 0); }
    return state.leadsError ? empty(ICON.alert, "تعذر تحميل طلبات الموقع", state.leadsError, `<button type="button" class="btn btn-line" data-qact="lead-reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`) : skeleton();
  }
  const L = state.leads, c = L.cfg, s = L.stats;
  const okUrl = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(state.url || "");
  const linkRow = (slug, label) => {
    const link = leadsLink(slug, false), frame = `<iframe src="${leadsLink(slug, true)}" title="اطلب تواصلاً · ${label}" style="width:100%;max-width:560px;height:760px;border:0" loading="lazy"></iframe>`;
    return `<div class="lead-link"><b>${esc(label)}</b>
      <div class="row-actions">${copyButton(link, "نسخ الرابط")}${copyButton(frame, "نسخ كود التضمين")}
        <a class="btn btn-line sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${ICON.ext}<span class="lbl-text">افتح النموذج</span></a></div></div>`;
  };
  const settings = `<details class="sh-pad office-form lead-cfg"${L.items.length ? "" : " open"}><summary><b>النموذج وإعداداته</b></summary>
    ${okUrl ? "" : `<p class="health-fix">رابط الخادم في إعدادات اللوحة ليس رابط Apps Script منشوراً (…/exec)، فلن يعمل النموذج حتى تضبطه.</p>`}
    <p class="hint">ضع النموذج في موقعي انطلق ووهج: الصق «كود التضمين» في صفحة «تواصل معنا» أو أسفل الصفحة الرئيسية، أو اربط زر «اطلب عرضاً» بالرابط. وشارك الرابط في واتساب وإنستغرام ورمز QR.</p>
    ${linkRow("entaliq", "انطلق للطاقة")}${linkRow("wahaj", "وهج")}
    <label class="remember"><input type="checkbox" id="ld-on"${c.enabled ? " checked" : ""}> النموذج يستقبل الطلبات</label>
    <label class="remember"><input type="checkbox" id="ld-alert"${c.alert ? " checked" : ""}> نبّهني بالبريد مع كل طلب جديد</label>
    <label class="remember"><input type="checkbox" id="ld-draft"${c.autoDraft ? " checked" : ""}> مازن يكتب رداً خلال دقائق ويدققه سالم (يصلك للموافقة)</label>
    <div class="row-actions"><label class="hint">الحد اليومي <input class="input" id="ld-cap" type="number" min="1" max="500" value="${esc(c.dailyCap)}" style="width:90px"></label>
      <button type="button" class="btn btn-primary sm" data-qact="lead-save"><span class="lbl-text">حفظ وتحديث المشغلات</span></button>
      <button type="button" class="btn btn-line sm" data-qact="lead-rotate"><span class="lbl-text">غيّر رمز النموذج</span></button></div>
    <p class="hint">الحماية: رمز النموذج، وحقل مخفي يكشف البرامج الآلية، وزمن تعبئة أدنى، وحد للطلبات في الدقيقة واليوم، ودمج المكرر خلال 24 ساعة. إن وصلك إزعاج كثير فاضغط «غيّر رمز النموذج» ثم انسخ الروابط الجديدة إلى الموقعين؛ القديمة تتوقف فوراً. لا يرسل الخادم أي بريد للزائر من نفسه.</p>
  </details>`;
  const line = `<p class="hint sh-pad">هذا الأسبوع: ${s.week} · لم نتواصل بعد: ${s.fresh}${s.spam ? " · مشتبه: " + s.spam : ""}${s.last ? " · آخر طلب: " + esc(ltr(s.last)) : ""}</p>`;
  const tone = { "جديد": "warn", "تواصلنا": "ok", "مكرر": "none", "مشتبه": "bad", "مغلق": "none" };
  const replyLabel = { "بانتظار المسودة": "مازن يكتب الرد", "جاهز للإرسال": "رد مازن ينتظر موافقتك", "تحقق يدوي": "رد مازن يحتاج مراجعتك", "في الطابور": "الرد في طابور الإرسال", "أُرسل": "أُرسل الرد", "ردّوا": "ردّوا على رسالتنا" };
  const list = L.items.map(x => {
    const wa = x.phone ? `https://wa.me/${encodeURIComponent(x.phone)}?text=${encodeURIComponent("السلام عليكم " + x.name + "، معك فريق " + (x.brand === "وهج" ? "وهج" : "انطلق للطاقة") + " بخصوص طلبكم من موقعنا.")}` : "";
    const b = (act, label, cls, extra) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-qact="${act}" data-id="${esc(x.id)}"${extra || ""}><span class="lbl-text">${label}</span></button>`;
    return `<article class="item lead" data-status="${esc(x.status)}">
      <div class="item-head"><b>${esc(x.company || x.name)}</b>${x.company ? `<small class="muted">${esc(x.name)}</small>` : ""}
        <span class="badge" data-tone="none">${esc(x.brand)}</span>
        <span class="badge" data-tone="${tone[x.status] || "none"}" style="margin-inline-start:auto">${esc(x.status)}</span></div>
      <p class="hint">${esc(ltr(x.at))}${x.city ? " · " + esc(x.city) : ""}${x.service ? " · " + esc(x.service) : ""}${x.phone ? ` · <bdi dir="ltr">+${esc(x.phone)}</bdi>` : ""}${x.email ? ` · <bdi dir="ltr">${esc(x.email)}</bdi>` : ""}</p>
      ${x.message ? `<p class="deal-note">${esc(x.message)}</p>` : ""}
      ${x.note ? `<p class="hint">${esc(x.note)}</p>` : ""}
      ${x.reply ? `<p class="hint">${esc(replyLabel[x.reply] || "رد مازن: " + x.reply)}</p>` : ""}
      <div class="row-actions">
        ${x.phone ? `<a class="btn btn-primary sm" href="tel:+${esc(x.phone)}"><span class="lbl-text">اتصل</span></a><a class="btn btn-line sm" href="${esc(wa)}" target="_blank" rel="noopener noreferrer"><span class="lbl-text">واتساب</span></a>` : ""}
        ${x.email ? `<a class="btn btn-line sm" href="mailto:${esc(x.email)}"><span class="lbl-text">بريد</span></a>` : ""}
        ${x.reply === "جاهز للإرسال" || x.reply === "تحقق يدوي" ? b("lead-mazen", "راجع رد مازن", "btn-primary") : ""}
        ${x.status === "جديد" ? b("lead-status", "تواصلنا", "btn-line", ` data-status="تواصلنا"`) + b("lead-status", "مزعج", "btn-line", ` data-status="مشتبه"`) : ""}
        ${x.status === "مشتبه" ? b("lead-status", "حقيقي: أدخله المسار", "btn-line", ` data-status="جديد"`) : ""}
        ${x.dealId ? b("lead-deal", "افتح الصفقة") : ""}
      </div></article>`;
  }).join("");
  return settings + line + (list ? `<div class="list">${list}</div>` : `<p class="hint sh-pad">لم يصل طلب بعد. أضف النموذج إلى الموقعين من «النموذج وإعداداته» أعلاه، ثم جرّبه بنفسك.</p>`);
}

async function leadsAction(btn) {
  const act = btn.dataset.qact, id = btn.dataset.id;
  const send = async (body, ok) => {
    const stop = busy(btn, "جاري الحفظ");
    try { state.leads = await api(body); if (ok) toast(ok, "ok"); return true; }
    catch (e) { toast(officeError(e), "bad"); return false; }
    finally { stop(); renderPipelineView(); }
  };
  if (act === "lead-reload") { state.leads = null; state.leadsError = ""; return renderPipelineView(); }
  if (act === "lead-save") {
    const ok = await send({ action: "leads_cfg", enabled: $("#ld-on").checked, alert: $("#ld-alert").checked, autoDraft: $("#ld-draft").checked, dailyCap: Number($("#ld-cap").value) }, "حُفظت إعدادات النموذج");
    if (ok) { try { await api({ action: "health_fix", fix: "triggers" }); } catch (e) { /* المشغلات تُحدَّث أيضاً من الأتمتة */ } }
    return;
  }
  if (act === "lead-rotate") {
    if (!confirm("تغيير رمز النموذج يوقف الروابط وأكواد التضمين القديمة فوراً، وتحتاج تنسخ الجديدة إلى الموقعين. متأكد؟")) return;
    return send({ action: "leads_cfg", rotate: true }, "تغيّر الرمز؛ انسخ الروابط الجديدة إلى الموقعين");
  }
  if (act === "lead-status") return send({ action: "leads_update", id, status: btn.dataset.status }, btn.dataset.status === "جديد" ? "أُدخل الطلب إلى مسار المبيعات" : "حُدّثت حالة الطلب");
  if (act === "lead-mazen") return openView("prospects");
  if (act === "lead-deal") { state.pipeTab = "today"; if (state.pipe) { const x = state.leads.items.find(l => l.id === id); const d = x && state.pipe.items.find(p => p.id === x.dealId); if (d && (state.pipe.cfg.open || []).indexOf(d.stage) >= 0) state.pipeTab = "open"; else if (d) state.pipeTab = "closed"; } return renderPipelineView(); }
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
