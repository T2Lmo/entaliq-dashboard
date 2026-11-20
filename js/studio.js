"use strict";
// استوديو المحتوى (Studio.gs): الوكلاء يكملون المنشورات كاملة (كتابة، تدقيق، تصميم، نسخة X)، وأنت تعتمد أو ترفض فقط

async function runStudioNow(btn) {
  if (!state.url) { openSettings(); return; }
  if (state.contentBusy || state.contentPageLoading) { toast("انتظر حتى تكتمل العملية الحالية", "warn"); return; }
  state.contentBusy = true;
  const stop = busy(btn, "الوكلاء يكملون");
  toast("لمى تكتب الأفكار ويدققها سالم، وريم تصمم، وزياد يكتب نسخة X؛ قد يستغرق دقيقتين إلى أربع.", "none");
  try {
    const data = await api({ action: "studio_run" });
    toast(data.message, data.failed ? "warn" : "ok");
    if (data.warnings && data.warnings.length) contentFeedback("ملاحظات الاستوديو:\n" + data.warnings.join("\n"), "warn");
    await refresh({ quiet: true });
  } catch (e) { toast(officeError(e), "bad"); }
  finally { state.contentBusy = false; stop(); if (state.view === "content") renderContentView(); }
}
