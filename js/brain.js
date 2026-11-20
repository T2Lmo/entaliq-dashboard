"use strict";
// عقل المكتب ومرجعه (Brain.gs): دروس وقواعد وأمثلة يقرؤها كل وكيل قبل كل مهمة ليتحسن مع الوقت

const BRAIN_ALL = "الكل";
const BRAIN_TYPES = ["قاعدة", "درس", "تفضيل", "ملاحظة المدير", "مثال جيد"];
const BRAIN_TEACH_TYPES = ["قاعدة", "درس", "تفضيل"];
const brainAgents = () => AGENTS.map(a => a.name).filter(n => n !== "الباحث");

async function loadBrain() {
  if (!state.url || !hasAuth()) { state.brainError = "اربط اللوحة بالخادم أولاً."; renderOfficeView(); return; }
  state.brainLoading = !state.brain; renderOfficeView();
  try { acceptBrain(await api({ action: "brain_get" })); state.brainError = ""; }
  catch (e) { state.brainError = officeError(e); }
  finally { state.brainLoading = false; renderOfficeView(); }
}
function acceptBrain(data) { state.brain = { items: data.items || [], impact: data.impact || {} }; }

async function brainSend(btn, body, okMessage) {
  const stop = busy(btn, "جاري الحفظ");
  try { const data = await api(body); acceptBrain(data); toast(okMessage, "ok"); return data; }
  catch (e) { toast(officeError(e), "bad"); return null; }
  finally { stop(); renderOfficeView(); }
}

// ---------------- تبويب «العقل والمرجع» ----------------
function brainImpactHtml(impact) {
  const rows = brainAgents().map(n => ({ n, x: impact[n] })).filter(r => r.x && (r.x.lessons || r.x.examples || r.x.proposed || r.x.recentCount));
  const shared = impact[BRAIN_ALL] || {};
  if (!rows.length && !shared.lessons) return "";
  const trend = x => {
    if (x.recent === null || x.recent === undefined) return `<span class="hint">لا تقديرات في آخر 14 يوماً</span>`;
    const prev = x.previous === null || x.previous === undefined ? "" : ` مقابل ${x.previous}% قبلها`;
    const d = x.previous === null || x.previous === undefined ? 0 : x.recent - x.previous;
    const arrow = d > 0 ? `<b class="b-up">▲ ${d}</b>` : d < 0 ? `<b class="b-down">▼ ${-d}</b>` : "";
    return `<span>آخر 14 يوماً ${x.recent}% (${x.recentCount} مهام)${prev}</span> ${arrow}`;
  };
  return `<h3 class="news-title">أثر العقل: هل يتحسن الوكلاء؟</h3>
    <p class="hint">متوسط تقدير سالم لكل وكيل في آخر 14 يوماً مقابل الـ14 يوماً التي قبلها.${shared.lessons ? ` دروس للجميع: ${shared.lessons}.` : ""}</p>
    <div class="list b-impact">${rows.map(({ n, x }) => `<div class="b-row">${avatar(n, "xs")}<b>${esc(n)}</b>
      <small class="muted">دروس ${x.lessons}${x.examples ? ` · أمثلة ${x.examples}` : ""}${x.proposed ? ` · مقترحة ${x.proposed}` : ""}</small>
      <span class="b-trend">${trend(x)}</span></div>`).join("")}</div>`;
}

function brainFormHtml(item) {
  const agents = [BRAIN_ALL].concat(brainAgents());
  const it = item || { agent: state.brainAgent || "لمى", type: "قاعدة", text: "", status: "معتمد" };
  const opt = (v, cur) => `<option${v === cur ? " selected" : ""}>${esc(v)}</option>`;
  return `<article class="item office-form" data-brain-form="${esc(item ? item.id : "new")}">
    <h3 class="news-title">${item ? "تعديل" : "درس جديد"}</h3>
    <div class="row-actions">
      <label class="hint">الوكيل <select class="input" id="bf-agent">${agents.map(a => opt(a, it.agent)).join("")}</select></label>
      <label class="hint">النوع <select class="input" id="bf-type">${BRAIN_TYPES.map(t => opt(t, it.type)).join("")}</select></label>
      <label class="hint">الحالة <select class="input" id="bf-status">${["معتمد", "مقترح", "موقوف"].map(s => opt(s, it.status === "مرفوض" ? "موقوف" : it.status)).join("")}</select></label>
    </div>
    <label class="lbl" for="bf-text">النص</label>
    <textarea class="field" id="bf-text" rows="${it.type === "مثال جيد" ? 8 : 3}" maxlength="${it.type === "مثال جيد" ? 1200 : 600}" placeholder="مثال: لا تذكر نسب وفر في نصائح الترشيد إلا إذا وردت في ملف الشركة.">${esc(it.text)}</textarea>
    <p class="hint">اكتب الدرس عاماً يصلح للمهام القادمة، لا لمهمة واحدة. «الكل» يصل لكل الوكلاء.</p>
    <div class="row-actions"><button type="button" class="btn btn-primary sm" data-bact="save"><span class="lbl-text">حفظ</span></button>
      <button type="button" class="btn btn-line sm" data-bact="cancel"><span class="lbl-text">إلغاء</span></button></div>
  </article>`;
}

function brainItemHtml(x) {
  const b = (act, label, cls) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-bact="${act}" data-id="${esc(x.id)}"><span class="lbl-text">${label}</span></button>`;
  const acts = x.status === "مقترح" ? b("approve", "اعتمد", "btn-primary") + b("edit", "تعديل") + b("reject", "ارفض")
    : x.status === "معتمد" ? b("edit", "تعديل") + b("stop", "إيقاف") + b("delete", "حذف")
    : b("activate", "تفعيل") + b("delete", "حذف");
  const example = x.type === "مثال جيد";
  const tone = { "معتمد": "ok", "مقترح": "warn", "موقوف": "none", "مرفوض": "bad" }[x.status] || "none";
  return `<article class="item">
    <div class="item-head">${AGENT_BY_NAME[x.agent] ? avatar(x.agent, "xs") : `<span class="av xs" aria-hidden="true">✦</span>`}<b>${esc(x.agent)}</b>
      <span class="badge" data-tone="none">${esc(x.type)}</span><span class="badge" data-tone="${tone}">${esc(x.status)}</span>
      <small class="muted" style="margin-inline-start:auto">${esc(ltr(x.updated || x.at))} · ${esc(x.by)}</small></div>
    ${example ? `<details class="fold"><summary>${esc(clip(x.text.split("\n")[0], 140))}</summary><div class="fold-body"><div class="md">${md(x.text)}</div></div></details>` : `<p>${esc(x.text)}</p>`}
    ${x.source ? `<p class="hint">المصدر: ${esc(x.source)}</p>` : ""}
    <div class="row-actions">${acts}</div>
  </article>`;
}

function officeBrainHtml() {
  const intro = `<p class="hint sh-pad">كل وكيل يقرأ دروسه المعتمدة ودروس «الكل» قبل كل مهمة، ومثالاً معتمداً من عمله للأسلوب فقط. المقترحات لا تُستخدم حتى تعتمدها.
    مصادر التعلم: ملاحظاتك عند رفض منشور أو طلب إعادة كتابته، «علّم الوكيل» من سجل المهام، ومراجعة راكان الأسبوعية لتدقيقات سالم.</p>`;
  if (!state.brain) {
    if (!state.brainLoading && !state.brainError) setTimeout(loadBrain, 0);
    return intro + (state.brainError ? empty(ICON.alert, "تعذر تحميل العقل", state.brainError, `<button type="button" class="btn btn-line" data-bact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`) : skeleton());
  }
  const all = state.brain.items, f = state.brainAgent;
  const items = f ? all.filter(x => x.agent === f) : all;
  const by = s => items.filter(s);
  const proposed = by(x => x.status === "مقترح"), lessons = by(x => x.status === "معتمد" && x.type !== "مثال جيد"),
    examples = by(x => x.status === "معتمد" && x.type === "مثال جيد"), off = by(x => x.status === "موقوف" || x.status === "مرفوض");
  const editing = state.brainEdit && state.brainEdit !== "new" ? all.find(x => x.id === state.brainEdit) : null;
  const section = (title, list, note) => list.length ? `<h3 class="news-title sh-pad">${title} (${list.length})</h3>${note ? `<p class="hint sh-pad">${note}</p>` : ""}<div class="list">${list.map(brainItemHtml).join("")}</div>` : "";
  const tools = `<div class="sh-pad row-actions">
      <button type="button" class="btn btn-primary sm" data-bact="new"><span class="lbl-text">+ درس</span></button>
      <button type="button" class="btn btn-line sm" data-bact="review"><span class="lbl-text">راكان: اقترح دروساً الآن</span></button>
      <label class="hint" style="margin-inline-start:auto">عرض <select class="input" id="brainFilter"><option value="">كل الوكلاء</option>${[BRAIN_ALL].concat(brainAgents()).map(n => `<option${n === f ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    </div>`;
  return intro + tools
    + (state.brainEdit ? `<div class="list">${brainFormHtml(editing)}</div>` : "")
    + `<div class="sh-pad">${brainImpactHtml(state.brain.impact)}</div>`
    + section("بانتظار اعتمادك", proposed, "اقترحها راكان من تدقيقات سالم، أو أمثلة لأعلى المخرجات تقديراً. اعتمد ما تراه صحيحاً.")
    + section("الدروس المعتمدة", lessons)
    + section("المرجع: أمثلة معتمدة", examples, "يرى الوكيل أحدث مثال له للأسلوب والبنية فقط، دون نقل أرقامه أو حقائقه.")
    + section("موقوفة ومرفوضة", off, "لا تُستخدم. المرفوضة تبقى ليتجنب راكان اقتراحها مجدداً.")
    + (!all.length && !state.brainEdit ? empty(ICON.clip, "العقل فارغ", "أضف أول درس، أو علّم وكيلاً من سجل المهام، أو اطلب من راكان اقتراح دروس من تدقيقات سالم.") : "");
}

async function brainAction(btn) {
  const act = btn.dataset.bact, id = btn.dataset.id;
  if (act === "reload") return loadBrain();
  if (act === "new") { state.brainEdit = "new"; return renderOfficeView(); }
  if (act === "edit") { state.brainEdit = id; renderOfficeView(); const t = $("#bf-text"); if (t) t.focus(); return; }
  if (act === "cancel") { state.brainEdit = ""; return renderOfficeView(); }
  if (act === "save") {
    const f = btn.closest("[data-brain-form]"), editId = f.dataset.brainForm;
    const item = { id: editId === "new" ? undefined : editId, agent: field(f, "bf-agent").value, type: field(f, "bf-type").value, status: field(f, "bf-status").value, text: field(f, "bf-text").value };
    if (item.text.trim().length < 3) { toast("اكتب نص الدرس", "warn"); return; }
    if (await brainSend(btn, { action: "brain_save", item }, editId === "new" ? "أُضيف إلى عقل " + item.agent : "حُفظ التعديل")) state.brainEdit = "";
    return renderOfficeView();
  }
  if (act === "approve" || act === "activate") return brainSend(btn, { action: "brain_status", id, status: "معتمد" }, "اعتُمد، وسيستخدمه الوكيل من المهمة القادمة");
  if (act === "stop") return brainSend(btn, { action: "brain_status", id, status: "موقوف" }, "أُوقف؛ لن يُستخدم");
  if (act === "reject") return brainSend(btn, { action: "brain_status", id, status: "مرفوض" }, "رُفض الاقتراح");
  if (act === "delete") {
    const x = state.brain.items.find(i => i.id === id);
    if (!confirm("حذف هذا من العقل نهائياً؟\n" + (x ? clip(x.text, 120) : ""))) return;
    return brainSend(btn, { action: "brain_delete", id }, "حُذف من العقل");
  }
  if (act === "review") {
    const stop = busy(btn, "راكان يراجع");
    toast("يراجع راكان تدقيقات سالم وملاحظاتك في آخر أسبوعين ليقترح دروساً؛ قد يستغرق دقيقة.", "none");
    try {
      const data = await api({ action: "brain_review" });
      acceptBrain(data);
      const r = data.review || {};
      const parts = [r.added ? (r.added === 1 ? "درساً واحداً" : r.added === 2 ? "درسين" : r.added + " دروس") : "",
        r.examples ? (r.examples === 1 ? "مثالاً واحداً" : r.examples === 2 ? "مثالين" : r.examples + " أمثلة") : ""].filter(Boolean);
      toast(parts.length ? `اقترح راكان ${parts.join(" و")}؛ راجعها في «بانتظار اعتمادك».` : "لم يجد راكان دروساً جديدة (تدقيقات منخفضة: " + (r.low || 0) + "، ملاحظات: " + (r.notes || 0) + ").", parts.length ? "ok" : "none");
    } catch (e) { toast(officeError(e), "bad"); }
    finally { stop(); renderOfficeView(); }
  }
}

// ---------------- التعليم من سجل المهام ----------------
function teachButtonsHtml(row, score) {
  const [id, , agent] = row;
  if (!AGENT_BY_NAME[agent] || agent === "الباحث") return "";
  return `<button type="button" class="btn btn-line sm" data-teach="${esc(id)}" data-agent="${esc(agent)}"><span class="lbl-text">علّم ${esc(agent)}</span></button>`
    + (score !== null && score >= 85 ? `<button type="button" class="btn btn-line sm" data-brain-example="${esc(id)}"><span class="lbl-text">احفظه مثالاً</span></button>` : "");
}

function openTeachDlg(btn) {
  const id = btn.dataset.teach, agent = btn.dataset.agent;
  const row = state.tasks.find(r => r[0] === id) || (state.alerts || []).filter(a => a.kind === "task").map(a => a.row).find(r => r[0] === id);
  state.agentDlg = { kind: "lesson", name: agent, taskId: id };
  $("#agentDlgTitle").textContent = "علّم " + agent;
  $("#agentDlgSub").textContent = "درس يقرؤه قبل كل مهمة قادمة · من المهمة " + id;
  $("#agentDlgMsg").textContent = "";
  $("#agentDlgSave .lbl-text").textContent = "احفظ في العقل";
  $("#agentDlgBody").innerHTML = `${row ? `<p class="hint">المهمة: ${esc(clip(row[3], 200))}</p>` : ""}
    <label class="lbl" for="ad-lesson">الدرس</label>
    <textarea class="field" id="ad-lesson" rows="4" maxlength="600" placeholder="مثال: اربط كل عرض بخدمة محددة من ملف الشركة، ولا تذكر نسب وفر غير موثقة."></textarea>
    <div class="row-actions"><label class="hint">النوع <select class="input" id="ad-ltype">${BRAIN_TEACH_TYPES.map(t => `<option>${t}</option>`).join("")}</select></label></div>
    <div class="day-checks"><label><input type="radio" name="ad-scope" value="agent" checked> ${esc(agent)} فقط</label>
      <label><input type="radio" name="ad-scope" value="all"> كل الوكلاء</label></div>
    <p class="hint">اكتبه عاماً يصلح للمهام القادمة. يُعتمد فوراً، ويمكنك تعديله أو إيقافه من إدارة المكتب ← العقل والمرجع.</p>`;
  if (!agentDlg.open) agentDlg.showModal();
  $("#ad-lesson").focus();
}

async function saveTeachDlg() {
  const d = state.agentDlg, body = $("#agentDlgBody"), msg = $("#agentDlgMsg");
  const text = field(body, "ad-lesson").value.trim();
  if (text.length < 3) { msg.textContent = "اكتب الدرس أولاً."; return; }
  const scope = (body.querySelector('input[name="ad-scope"]:checked') || {}).value;
  const stop = busy($("#agentDlgSave"), "جاري الحفظ");
  try {
    acceptBrain(await api({ action: "brain_from_task", taskId: d.taskId, text, type: field(body, "ad-ltype").value, scope }));
    agentDlg.close();
    toast(scope === "all" ? "حُفظ الدرس لكل الوكلاء" : "تعلّم " + d.name + " الدرس، وسيطبقه من المهمة القادمة", "ok");
  } catch (e) { msg.textContent = officeError(e); }
  finally { stop(); }
}

async function saveBrainExample(btn) {
  const stop = busy(btn, "جاري الحفظ");
  try { acceptBrain(await api({ action: "brain_example", taskId: btn.dataset.brainExample })); toast("حُفظت المهمة مثالاً مرجعياً للوكيل", "ok"); }
  catch (e) { toast(officeError(e), "bad"); }
  finally { stop(); }
}

// ملاحظتك على منشور (رفض أو إعادة كتابة) تُحفظ في عقل لمى؛ لا تعطّل الإجراء الأصلي إن تعذرت
async function brainCaptureNote(contentId, note, rejected) {
  if (!note || !note.trim() || state.officeUnsupported) return;
  try {
    const data = await api({ action: "brain_note", contentId, note, rejected });
    acceptBrain(data);
    if (data.saved) toast("حُفظت ملاحظتك في عقل لمى لتطبقها في المنشورات القادمة", "ok");
  } catch (e) { console.warn("brain_note:", e.message); }
}
