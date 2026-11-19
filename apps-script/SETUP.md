# تفعيل الدخول بـ Google والنشر على LinkedIn و X

الواجهة جاهزة. الميزتان تبقيان مخفيتين حتى تُضبط هذه الخطوات.

## 1) أضف الملفات إلى مشروع Apps Script
انسخ `Auth.gs` و`Social.gs` إلى المشروع، ثم عدّل `Code.gs`:

```js
function doGet(e) {
  const cb = handleSocialCallback_(e); if (cb) return cb;   // ← أضف هذا السطر أولاً
  // ... الكود الحالي
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const user = authorize_(body);                             // ← بدل فحص ACCESS_TOKEN الحالي
  const social = handleSocialAction_(body, user); if (social) return social;
  // ... بقية الإجراءات كما هي
}
```
ثم **Deploy ← Manage deployments ← Edit ← New version** (يبقى رابط /exec نفسه).

## 2) الدخول ببريدك (Google)
1. افتح Google Cloud Console ← APIs & Services ← Credentials ← Create credentials ← **OAuth client ID** ← Web application.
2. في **Authorized JavaScript origins** أضف: `https://t2lmo.github.io`
3. انسخ الـ Client ID وضعه في:
   - `js/config.js` ← `const GOOGLE_CLIENT_ID = "…";`
   - Script Properties ← `GOOGLE_CLIENT_ID`
4. Script Properties ← `ALLOWED_EMAILS` = بريدك (وأي بريد آخر، مفصول بفواصل).
5. بعد التأكد أن الدخول يعمل: `ALLOW_SHARED_TOKEN` = `false` لإيقاف الرمز المشترك.

## 3) LinkedIn
1. developer.linkedin.com ← Create app (اربطه بصفحة الشركة).
2. Products: **Sign In with LinkedIn using OpenID Connect** و **Share on LinkedIn**.
   للنشر باسم صفحة الشركة: اطلب **Community Management API** (يحتاج موافقة LinkedIn) وضع `LINKEDIN_ORG_URN` = `urn:li:organization:<رقم الصفحة>`.
3. Auth ← Authorized redirect URLs: رابط `/exec` بالضبط.
4. Script Properties: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
5. صلاحية الربط 60 يوماً؛ تظهر في الإعدادات، ثم أعد الربط.

## 4) X
1. developer.x.com ← Project ← App ← User authentication settings:
   OAuth 2.0، النوع **Web App (confidential client)**، الصلاحيات Read and write.
2. Callback URI: رابط `/exec` بالضبط. Website: `https://t2lmo.github.io/entaliq-dashboard/`
3. Script Properties: `X_CLIENT_ID`, `X_CLIENT_SECRET`.
4. راجع باقة X API الحالية وسعرها: النشر عبر الـ API له حدود حسب الباقة.

## 5) الاستخدام
الإعدادات ← «حسابات النشر المباشر» ← ربط. في المنشورات المعتمدة يظهر «انشر الآن على LinkedIn / X»، مع تأكيد قبل النشر، وصورة تصميم ريم تُرفق تلقائياً. الخادم يمنع نشر المنشور نفسه مرتين على الشبكة نفسها.

اختياري (موصى به): عرّف في `Code.gs` دالة `socialCanPublish_(id, body)` تعيد `true` فقط إذا كان المنشور معتمداً ونسخته `body.version` هي الحالية، فيتحقق الخادم بنفسه وليس الواجهة فقط.
