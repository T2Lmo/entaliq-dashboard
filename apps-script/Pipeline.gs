/**
 * Pipeline.gs — مسار المبيعات: كل صفقة من أول اهتمام حتى الربح أو الخسارة، بقيمتها وخطوتها القادمة وموعدها.
 *
 * - المراحل: مهتم ← اجتماع ← زيارة ودراسة ← عرض مرسل ← تفاوض ← ربحنا / خسرنا. لكل مرحلة احتمال افتراضي يُحسب به «المتوقع».
 * - تُنشأ الصفقات تلقائياً (بلا تكرار) من:
 *   - ردود مازن «مهتم» و«يطلب معلومات» (Prospects.gs)،
 *   - منافسات بدر «نجهز العرض» و«قُدّم» (Tenders.gs) وتتبع حالتها (فزنا/لم نفز)،
 *   - عروض صيانة الطاقة الشمسية (Contracts.gs) وتتبع حالتها (أُرسل/ساري/مرفوض)؛ والعرض المعمول لمنشأة ردّت يُربط بصفقتها.
 *   المزامنة تقدّم المرحلة فقط ولا ترجعها، ولا تمس صفقة أغلقتها بنفسك.
 * - تضيف صفقة يدوياً، وتحرّك مرحلتها، وتحدد خطوتها القادمة وموعدها، وتغلقها بربح أو خسارة مع السبب. كل حركة في سجل الصفقة وسجل المكتب.
 * - الأرقام تُحسب هنا من السجل مباشرة: المفتوحة وقيمتها، والمتوقع (القيمة × الاحتمال)، وربح الشهر، ونسبة الفوز، وخطوات اليوم والمتأخرة والراكدة.
 * - تظهر خطوات اليوم في ملخص الصباح، وخلاصة المسار في ملخص راكان التنفيذي، ويجيب راكان بالصوت: «وش الصفقات اللي تنتظرني؟».
 *
 * يعتمد على Office.gs: officeProps_, officeLog_, officeBy_, officeApply_ — ويستخدم إن وُجد: prospectsAll_, tendersAll_, contractsAll_
 */

const PIPE_ = {
  sheet: "Deals",
  fields: [["id", "ID"], ["at", "التاريخ"], ["company", "المنشأة"], ["contact", "جهة الاتصال"], ["email", "البريد"], ["phone", "الجوال"], ["city", "المدينة"],
    ["sector", "القطاع"], ["service", "الخدمة"], ["source", "المصدر"], ["sourceId", "مرجع المصدر"], ["contractId", "عرض الصيانة"], ["stage", "المرحلة"],
    ["value", "القيمة التقديرية"], ["prob", "الاحتمال"], ["nextStep", "الخطوة التالية"], ["nextAt", "موعدها"], ["note", "ملاحظات"], ["history", "السجل"],
    ["lostReason", "سبب الخسارة"], ["closedAt", "تاريخ الإغلاق"], ["updated", "آخر تحديث"]],
  dates: ["at", "closedAt", "updated"],
  stages: ["مهتم", "اجتماع", "زيارة ودراسة", "عرض مرسل", "تفاوض", "ربحنا", "خسرنا"],
  open: ["مهتم", "اجتماع", "زيارة ودراسة", "عرض مرسل", "تفاوض"],
  prob: { "مهتم": 10, "اجتماع": 25, "زيارة ودراسة": 40, "عرض مرسل": 60, "تفاوض": 80, "ربحنا": 100, "خسرنا": 0 },
  lostReasons: ["السعر", "اختاروا منافساً", "ليس الآن", "لا توجد ميزانية", "لا رد", "غير مناسب", "أخرى"],
  sources: ["مازن", "بدر", "عرض صيانة", "يدوي", "الموقع"],
  staleDays: 14, listed: 400, maxText: 500, day: 86400000
};

// ---------------- الورقة ----------------
function pipeSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PIPE_.sheet);
  const headers = PIPE_.fields.map(f => f[1]);
  if (!sh) { sh = ss.insertSheet(PIPE_.sheet); sh.appendRow(headers); sh.setFrozenRows(1); return sh; }
  if (sh.getLastRow() >= 1) {
    const have = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    if (have.some((h, i) => String(h) !== headers[i])) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function pipeAll_() {
  const sh = pipeSheet_(), n = PIPE_.fields.length;
  if (sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().map((r, i) => {
    const d = { row: i + 2 };
    PIPE_.fields.forEach(([k], j) => {
      const v = r[j];
      if (PIPE_.dates.indexOf(k) >= 0) { const t = v instanceof Date ? v : null; d[k] = t ? Utilities.formatDate(t, tz, "yyyy-MM-dd HH:mm") : ""; d[k + "Ms"] = t ? t.getTime() : 0; }
      else if (k === "nextAt") { d[k] = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "").slice(0, 10); }
      else if (k === "value" || k === "prob") d[k] = v === "" || v === null || v === undefined ? null : Number(v);
      else if (k === "history") { try { d[k] = JSON.parse(String(v || "[]")); } catch (e) { d[k] = []; } }
      else d[k] = v === undefined || v === null ? "" : String(v);
    });
    return d;
  }).filter(d => d.id);
}

function pipeWrite_(d, patch) {
  const sh = pipeSheet_();
  Object.assign(d, patch, { updated: new Date() });
  // تاريخ يُمسح ("") أو يُضبط (Date) في هذا التعديل يغلب المحفوظ
  PIPE_.dates.forEach(k => { if (k in patch) d[k + "Ms"] = patch[k] instanceof Date ? patch[k].getTime() : 0; });
  const row = PIPE_.fields.map(([k]) => {
    const v = d[k];
    if (k === "history") return JSON.stringify(v || []).slice(0, 45000);
    if (PIPE_.dates.indexOf(k) >= 0) return v instanceof Date ? v : (d[k + "Ms"] ? new Date(d[k + "Ms"]) : "");
    return v === null || v === undefined ? "" : v;
  });
  if (d.row) sh.getRange(d.row, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); d.row = sh.getLastRow(); }
  return d;
}

function pipeNew_(f, by) {
  const now = new Date(), stage = PIPE_.stages.indexOf(f.stage) >= 0 ? f.stage : "مهتم";
  const d = Object.assign({ company: "", contact: "", email: "", phone: "", city: "", sector: "", service: "", source: "يدوي", sourceId: "", contractId: "",
    value: null, nextStep: "", nextAt: "", note: "", lostReason: "" }, f, {
    id: "DEAL-" + Utilities.getUuid().slice(0, 8).toUpperCase(), at: now, stage: stage, prob: PIPE_.prob[stage],
    history: [{ at: Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"), to: stage, note: f.source && f.source !== "يدوي" ? "من " + f.source : "", by: by || "آلي" }],
    closedAt: PIPE_.open.indexOf(stage) < 0 ? now : ""
  });
  return pipeWrite_(d, {});
}

// ---------------- المزامنة من مازن وبدر وعروض الصيانة ----------------
function pipeMove_(d, stage, note, by, extra) {
  if (d.stage === stage && !extra) return false;
  const tz = Session.getScriptTimeZone(), now = new Date();
  const hist = (d.history || []).concat(d.stage === stage ? [] : [{ at: Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm"), from: d.stage, to: stage, note: note || "", by: by || "آلي" }]);
  const closed = PIPE_.open.indexOf(stage) < 0;
  // الصفقة المغلقة لا خطوة قادمة لها
  pipeWrite_(d, Object.assign({ stage: stage, prob: PIPE_.prob[stage], history: hist.slice(-60), closedAt: closed ? (d.closedAtMs ? new Date(d.closedAtMs) : now) : "" },
    closed ? { nextStep: "", nextAt: "" } : {}, extra || {}));
  return true;
}
// الخطوات التي كتبتها المزامنة نفسها (تُستبدل بالمتابعة حين يتقدم المصدر، وما كتبته أنت يبقى)
const PIPE_AUTO_STEP_ = /^(?:رد على اهتمامهم|أرسل المعلومات المطلوبة|أرسل العرض للعميل|جهّز العرض قبل)/;
const pipeRank_ = s => PIPE_.stages.indexOf(s) >= 5 ? 99 : PIPE_.stages.indexOf(s);

function pipeSync_() {
  const all = pipeAll_(), out = { created: 0, moved: 0 };
  const bySource = {};
  all.forEach(d => { if (d.sourceId) bySource[d.source + ":" + d.sourceId] = d; if (d.contractId) bySource["عرض صيانة:" + d.contractId] = d; });
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  // التقديم فقط: لا ترجع مرحلة، ولا تُمس صفقة مغلقة. onMove يُطبَّق عند التقدم، وalways (ربط العرض وقيمته) في كل الأحوال
  const forward = (d, stage, note, onMove, always) => {
    if (PIPE_.open.indexOf(d.stage) < 0) return;
    if (pipeRank_(stage) <= pipeRank_(d.stage) && PIPE_.open.indexOf(stage) >= 0) { if (always) pipeWrite_(d, always); return; }
    if (pipeMove_(d, stage, note, "آلي", Object.assign({}, always || {}, onMove || {}))) out.moved++;
  };
  const follow = (d, step, at) => PIPE_AUTO_STEP_.test(d.nextStep || "") || !d.nextStep ? { nextStep: step, nextAt: at } : null;
  if (typeof prospectsAll_ === "function") {
    prospectsAll_().filter(p => ["مهتم", "يطلب معلومات"].indexOf(p.replyKind) >= 0).forEach(p => {
      if (bySource["مازن:" + p.id]) return;
      bySource["مازن:" + p.id] = pipeNew_({ company: p.company, contact: String(p.replyFrom || "").replace(/\s*<[^>]*>\s*$/, "").slice(0, 120), email: p.email, city: p.city, sector: p.sector,
        service: p.service, source: "مازن", sourceId: p.id, note: String(p.replySummary || "").slice(0, PIPE_.maxText),
        nextStep: p.replyKind === "يطلب معلومات" ? "أرسل المعلومات المطلوبة واقترح اجتماعاً" : "رد على اهتمامهم واقترح اجتماعاً", nextAt: today }, "آلي");
      out.created++;
    });
  }
  if (typeof tendersAll_ === "function") {
    const map = { "نجهز العرض": "زيارة ودراسة", "قُدّم": "عرض مرسل", "فزنا": "ربحنا", "لم نفز": "خسرنا" };
    tendersAll_().filter(t => map[t.status]).forEach(t => {
      const d = bySource["بدر:" + t.id], stage = map[t.status];
      if (!d) {
        if (stage === "ربحنا" || stage === "خسرنا") return; // لا ننشئ صفقة لما انتهى قبل أن يدخل المسار
        bySource["بدر:" + t.id] = pipeNew_({ company: t.entity || t.title, city: t.city, service: String(t.services || t.title).slice(0, 200), source: "بدر", sourceId: t.id,
          value: t.value || null, stage: stage, note: String(t.title).slice(0, PIPE_.maxText), nextStep: stage === "عرض مرسل" ? "تابع نتيجة المنافسة" : "جهّز العرض قبل " + (t.bidsBy || "الموعد"),
          nextAt: stage === "عرض مرسل" ? "" : String(t.bidsBy || "").slice(0, 10) }, "آلي");
        out.created++;
      } else forward(d, stage, "من بدر: " + t.status, stage === "خسرنا" ? { lostReason: "اختاروا منافساً" } : stage === "عرض مرسل" ? follow(d, "تابع نتيجة المنافسة", "") : null);
    });
  }
  if (typeof contractsAll_ === "function") {
    const map = { "عرض مسودة": "زيارة ودراسة", "أُرسل العرض": "عرض مرسل", "ساري": "ربحنا", "مرفوض": "خسرنا", "ملغى": "خسرنا" };
    contractsAll_().filter(c => map[c.status] && !c.renewedFrom).forEach(c => {
      const value = c.annual ? Math.round(Number(c.annual) * Math.max(1, Number(c.termMonths) || 12) / 12) : null;
      let d = bySource["عرض صيانة:" + c.id] || (c.source ? bySource["مازن:" + c.source] : null);
      const stage = map[c.status];
      if (!d) {
        if (stage === "ربحنا" || stage === "خسرنا") return;
        bySource["عرض صيانة:" + c.id] = pipeNew_({ company: c.client, city: c.city, service: "صيانة وتشغيل الطاقة الشمسية", source: "عرض صيانة", sourceId: c.id, contractId: c.id,
          value: value, stage: stage, nextStep: stage === "عرض مرسل" ? "تابع رد العميل على العرض" : "أرسل العرض للعميل", nextAt: today }, "آلي");
        out.created++;
        return;
      }
      const link = d.contractId ? {} : { contractId: c.id };
      if (value && !d.value) link.value = value;
      forward(d, stage, "من عرض الصيانة: " + c.status,
        stage === "خسرنا" ? { lostReason: "السعر" } : stage === "عرض مرسل" ? follow(d, "تابع رد العميل على العرض", today) : stage === "زيارة ودراسة" ? follow(d, "أرسل العرض للعميل", today) : null,
        Object.keys(link).length ? link : null);
    });
  }
  return out;
}

// ---------------- الأرقام ----------------
function pipeStats_(all) {
  const now = Date.now(), tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const month = today.slice(0, 7), since90 = now - 90 * PIPE_.day;
  const open = all.filter(d => PIPE_.open.indexOf(d.stage) >= 0);
  const by = {};
  PIPE_.stages.forEach(s => { by[s] = { n: 0, value: 0 }; });
  all.forEach(d => { if (by[d.stage]) { by[d.stage].n++; by[d.stage].value += d.value || 0; } });
  const won = all.filter(d => d.stage === "ربحنا"), lost = all.filter(d => d.stage === "خسرنا");
  const wonMonth = won.filter(d => String(d.closedAt).slice(0, 7) === month);
  const closed90 = won.concat(lost).filter(d => d.closedAtMs >= since90);
  return {
    open: open.length, openValue: open.reduce((s, d) => s + (d.value || 0), 0),
    weighted: Math.round(open.reduce((s, d) => s + (d.value || 0) * (d.prob === null ? PIPE_.prob[d.stage] : d.prob) / 100, 0)),
    noValue: open.filter(d => !d.value).length,
    wonMonth: wonMonth.length, wonMonthValue: wonMonth.reduce((s, d) => s + (d.value || 0), 0),
    winRate: closed90.length ? Math.round(100 * closed90.filter(d => d.stage === "ربحنا").length / closed90.length) : null,
    due: open.filter(d => d.nextAt && d.nextAt <= today).length, overdue: open.filter(d => d.nextAt && d.nextAt < today).length,
    stale: open.filter(d => d.updatedMs && now - d.updatedMs > PIPE_.staleDays * PIPE_.day).length,
    noStep: open.filter(d => !d.nextStep).length, byStage: by, today: today
  };
}

const pipeMoney_ = n => Math.round(Number(n) || 0).toLocaleString("en-US");

// خطوات اليوم والمتأخرة (للملخص الصباحي وراكان والصوت)
function pipeDue_(all) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return all.filter(d => PIPE_.open.indexOf(d.stage) >= 0 && d.nextAt && d.nextAt <= today).sort((a, b) => a.nextAt < b.nextAt ? -1 : 1)
    .map(d => ({ id: d.id, company: d.company, step: d.nextStep || "حدد الخطوة القادمة", at: d.nextAt, late: d.nextAt < today, stage: d.stage, value: d.value }));
}

// خلاصة لملخص راكان التنفيذي ومرجع مهامه
function pipelineBrief_() {
  try {
    const all = pipeAll_();
    if (!all.length) return "";
    const s = pipeStats_(all), due = pipeDue_(all);
    const lines = ["- مسار المبيعات: مفتوحة " + s.open + " بقيمة " + pipeMoney_(s.openValue) + " ريال (المتوقع " + pipeMoney_(s.weighted) + ")"
      + " · ربحنا هذا الشهر " + s.wonMonth + " بقيمة " + pipeMoney_(s.wonMonthValue) + (s.winRate !== null ? " · نسبة الفوز 90 يوماً " + s.winRate + "%" : "")
      + " · خطوات حان موعدها " + s.due + " (متأخرة " + s.overdue + ") · راكدة +" + PIPE_.staleDays + " يوماً " + s.stale];
    due.slice(0, 5).forEach(x => lines.push("  - " + (x.late ? "متأخرة " : "اليوم ") + x.at + ": " + x.company + " — " + x.step + " (" + x.stage + ")"));
    return lines.join("\n");
  } catch (e) { return ""; }
}

// ---------------- الإجراءات ----------------
function pipeClean_(v, max) { return String(v === undefined || v === null ? "" : v).trim().slice(0, max || 200); }

function pipeSave_(f, by) {
  const deal = f || {};
  const fields = { company: pipeClean_(deal.company, 160), contact: pipeClean_(deal.contact, 120), email: pipeClean_(deal.email, 160), phone: pipeClean_(deal.phone, 40),
    city: pipeClean_(deal.city, 60), sector: pipeClean_(deal.sector, 80), service: pipeClean_(deal.service, 200), nextStep: pipeClean_(deal.nextStep, 300),
    nextAt: pipeClean_(deal.nextAt, 10), note: pipeClean_(deal.note, PIPE_.maxText) };
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw appError_("VALIDATION_ERROR", "البريد غير صالح");
  if (fields.nextAt && !/^\d{4}-\d{2}-\d{2}$/.test(fields.nextAt)) throw appError_("VALIDATION_ERROR", "موعد الخطوة بصيغة غير صالحة");
  const value = deal.value === "" || deal.value === null || deal.value === undefined ? null : Number(deal.value);
  if (value !== null && !(value >= 0 && value < 1e10)) throw appError_("VALIDATION_ERROR", "القيمة غير صالحة");
  if (!deal.id) {
    if (!fields.company) throw appError_("VALIDATION_ERROR", "اكتب اسم المنشأة");
    const d = pipeNew_(Object.assign(fields, { value: value, source: PIPE_.sources.indexOf(deal.source) >= 0 ? deal.source : "يدوي", stage: deal.stage }), by);
    officeLog_("صفقة جديدة", "", d.company + (value ? " — " + pipeMoney_(value) + " ريال" : ""), by);
    return d;
  }
  const d = pipeAll_().find(x => x.id === deal.id);
  if (!d) throw appError_("NOT_FOUND", "الصفقة غير موجودة");
  const patch = {};
  Object.keys(fields).forEach(k => { if (deal[k] !== undefined) patch[k] = fields[k]; });
  if (deal.value !== undefined) patch.value = value;
  if (patch.company === "") throw appError_("VALIDATION_ERROR", "اسم المنشأة مطلوب");
  pipeWrite_(d, patch);
  return d;
}

function pipeStage_(data, by) {
  const d = pipeAll_().find(x => x.id === data.id);
  if (!d) throw appError_("NOT_FOUND", "الصفقة غير موجودة");
  const stage = String(data.stage || "");
  if (PIPE_.stages.indexOf(stage) < 0) throw appError_("VALIDATION_ERROR", "مرحلة غير معروفة");
  const extra = {};
  if (stage === "خسرنا") extra.lostReason = PIPE_.lostReasons.indexOf(data.lostReason) >= 0 ? data.lostReason : "أخرى";
  if (PIPE_.open.indexOf(stage) >= 0) { extra.lostReason = ""; extra.closedAt = ""; }
  if (data.nextStep !== undefined) extra.nextStep = pipeClean_(data.nextStep, 300);
  if (data.nextAt !== undefined) { const n = pipeClean_(data.nextAt, 10); if (n && !/^\d{4}-\d{2}-\d{2}$/.test(n)) throw appError_("VALIDATION_ERROR", "موعد الخطوة بصيغة غير صالحة"); extra.nextAt = n; }
  if (stage === "ربحنا" || stage === "خسرنا") { extra.nextStep = ""; extra.nextAt = ""; }
  if (data.value !== undefined && data.value !== "") { const v = Number(data.value); if (v >= 0) extra.value = v; }
  const note = pipeClean_(data.note, 300) + (stage === "خسرنا" ? (data.note ? " · " : "") + "السبب: " + extra.lostReason : "");
  if (d.stage === stage) { pipeWrite_(d, extra); return d; }
  if (PIPE_.open.indexOf(stage) >= 0 && PIPE_.open.indexOf(d.stage) < 0) extra.closedAt = "";
  pipeMove_(d, stage, note, by, extra);
  if (PIPE_.open.indexOf(stage) < 0) d.closedAtMs = Date.now();
  officeLog_(stage === "ربحنا" ? "ربحنا صفقة" : stage === "خسرنا" ? "خسرنا صفقة" : "تحريك صفقة", "", d.company + " ← " + stage + (d.value ? " — " + pipeMoney_(d.value) + " ريال" : "") + (note ? " · " + note : ""), by);
  return d;
}

function pipeState_() {
  const all = pipeAll_();
  const items = all.slice(-PIPE_.listed).reverse().map(d => { const x = Object.assign({}, d); delete x.row; return x; });
  return { status: "success", items: items, stats: pipeStats_(all), due: pipeDue_(all),
    cfg: { stages: PIPE_.stages, open: PIPE_.open, prob: PIPE_.prob, lostReasons: PIPE_.lostReasons, staleDays: PIPE_.staleDays } };
}

function handlePipelineAction_(data, user) {
  try {
    officeApply_();
    const by = officeBy_(user), a = data.action;
    let extra = {};
    if (a === "pipeline_get") { const lock = LockService.getScriptLock(); lock.waitLock(20000); try { extra.sync = pipeSync_(); } finally { lock.releaseLock(); } }
    else if (a === "pipeline_save") extra.saved = pipeSave_(data.deal, by).id;
    else if (a === "pipeline_stage") extra.saved = pipeStage_(data, by).id;
    else throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
    return json_(Object.assign(pipeState_(), extra));
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
