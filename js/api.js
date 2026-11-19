"use strict";
// الاتصال بخادم Google Apps Script

// ---------------- الاتصال بالخادم ----------------
// كل الطلبات POST حتى القراءة (action: "list")، فلا يظهر الرمز في الرابط أو سجل المتصفح
async function api(body) {
  if (!state.url) throw new Error("أضف رابط الخادم من الإعدادات أولاً");
  if (!hasAuth()) { if (state.idToken) promptGoogle(); throw new Error(state.idToken ? "انتهت جلسة Google؛ سجّل الدخول مجدداً." : "سجّل الدخول بحساب Google أو أدخل رمز ACCESS_TOKEN في الإعدادات"); }
  const reading = ["dashboard", "list", "content_page", "research_status"].includes(body.action);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), reading || ["research_start", "research_import"].includes(body.action) ? 45000 : 390000);
  const url = state.url, token = state.token, idToken = googleUser() ? state.idToken : undefined;
  try {
    let res;
    try {
      res = await fetch(url, { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: token || undefined, idToken }) });
    } catch (e) {
      const message = e.name === "AbortError" ? "انتهت مهلة انتظار الخادم." : "تعذر الوصول للخادم. تحقق من الرابط وإعدادات النشر.";
      throw new Error(message + (reading ? " أعد التحديث." : " قد تكون العملية اكتملت؛ حدّث البيانات قبل إعادة إرسالها لتجنب التكرار."));
    }
    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error("رد غير متوقع من الخادم (" + res.status + "). تحقق من رابط /exec." + (reading ? "" : " حدّث البيانات قبل إعادة العملية.")); }
    if (!data || data.status !== "success") {
      const error = new Error((data && data.message) || "حدث خطأ في الخادم");
      error.code = data && data.code;
      if (error.code === "AUTH_EXPIRED" && idToken) { setIdToken(""); promptGoogle(); }
      throw error;
    }
    return data;
  } finally { clearTimeout(timer); }
}
