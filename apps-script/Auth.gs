/**
 * Auth.gs — تسجيل الدخول بحساب Google للوحة مكتب انطلق.
 *
 * أضف هذا الملف إلى مشروع Apps Script، ثم في بداية doPost استبدل فحص ACCESS_TOKEN الحالي بـ:
 *
 *   const user = authorize_(body);   // يرمي خطأ إن لم يكن المستخدم مسموحاً
 *
 * Script Properties المطلوبة:
 *   GOOGLE_CLIENT_ID     معرّف عميل OAuth من Google Cloud (نوع Web application)
 *   ALLOWED_EMAILS       البريدات المسموح لها، مفصولة بفواصل: a@gmail.com,b@entaliq.sa
 *                        ويمكن السماح بنطاق كامل بكتابة @entaliq.sa
 *   ALLOW_SHARED_TOKEN   اختياري. اجعله false بعد أن يعمل الدخول بـ Google لإيقاف الرمز المشترك نهائياً.
 *   ACCESS_TOKEN         الرمز المشترك القديم (يبقى مقبولاً حتى تضبط ALLOW_SHARED_TOKEN=false)
 */

function authorize_(body) {
  const props = PropertiesService.getScriptProperties();
  if (body && body.idToken) {
    const email = verifyGoogleIdToken_(String(body.idToken), props.getProperty("GOOGLE_CLIENT_ID"));
    if (!isAllowedEmail_(email, props.getProperty("ALLOWED_EMAILS"))) throw authError_("FORBIDDEN", "البريد " + email + " غير مسموح له بالدخول.");
    return { email: email, via: "google" };
  }
  const shared = props.getProperty("ACCESS_TOKEN");
  const sharedAllowed = String(props.getProperty("ALLOW_SHARED_TOKEN") || "true").toLowerCase() !== "false";
  if (sharedAllowed && shared && body && body.token && safeEqual_(String(body.token), shared)) return { email: "", via: "token" };
  throw authError_("UNAUTHORIZED", sharedAllowed ? "سجّل الدخول بحساب Google أو أدخل رمز ACCESS_TOKEN الصحيح." : "سجّل الدخول بحساب Google.");
}

// يتحقق من رمز Google عبر نقطة tokeninfo (توقيع Google + الجمهور + الصلاحية)، ويخزّن النتيجة 5 دقائق
function verifyGoogleIdToken_(idToken, clientId) {
  if (!clientId) throw authError_("CONFIG", "GOOGLE_CLIENT_ID غير مضبوط في Script Properties.");
  const cache = CacheService.getScriptCache();
  const key = "idt_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return hit;
  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError_("AUTH_EXPIRED", "انتهت جلسة Google؛ سجّل الدخول مجدداً.");
  const info = JSON.parse(res.getContentText());
  const now = Math.floor(Date.now() / 1000);
  if (info.aud !== clientId) throw authError_("UNAUTHORIZED", "رمز Google صادر لتطبيق آخر.");
  if (["accounts.google.com", "https://accounts.google.com"].indexOf(info.iss) < 0) throw authError_("UNAUTHORIZED", "مُصدر رمز Google غير معروف.");
  if (String(info.email_verified) !== "true" || !info.email) throw authError_("UNAUTHORIZED", "البريد غير موثّق في حساب Google.");
  const exp = Number(info.exp) || 0;
  if (exp <= now) throw authError_("AUTH_EXPIRED", "انتهت جلسة Google؛ سجّل الدخول مجدداً.");
  const email = String(info.email).toLowerCase();
  cache.put(key, email, Math.max(1, Math.min(300, exp - now)));
  return email;
}

function isAllowedEmail_(email, list) {
  const items = String(list || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  return items.some(function (it) { return it.charAt(0) === "@" ? email.slice(-it.length) === it : email === it; });
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authError_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
