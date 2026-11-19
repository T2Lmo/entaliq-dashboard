"use strict";
// إدارة المكتب: تعليمات الوكلاء وتوجيهاتهم، ساعات العمل، المهام المجدولة، الأتمتة، وهوية التصاميم (Office.gs)

const OFFICE_TABS = [
  { id: "agents", label: "الوكلاء" },
  { id: "tasks", label: "المهام المجدولة" },
  { id: "office", label: "التوجيهات والدوام" },
  { id: "auto", label: "الأتمتة والهوية" }
];
const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const hourLabel = h => String(h).padStart(2, "0") + ":00";

function officeError(e) {
  // الخادم القديم يحوّل أي إجراء لا يعرفه إلى مسار التكليف
  return /نص المهمة فارغ/.test(e.message)
    ? "الخادم الذي يرد على اللوحة ما زال يعمل بالنسخة القديمة.\nبعد لصق Code-complete.gs وحفظه: Deploy ← Manage deployments ← ✏️ Edit ← Version: New version ← Deploy (وليس New deployment، لأنه ينشئ رابطاً جديداً).\nوتأكد أن رابط /exec في إعدادات اللوحة هو رابط النشر نفسه."
    : e.message;
}

async function loadOffice(quiet) {
  if (!state.url || !hasAuth()) { state.officeError = "اربط اللوحة بالخادم أولاً."; renderOfficeView(); return; }
  if (!quiet) { state.officeLoading = true; renderOfficeView(); }
  try { acceptOffice(await api({ action: "office_get" })); state.officeError = ""; }
  catch (e) { state.officeError = officeError(e); }
  finally { state.officeLoading = false; renderOfficeView(); }
}
function acceptOffice(data) { state.office = { office: data.office, agents: data.agents || [], tasks: data.tasks || [] }; }

async function officeSend(btn, body, okMessage) {
  const stop = busy(btn, "جاري الحفظ");
  try {
    const data = await api(body);
    acceptOffice(data);
    toast(okMessage, "ok");
    return data;
  } catch (e) { toast(officeError(e), "bad"); return null; }
  finally { stop(); renderOfficeView(); }
}

// ---------------- عناصر النماذج ----------------
const dayChecks = (prefix, days) => `<div class="day-checks">${DAY_LABELS.map((d, i) =>
  `<label><input type="checkbox" data-day="${prefix}" value="${i}"${(days || []).includes(i) ? " checked" : ""}> ${d}</label>`).join("")}</div>`;
const readDays = (root, prefix) => [...root.querySelectorAll(`[data-day="${prefix}"]:checked`)].map(i => Number(i.value));
const hourSelect = (id, v) => `<select class="input" id="${id}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === v ? " selected" : ""}>${hourLabel(h)}</option>`).join("")}</select>`;
const field = (root, id) => root.querySelector("#" + id);
const obtn = (act, label, cls, extra) => `<button type="button" class="btn ${cls || "btn-line"} sm" data-oact="${act}"${extra || ""}><span class="lbl-text">${esc(label)}</span></button>`;

function hoursEditor(prefix, hours, allowInherit) {
  const mode = hours === "always" ? "always" : hours && hours.days ? "custom" : allowInherit ? "inherit" : "custom";
  const h = hours && hours.days ? hours : (state.office && state.office.office.defaultHours) || { days: [0, 1, 2, 3, 4], from: "08:00", to: "17:00" };
  const opt = (v, l) => `<label><input type="radio" name="${prefix}-mode" value="${v}"${mode === v ? " checked" : ""}> ${l}</label>`;
  return `<div class="hours-ed" data-hours="${prefix}">
    <div class="day-checks">${allowInherit ? opt("inherit", "ساعات المكتب") : ""}${opt("custom", "ساعات مخصصة")}${opt("always", "دائماً")}</div>
    <div class="hours-custom">${dayChecks(prefix, h.days)}
      <div class="row-actions"><label class="hint">من <input class="input" type="time" id="${prefix}-from" value="${esc(h.from)}"></label>
      <label class="hint">إلى <input class="input" type="time" id="${prefix}-to" value="${esc(h.to)}"></label></div></div>
  </div>`;
}
function readHours(root, prefix) {
  const mode = (root.querySelector(`input[name="${prefix}-mode"]:checked`) || {}).value || "custom";
  if (mode === "inherit") return null;
  if (mode === "always") return "always";
  return { days: readDays(root, prefix), from: field(root, prefix + "-from").value, to: field(root, prefix + "-to").value };
}

// ---------------- الرسم ----------------
function renderOfficeView() {
  const box = $("#officeBody");
  if (!box || state.view !== "office") return;
  const tabs = `<div class="seg-ctl office-tabs" role="tablist">${OFFICE_TABS.map(t =>
    `<button type="button" data-otab="${t.id}" aria-pressed="${state.officeTab === t.id}">${t.label}</button>`).join("")}</div>`;
  if (!state.office) {
    box.innerHTML = tabs + (state.officeLoading ? skeleton() : empty(ICON.alert, "تعذر تحميل إدارة المكتب", state.officeError || "",
      `<button type="button" class="btn btn-line" data-oact="reload">${ICON.refresh}<span class="lbl-text">إعادة المحاولة</span></button>`));
    return;
  }
  const o = state.office;
  const body = { agents: officeAgentsHtml, tasks: officeTasksHtml, office: officeSettingsHtml, auto: officeAutoHtml }[state.officeTab] || officeAgentsHtml;
  box.innerHTML = tabs + `<p class="hint sh-pad">الوقت في الخادم: ${esc(o.office.now)} (${esc(o.office.timezone)})</p>` + body(o);
}

function officeAgentsHtml(o) {
  return `<div class="list">${o.agents.map(a => {
    const info = AGENT_BY_NAME[a.name] || {};
    const tone = !a.active ? "bad" : a.onDuty ? "ok" : "warn";
    const label = !a.active ? "موقوف" : a.onDuty ? "في الدوام" : "خارج الدوام";
    const head = `<div class="item-head">${avatar(a.name, "xs")}<b>${esc(a.name)}</b><small class="muted">${esc(info.role || "")}</small>
      <span class="badge" data-tone="${tone}" style="margin-inline-start:auto">${label}</span></div>
      <p class="hint">الدوام: ${esc(a.name === "الباحث" ? "يدوي (نقل من Claude)" : a.hoursText)}${a.prompt ? " · تعليمات معدّلة" : ""}${a.directions ? " · له توجيهات" : ""}</p>`;
    if (state.officeEdit !== a.name) return `<article class="item">${head}<div class="row-actions">${obtn("edit-agent", "تعديل", "btn-line", ` data-name="${esc(a.name)}"`)}</div></article>`;
    return `<article class="item office-form" data-agent-form="${esc(a.name)}">${head}
      <label class="remember"><input type="checkbox" id="oa-active"${a.active ? " checked" : ""}> نشط (إلغاء التفعيل يوقف كل أعماله اليدوية والآلية)</label>
      <label class="lbl" for="oa-prompt">تعليمات الدور</label>
      <textarea class="field" id="oa-prompt" rows="6" maxlength="2500">${esc(a.prompt || a.defaultPrompt)}</textarea>
      <div class="row-actions">${obtn("default-prompt", "استرجاع التعليمات الأصلية", "btn-line", ` data-name="${esc(a.name)}"`)}</div>
      <label class="lbl" for="oa-dirs">توجيهاتك له (تُضاف لكل مهمة)</label>
      <textarea class="field" id="oa-dirs" rows="3" maxlength="1200" placeholder="مثال: ركّز هذا الشهر على المستشفيات الخاصة، واختم دائماً برابط التواصل.">${esc(a.directions)}</textarea>
      ${a.name === "الباحث" ? "" : `<span class="lbl">ساعات العمل</span>${hoursEditor("oa", a.hours, true)}`}
      <div class="row-actions">${obtn("save-agent", "حفظ", "btn-primary", ` data-name="${esc(a.name)}"`)}${obtn("reset-agent", "إعادة كل شيء للأصل", "btn-line", ` data-name="${esc(a.name)}"`)}${obtn("cancel-edit", "إلغاء")}</div>
    </article>`;
  }).join("")}</div>`;
}

function officeTasksHtml(o) {
  const agents = o.agents.map(a => a.name).filter(n => n !== "الباحث");
  const editing = state.officeTaskEdit;
  const t = editing && editing !== "new" ? o.tasks.find(x => x.id === editing) : null;
  const form = editing ? `<article class="item office-form" data-task-form="${esc(editing)}">
      <h3 class="news-title">${t ? "تعديل مهمة" : "مهمة مجدولة جديدة"}</h3>
      <label class="lbl" for="ot-agent">الوكيل</label>
      <select class="input" id="ot-agent">${agents.map(n => `<option${(t ? t.agent : "راكان") === n ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <label class="lbl" for="ot-task">المهمة</label>
      <textarea class="field" id="ot-task" rows="4" maxlength="1500" placeholder="مثال: لخّص أبرز أخبار الطاقة هذا الأسبوع في تقرير تنفيذي من 5 نقاط.">${esc(t ? t.task : "")}</textarea>
      <span class="lbl">الأيام</span>${dayChecks("ot", t ? t.days : [0])}
      <label class="lbl" for="ot-hour">الساعة</label>${hourSelect("ot-hour", t ? t.hour : 9)}
      <label class="remember"><input type="checkbox" id="ot-enabled"${!t || t.enabled ? " checked" : ""}> مفعّلة</label>
      <p class="hint">تُنفَّذ مرة في الموعد إذا كان الوكيل في دوامه، ويدققها سالم، وتظهر في سجل المهام.</p>
      <div class="row-actions">${obtn("save-task", "حفظ", "btn-primary")}${obtn("cancel-task", "إلغاء")}</div>
    </article>` : "";
  const list = o.tasks.map(x => `<article class="item">
      <div class="item-head">${avatar(x.agent, "xs")}<b>${esc(x.agent)}</b>
        <small class="muted">${esc(x.days.map(d => DAY_LABELS[d]).join("، "))} · ${hourLabel(x.hour)}</small>
        <span class="badge" data-tone="${x.enabled ? "ok" : "none"}" style="margin-inline-start:auto">${x.enabled ? "مفعّلة" : "متوقفة"}</span></div>
      <p>${esc(x.task)}</p>
      ${x.lastRun ? `<p class="hint">آخر تشغيل: ${esc(String(x.lastRun).slice(0, 16).replace("T", " "))}${x.lastError ? " · تعذر: " + esc(x.lastError) : x.lastTaskId ? " · " + esc(x.lastTaskId) : ""}</p>` : ""}
      <div class="row-actions">${obtn("run-task", "تشغيل الآن", "btn-primary", ` data-id="${esc(x.id)}"`)}${obtn("edit-task", "تعديل", "btn-line", ` data-id="${esc(x.id)}"`)}${obtn("delete-task", "حذف", "btn-line", ` data-id="${esc(x.id)}"`)}</div>
    </article>`).join("");
  return `<div class="sh-pad">${editing ? "" : obtn("new-task", "+ مهمة مجدولة", "btn-primary")}</div>${form}<div class="list">${list || (editing ? "" : `<p class="hint sh-pad">لا توجد مهام مجدولة بعد.</p>`)}</div>`;
}

function officeSettingsHtml(o) {
  const s = o.office;
  return `<div class="sh-pad office-form" data-office-form>
    <label class="lbl" for="oo-dirs">توجيهات عامة لكل الوكلاء</label>
    <textarea class="field" id="oo-dirs" rows="4" maxlength="1200" placeholder="مثال: لا تذكر المنافسين بالاسم. استخدم لغة رسمية مختصرة.">${esc(s.directions)}</textarea>
    <span class="lbl">ساعات عمل المكتب (الافتراضية لكل وكيل)</span>${hoursEditor("oo", s.defaultHours, false)}
    <label class="remember"><input type="checkbox" id="oo-manual"${s.enforceManual ? " checked" : ""}> طبّق الساعات على تكليفاتي من اللوحة أيضاً</label>
    <p class="hint">بدون هذا الخيار تقيّد الساعات العمل الآلي فقط (الرصد، الخطة، المهام المجدولة)، وتبقى تكليفاتك متاحة دائماً.</p>
    <div class="row-actions">${obtn("save-office", "حفظ", "btn-primary")}</div>
  </div>`;
}

function officeAutoHtml(o) {
  const a = o.office.automation;
  const every = [1, 2, 4, 6, 8, 12].map(h => `<option value="${h}"${a.news.everyHours === h ? " selected" : ""}>كل ${h} ساعة</option>`).join("");
  const days = DAY_LABELS.map((d, i) => `<option value="${i}"${a.weekly.day === i ? " selected" : ""}>${d}</option>`).join("");
  const trig = o.office.triggers.length ? o.office.triggers.join("، ") : "لا يوجد";
  return `<div class="sh-pad office-form" data-auto-form>
    <h3 class="news-title">رصد الأخبار (نواف ← فيصل ← لمى ← سالم)</h3>
    <label class="remember"><input type="checkbox" id="oz-news"${a.news.enabled ? " checked" : ""}> مفعّل</label>
    <select class="input" id="oz-every">${every}</select>
    <h3 class="news-title">خطة الأسبوع (راكان ← لمى ← سالم)</h3>
    <label class="remember"><input type="checkbox" id="oz-weekly"${a.weekly.enabled ? " checked" : ""}> مفعّلة</label>
    <div class="row-actions"><select class="input" id="oz-day">${days}</select>${hourSelect("oz-hour", a.weekly.hour)}</div>
    <p class="hint">يعمل التشغيل الآلي فقط إذا كان كل الفريق المعني في دوامه وغير موقوف. المشغلات الحالية: ${esc(trig)}</p>
    <div class="row-actions">${obtn("save-auto", "حفظ وتحديث المشغلات", "btn-primary")}</div>
  </div>
  <div class="sh-pad"><h3 class="news-title">هوية التصاميم كما تصفها ريم</h3>
    ${o.office.brandLooks.map(b => `<div class="office-form" data-brand-form="${esc(b.brand)}">
      <label class="lbl">${esc(b.brand)}</label>
      <textarea class="field" rows="2" maxlength="600" data-brand-look>${esc(b.look || b.defaultLook)}</textarea>
      <div class="row-actions">${obtn("save-brand", "حفظ", "btn-line", ` data-brand="${esc(b.brand)}"`)}</div></div>`).join("")}
    <p class="hint">يغيّر وصف الهوية الذي تتبعه ريم عند تجهيز التصاميم الجديدة. لتعديل تصميم منشور بعينه: المحتوى ← التصميم ← تعديل التصميم.</p>
  </div>`;
}

// ---------------- الإجراءات ----------------
async function officeAction(btn) {
  const act = btn.dataset.oact, o = state.office;
  const formOf = sel => btn.closest(sel);
  if (act === "reload") return loadOffice();
  if (act === "edit-agent") { state.officeEdit = btn.dataset.name; return renderOfficeView(); }
  if (act === "cancel-edit") { state.officeEdit = ""; return renderOfficeView(); }
  if (act === "default-prompt") { const a = o.agents.find(x => x.name === btn.dataset.name); formOf("[data-agent-form]").querySelector("#oa-prompt").value = a.defaultPrompt; return; }
  if (act === "save-agent") {
    const f = formOf("[data-agent-form]"), name = btn.dataset.name;
    const body = { action: "office_save_agent", name, active: field(f, "oa-active").checked, prompt: field(f, "oa-prompt").value, directions: field(f, "oa-dirs").value,
      hours: name === "الباحث" ? null : readHours(f, "oa") };
    if (await officeSend(btn, body, "حُفظت إعدادات " + name)) state.officeEdit = "";
    return renderOfficeView();
  }
  if (act === "reset-agent") {
    if (!confirm("إرجاع تعليمات " + btn.dataset.name + " وتوجيهاته وساعاته إلى الأصل؟")) return;
    if (await officeSend(btn, { action: "office_reset_agent", name: btn.dataset.name }, "أُعيد " + btn.dataset.name + " إلى الأصل")) state.officeEdit = "";
    return renderOfficeView();
  }
  if (act === "new-task") { state.officeTaskEdit = "new"; return renderOfficeView(); }
  if (act === "edit-task") { state.officeTaskEdit = btn.dataset.id; return renderOfficeView(); }
  if (act === "cancel-task") { state.officeTaskEdit = ""; return renderOfficeView(); }
  if (act === "save-task") {
    const f = formOf("[data-task-form]"), id = f.dataset.taskForm;
    const task = { id: id === "new" ? undefined : id, agent: field(f, "ot-agent").value, task: field(f, "ot-task").value, days: readDays(f, "ot"),
      hour: Number(field(f, "ot-hour").value), enabled: field(f, "ot-enabled").checked };
    if (await officeSend(btn, { action: "office_task_save", task }, "حُفظت المهمة المجدولة")) state.officeTaskEdit = "";
    return renderOfficeView();
  }
  if (act === "delete-task") {
    if (!confirm("حذف هذه المهمة المجدولة؟")) return;
    return officeSend(btn, { action: "office_task_delete", id: btn.dataset.id }, "حُذفت المهمة");
  }
  if (act === "run-task") {
    const stop = busy(btn, "الوكيل يعمل");
    try {
      const data = await api({ action: "office_task_run", id: btn.dataset.id });
      acceptOffice(data);
      toast("اكتملت المهمة " + data.run.taskId + " وظهرت في سجل المهام", "ok");
      refresh({ quiet: true });
    } catch (e) { toast(officeError(e), "bad"); }
    finally { stop(); renderOfficeView(); }
    return;
  }
  if (act === "save-office") {
    const f = formOf("[data-office-form]");
    return officeSend(btn, { action: "office_save_office", directions: field(f, "oo-dirs").value, defaultHours: readHours(f, "oo"), enforceManual: field(f, "oo-manual").checked }, "حُفظت توجيهات المكتب وساعاته");
  }
  if (act === "save-auto") {
    const f = formOf("[data-auto-form]");
    return officeSend(btn, { action: "office_save_automation",
      news: { enabled: field(f, "oz-news").checked, everyHours: Number(field(f, "oz-every").value) },
      weekly: { enabled: field(f, "oz-weekly").checked, day: Number(field(f, "oz-day").value), hour: Number(field(f, "oz-hour").value) } }, "حُفظت الأتمتة وحُدّثت المشغلات");
  }
  if (act === "save-brand") {
    const f = formOf("[data-brand-form]");
    return officeSend(btn, { action: "office_save_brand", brand: btn.dataset.brand, look: f.querySelector("[data-brand-look]").value }, "حُفظت هوية " + btn.dataset.brand);
  }
}

// ---------------- تعديل تصميم منشور ونسخة X ----------------
function designEditForm(id, d, tweet) {
  const sel = (fid, opts, v) => `<select class="input" id="${fid}">${opts.map(x => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
  const inp = (fid, label, v, max) => `<label class="lbl" for="${fid}">${label}</label><input class="input" id="${fid}" maxlength="${max}" value="${esc(v || "")}">`;
  const pts = d.points || [];
  return `<div class="office-form" data-design-form="${esc(id)}">
    <div class="row-actions">${sel("de-brand", Object.keys(BRANDS), d.brand)}${sel("de-template", ["عنوان", "رقم", "نقاط"], d.template)}</div>
    ${inp("de-headline", "العنوان", d.headline, 70)}${inp("de-subline", "السطر الداعم", d.subline, 120)}
    ${inp("de-figure", "الرقم (لقالب الرقم، ويجب أن يكون في المنشور)", d.figure, 14)}${inp("de-figureLabel", "وصف الرقم", d.figureLabel, 40)}
    ${[0, 1, 2].map(i => inp("de-p" + i, "نقطة " + (i + 1), pts[i], 50)).join("")}
    ${inp("de-cta", "الدعوة", d.cta, 30)}
    <label class="lbl" for="de-tweet">نسخة X</label><textarea class="field" id="de-tweet" rows="3" maxlength="1000">${esc(tweet || "")}</textarea>
    <p class="hint">الأرقام يجب أن تكون موجودة في نص المنشور. الحفظ لا يغيّر حالة المنشور.</p>
    <div class="row-actions">${`<button type="button" class="btn btn-primary sm" data-dsave="${esc(id)}"><span class="lbl-text">حفظ التصميم</span></button>`}<button type="button" class="btn btn-line sm" data-dedit=""><span class="lbl-text">إلغاء</span></button></div>
  </div>`;
}

async function saveDesignEdit(btn) {
  const id = btn.dataset.dsave, f = btn.closest("[data-design-form]");
  const v = k => field(f, "de-" + k).value.trim();
  const design = { template: v("template"), headline: v("headline"), subline: v("subline"), figure: v("figure"), figureLabel: v("figureLabel"),
    points: [v("p0"), v("p1"), v("p2")].filter(Boolean), cta: v("cta") };
  const row = state.content.find(r => r[0] === id), old = row && parseDesign(row[12]);
  if (old && old.background) design.background = old.background;
  const stop = busy(btn, "جاري الحفظ");
  try {
    const data = await api({ action: "content_design_update", id, version: state.contentVersions[id] || "", brand: v("brand"), design, tweet: field(f, "de-tweet").value });
    const at = state.content.findIndex(r => r[0] === id);
    if (data.item && at >= 0) state.content[at] = data.item;
    if (data.version) state.contentVersions[id] = data.version;
    state.designEditId = "";
    toast("حُفظ التصميم ونسخة X", "ok");
  } catch (e) { toast(officeError(e), "bad"); }
  finally { stop(); renderContentView(); }
}
