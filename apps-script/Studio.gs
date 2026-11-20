/**
 * Studio.gs — استوديو المحتوى: الوكلاء ينفذون المنشورات كاملة، وأنت تعتمد أو ترفض فقط.
 *
 * - كل دورة: لمى تكتب الأفكار التي لم تُكتب بعد (ويدققها سالم)، ثم ريم تصمم وزياد يكتب نسخة X لكل منشور بلا تجهيز.
 *   يصل المنشور إلى «للمراجعة» جاهزاً بنصه وتصميمه ونسخة X؛ عليك الاعتماد أو الرفض (أو طلب إعادة الكتابة بملاحظة).
 * - أسلوب سعودي إبداعي للمى وزياد، والتزام صارم بهويتي انطلق ووهج لريم: يُضاف لتعليماتهم في officeSystemFor_ (Office.gs).
 * - المشغل: كل N ساعات (إدارة المكتب ← الأتمتة والهوية)، ويعمل فقط وفريق المحتوى (لمى، سالم، ريم، زياد) في دوامه.
 * - ما يتعثر مرتين (مثل خبر بلا مصدر محفوظ) يُتخطى ويبقى لك لتكمله يدوياً.
 *
 * يعتمد على Code.gs: setupSheets, CONTENT_HEADERS, contentRow_, contentItem_, contentVersion_, rewriteContent_, prepareContent_,
 *   executionDeadline_, PLAN_BUDGET_MS, appError_, json_
 * ويعتمد على Office.gs: officeLoad_, officeLog_, officeBy_, officeApply_, officeTeamReady_
 */

const STUDIO_ = {
  team: ["لمى", "سالم", "ريم", "زياد"],
  everyHours: [1, 2, 4, 6],
  maxFails: 2, failsKey: "STUDIO_FAILS",
  stepMs: 100000 // لا تبدأ خطوة جديدة إن بقي أقل من هذا من ميزانية التنفيذ
};

// ---------------- أسلوب الكتابة والتصميم ----------------
STUDIO_.style = {
  "لمى": "أسلوب الكتابة للسوق السعودي (التزمي به في كل منشور):\n"
    + "- اكتبي نصاً إبداعياً حياً بالعربية الفصحى المبسطة القريبة من القارئ السعودي، ومسموح بتعبير سعودي خفيف يناسب LinkedIn دون عامية ثقيلة.\n"
    + "- ابدئي بخطاف قوي في السطر الأول: سؤال، أو مشهد من الحياة اليومية في السعودية (حر الصيف في الرياض، فاتورة الكهرباء، المكيف طوال اليوم، رمضان، العودة للمدارس، مواسم الحج والعمرة، اليوم الوطني)، أو مفارقة تلفت الانتباه.\n"
    + "- نوّعي القالب بين المنشورات: قصة قصيرة، قبل وبعد، سؤال وجواب، نصائح مرقمة، خرافة وحقيقة، معلومة مفاجئة. لا تكرري افتتاحية أو بنية منشور سابق.\n"
    + "- اربطي الفكرة بواقع السوق السعودي واهتماماته: كفاءة الطاقة والاستدامة ضمن رؤية السعودية 2030، وتكاليف التشغيل، وراحة الساكن والنزيل والمريض. بلا ادعاءات أو أرقام غير موجودة في المدخلات.\n"
    + "- جمل قصيرة وفقرات من سطر أو سطرين، ووجه تعبيري أو اثنان على الأكثر، وخاتمة بدعوة واضحة للتواصل.\n"
    + "- صوت انطلق للشركات والجهات: هندسي رصين وواثق. صوت وهج للمنازل والأعمال: دافئ وقريب ومطمئن.",
  "زياد": "أسلوب X للسوق السعودي: تغريدة واحدة حية تشد من أول كلمات، بعربية قريبة من المغرد السعودي، بفكرة واحدة واضحة ودعوة قصيرة. "
    + "هاشتاق أو اثنان مناسبان للجمهور السعودي (مثل #كفاءة_الطاقة أو #الطاقة_الشمسية أو #رؤية_2030 حين تنطبق). لا تضف معلومة أو رقماً غير موجود في المنشور.",
  "ريم": "الهوية (التزام صارم في كل تصميم):\n"
    + "- لكل منشور هوية واحدة فقط من هويتي المكتب: «انطلق» أو «وهج» كما حددها النظام. لا تخلطي بين الهويتين، ولا تبتكري هوية ثالثة أو ألواناً أو أسلوباً خارجها.\n"
    + "- انطلق: هندسية رصينة للشركات والجهات، كحلي داكن مع فيروزي وخطوط معمارية دقيقة؛ عنوان واثق ومباشر.\n"
    + "- وهج: دافئة ومطمئنة للمنازل والأعمال، كحلي مع ذهبي وكهرماني وشمس مشرقة؛ عنوان قريب ومتفائل، وشعارها «طاقة أنظف. حياة أكثر إشراقًا.» حين يناسب.\n"
    + "- منتجات انطلق (أثر وساعد) تُصمم بهوية انطلق.\n"
    + "- الخلفية (background): مشهد سعودي واقعي يناسب الهوية بلا أي نص أو شعارات، مثل أفق الرياض، مبنى حديث، سطح منزل بألواح شمسية تحت شمس الخليج، فندق أو مستشفى حديث، وبألوان الهوية نفسها."
};

function studioStyleFor_(agent) { return STUDIO_.style[agent] || ""; }

// ---------------- الدورة ----------------
function studioCfg_() {
  const c = (officeLoad_().cfg.automation || {}).studio || {};
  return { enabled: c.enabled !== false, everyHours: STUDIO_.everyHours.indexOf(Number(c.everyHours)) >= 0 ? Number(c.everyHours) : 1, perRun: Math.min(4, Math.max(1, Number(c.perRun) || 2)) };
}

// المنشورات التي تنتظر الوكلاء: أفكار بلا نص، ومنشورات بنص بلا تصميم أو نسخة X (الأقدم أولاً)
function studioPending_(sheet) {
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, CONTENT_HEADERS.length).getValues() : [];
  const write = [], prepare = [];
  rows.forEach(r => {
    const id = String(r[0] || ""), status = String(r[9] || ""), text = String(r[7] || "").trim();
    if (!id) return;
    if (status === "فكرة" && !text) write.push(id);
    else if ((status === "مسودة" || status === "معتمد") && text && (!String(r[12] || "").trim() || !String(r[13] || "").trim())) prepare.push(id);
  });
  return { write: write, prepare: prepare };
}

function studioStep_(ss, sheet, id, kind) {
  const data = { id: id, version: contentVersion_(contentItem_(sheet, contentRow_(sheet, id))) };
  return kind === "write" ? rewriteContent_(ss, data) : prepareContent_(ss, data);
}

function studioRun_(by, auto) {
  const ss = setupSheets(), sheet = ss.getSheetByName("Content"), props = PropertiesService.getScriptProperties();
  const cfg = studioCfg_(), fails = (() => { try { return JSON.parse(props.getProperty(STUDIO_.failsKey) || "{}"); } catch (e) { return {}; } })();
  const pending = studioPending_(sheet);
  const result = { written: 0, prepared: 0, failed: 0, skipped: 0, pending: 0, warnings: [] };
  const queue = pending.write.map(id => ({ id: id, write: true })).concat(pending.prepare.map(id => ({ id: id, write: false })));
  const stop = code => ["BUDGET_EXCEEDED", "OFF_DUTY", "OFF_HOURS", "WORKER_OFFLINE"].indexOf(code) >= 0;
  let done = 0, halted = false;
  for (const item of queue) {
    if (done >= cfg.perRun || halted) break;
    if ((fails[item.id] || 0) >= STUDIO_.maxFails) { result.skipped++; continue; }
    if (executionDeadline_ && Date.now() + STUDIO_.stepMs > executionDeadline_) break;
    try {
      if (item.write) { studioStep_(ss, sheet, item.id, "write"); result.written++; }
      if (!item.write || !executionDeadline_ || Date.now() + STUDIO_.stepMs < executionDeadline_) {
        const p = studioStep_(ss, sheet, item.id, "prepare");
        (p.warnings || []).forEach(w => result.warnings.push(item.id + ": " + w));
        result.prepared++;
      }
      delete fails[item.id];
      done++;
    } catch (err) {
      result.failed++;
      result.warnings.push(item.id + ": " + String(err.message || err).slice(0, 200));
      if (stop(err.code)) halted = true; else fails[item.id] = (fails[item.id] || 0) + 1;
    }
  }
  props.setProperty(STUDIO_.failsKey, JSON.stringify(fails));
  const after = studioPending_(sheet);
  result.pending = after.write.length + after.prepare.length;
  if (result.written || result.prepared || result.failed || !auto)
    officeLog_("استوديو المحتوى", "لمى، ريم، زياد", "كُتب: " + result.written + " · جُهّز: " + result.prepared + " · تعذر: " + result.failed + " · متبقٍ: " + result.pending
      + (result.skipped ? " · متروك لك بعد تعثره: " + result.skipped : ""), by || "آلي");
  return result;
}

// ---------------- المشغل والإجراءات ----------------
function officeRunStudio() {
  if (!studioCfg_().enabled || !officeTeamReady_(STUDIO_.team)) return;
  executionDeadline_ = Date.now() + PLAN_BUDGET_MS;
  const sheet = setupSheets().getSheetByName("Content"), p = studioPending_(sheet);
  if (!p.write.length && !p.prepare.length) return; // لا شيء ينتظر الوكلاء: لا استدعاء ولا سجل
  try { studioRun_("آلي", true); }
  catch (err) { officeLog_("تعذر استوديو المحتوى", "لمى", String(err.message || err).slice(0, 300), "آلي"); }
}

function handleStudioAction_(data, user) {
  try {
    officeApply_();
    if (data.action === "studio_status") {
      const p = studioPending_(setupSheets().getSheetByName("Content"));
      return json_({ status: "success", pending: { write: p.write.length, prepare: p.prepare.length }, cfg: studioCfg_() });
    }
    if (data.action === "studio_run") {
      executionDeadline_ = Date.now() + 270000;
      const r = studioRun_(officeBy_(user), false);
      return json_(Object.assign({ status: "success" }, r, { message: "كتبت لمى " + r.written + " · جهّزت ريم وزياد " + r.prepared + (r.failed ? " · تعذر " + r.failed : "") + " · متبقٍ " + r.pending }));
    }
    throw appError_("VALIDATION_ERROR", "إجراء غير معروف");
  } catch (err) {
    return json_({ status: "error", code: err.code || "REQUEST_FAILED", message: err.message });
  }
}
