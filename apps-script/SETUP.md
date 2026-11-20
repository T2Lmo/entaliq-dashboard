# تفعيل: إدارة المكتب، Claude Sonnet للوكلاء، الدخول بـ Google، النشر على LinkedIn و X

الواجهة جاهزة. هذه الميزات لا تعمل حتى تُضبط هذه الخطوات.

## 1) أضف الملفات وعدّل Code.gs (3 تعديلات فقط)
في محرر Apps Script: **+ ← Script** أربع مرات، وانسخ فيها `Auth.gs` و`Social.gs` و`ClaudeBridge.gs` و`Office.gs` كما هي.
ثم في `Code.gs` (ابحث بـ Ctrl+F):

**أ) سطر دالة Gemini** — غيّر الاسم فقط:
```js
function callGemini(systemRole, userPrompt, asJson) {
```
إلى:
```js
function callGeminiApi_(systemRole, userPrompt, asJson) {
```
`ClaudeBridge.gs` يعرّف `callGemini` الجديدة بنفس التوقيع، فكل الوكلاء (نواف، فيصل، لمى، سالم، ريم، زياد، راكان، خالد، سلطان) يمرون عبرها دون أي تغيير آخر.

**ب) داخل doGet** — استبدل:
```js
    authorize_(e && e.parameter && e.parameter.token);
```
بـ:
```js
    const cb = handleSocialCallback_(e); if (cb) return cb;
    authorizeUser_({ token: e && e.parameter && e.parameter.token });
```

**ج) داخل doPost** — استبدل:
```js
    authorize_(data.token);
```
بـ:
```js
    const worker = handleClaudeWorkerAction_(data); if (worker) return worker;
    const user = authorizeUser_(data);
    const social = handleSocialAction_(data, user); if (social) return social;
    const office = handleOfficeAction_(data, user); if (office) return office;
    if (data.action === "claude_status") return json_(Object.assign({ status: "success" }, claudeStatus_()));
```

ثم **Deploy ← Manage deployments ← Edit ← Version: New version** (يبقى رابط /exec نفسه).

## إدارة المكتب (زر 👥 في أعلى اللوحة)
- **الوكلاء:** تعديل تعليمات دور كل وكيل، وتوجيهاتك له، وإيقافه أو تفعيله، وساعات عمله (ساعات المكتب، أو مخصصة، أو دائماً). «استرجاع الأصل» يعيد تعليمات Code.gs.
- **المهام المجدولة:** مهمة لأي وكيل في أيام وساعة محددة (مثال: راكان كل أحد 9:00 يلخّص أخبار الأسبوع). تُنفَّذ إذا كان الوكيل في دوامه، ويدققها سالم، وتظهر في سجل المهام. «تشغيل الآن» للتجربة.
- **التوجيهات والدوام:** توجيهات عامة لكل الوكلاء، وساعات المكتب الافتراضية، وخيار تطبيق الساعات على تكليفاتك اليدوية أيضاً.
- **الأتمتة والهوية:** تكرار رصد الأخبار (كل 1/2/4/6/8/12 ساعة)، ويوم وساعة خطة الأسبوع، ووصف هوية كل علامة الذي تتبعه ريم.
- **تعديل تصميم منشور:** المحتوى ← التصميم ← «تعديل التصميم»: العنوان والسطر الداعم والرقم والنقاط والدعوة ونسخة X.
- **سجل المكتب:** كل إيقاف وتشغيل وتغيير دوام وتكليف وجدولة (ومن نفّذه) يُحفظ في ورقة `OfficeLog` تُنشأ تلقائياً، ويظهر في تبويب «سجل المكتب». هو مرجع راكان (المدير التنفيذي) لمعرفة ما فعله كل وكيل.

## ملخص راكان التنفيذي (Executive.gs)
راكان هو المدير التنفيذي: يعرف ما فعله كل وكيل ويلخّص نتائجهم.
- **الملخص:** بطاقة راكان ← «الملخص». يقرأ المهام وتدقيق سالم والأخبار والمحتوى وسجل المكتب للفترة (يوم/أسبوع/شهر)، ويكتب: الخلاصة، أبرز النتائج، ما يحتاج انتباهك، ما أنجزه كل وكيل، ومقترحات تكليف تعتمدها بزر «كلّف» أو «جدولة».
- **الأرقام** (عدد المهام، متوسط تقدير سالم، أقل من 70%، غير المكتملة…) يحسبها الخادم من السجلات مباشرة؛ راكان يكتب القراءة فقط.
- **المواعيد:** إدارة المكتب ← الأتمتة والهوية ← «ملخص راكان التنفيذي»: يومي (الافتراضي 16:00) وأسبوعي (الافتراضي الخميس 14:00). يعمل فقط وراكان في دوامه، ويُتخطى إن لم يكن للفريق نشاط. **بعد لصق الملف اضغط «حفظ وتحديث المشغلات» مرة واحدة** لإنشاء مشغلات الملخص.
- يُحفظ كل ملخص في ورقة `Reports` تُنشأ تلقائياً.
- **عند تكليف راكان مباشرة** يُضاف لمهمته «مرجع الفريق» (آخر 7 أيام: مهام كل وكيل وتقديراته وآخر ملخص)، ويراه سالم عند التدقيق. سجل المهام يحفظ نص مهمتك الأصلي فقط.

**إن كنت تستخدم ملفات منفصلة:** أضف `Executive.gs` كملف جديد، وفي `doPost` داخل Code.gs استبدل سطر تنفيذ التكليف:
```js
    const agentOutput = callGemini(AGENTS_PROMPTS[agentName], taskText);
```
بـ:
```js
    const agentInput = typeof execTaskContext_ === "function" ? execTaskContext_(agentName, taskText) : taskText;
    const agentOutput = callGemini(AGENTS_PROMPTS[agentName], agentInput);
```
وفي سطر `runAudit_` الذي يليه غيّر `task: taskText` إلى `task: agentInput`. إجراءات `exec_*` تمر عبر `handleOfficeAction_` فلا يلزم تعديل آخر.

## أدوات الوكيل تحت اسمه (في اللوحة الرئيسية)
تحت كل بطاقة وكيل: حالته (في الدوام / خارج الدوام / موقوف) وساعاته، وثلاثة أزرار:
- **الدوام:** ساعات المكتب أو مخصصة أو دائماً (إجراء `office_set_hours`، لا يمس تعليماته وتوجيهاته).
- **إيقاف / تشغيل:** يوقف كل أعماله اليدوية والمجدولة والآلية أو يعيدها.
- **تكليف:** «نفّذ الآن» (نفس مسار تكليف وكيل مع تدقيق سالم) أو «مهمة مجدولة متكررة» بأيام وساعة.

تظهر الأدوات فقط إذا كان الخادم يحتوي Office.gs؛ مع الخادم القديم تبقى البطاقات كما كانت.

**إن كنت تستخدم ملفات منفصلة بدل الملف الكامل:** أضف في `doPost` داخل Code.gs بعد سطر حفظ التكليف في Tasks (`ss.getSheetByName("Tasks").appendRow([taskId, …`):
```js
    if (typeof officeLog_ === "function") officeLog_("تكليف مباشر", agentName, taskId + " — " + taskText.slice(0, 200), officeBy_(user));
```

بعد التركيب افتح «الأتمتة والهوية» واضغط **حفظ وتحديث المشغلات** مرة واحدة: يستبدل مشغلات installNewsTrigger بمشغلات تحترم ساعات العمل، ويضيف مشغل المهام المجدولة.
الرصد الآلي يعمل فقط إذا كان نواف وفيصل ولمى وسالم في دوامهم، وخطة الأسبوع إذا كان راكان ولمى وسالم في دوامهم.

هذه التعديلات آمنة قبل ضبط أي مفاتيح جديدة: بدون `AI_ENGINE=claude` يبقى Gemini كما هو، والرمز `ACCESS_TOKEN` الحالي يبقى يعمل.

## الوكلاء بـ Claude Sonnet (بدون API)
الخادم يضع طلب الوكيل في طابور، و**عامل على جهازك** ينفذه بـ Claude Code باشتراكك ويعيد الرد.
التعليمات المرسلة لـ Claude هي نفسها التي كانت تُرسل لـ Gemini: دور الوكيل + القواعد العامة + ملف الشركة من ورقة Company.

1. Script Properties: `WORKER_TOKEN` = رمز عشوائي طويل (غير ACCESS_TOKEN).
2. على جهازك: انسخ `worker/.env.example` إلى `worker/.env` واملأ `EXEC_URL` (رابط /exec) و`WORKER_TOKEN`.
3. شغّل `worker/start-worker.cmd` واتركه مفتوحاً.
4. Script Properties: `AI_ENGINE` = `claude`. (لإرجاع Gemini: احذفها أو غيّر قيمتها.)
5. اختياري: `CLAUDE_FALLBACK` = `gemini` ليُستخدم Gemini تلقائياً إذا كان جهازك مطفأ (مفيد لرصد الأخبار كل 6 ساعات وخطة السبت 9 صباحاً). و`CLAUDE_MODEL` (الافتراضي `sonnet`).

اختبار سريع للعامل بدون الخادم: `node worker/claude-worker.mjs --once "سؤال"`

ملاحظات:
- الوكلاء يعملون فقط وجهازك شغّال والعامل مفتوح (أو مع `CLAUDE_FALLBACK=gemini`).
- كل طلب يُحسب من حدود اشتراكك في Claude. رصد الأخبار يستدعي حتى 4 وكلاء لكل خبر، وتكليف وكيل = وكيل + تدقيق سالم.
- الانتظار محكوم بميزانية التنفيذ الحالية في Code.gs؛ ما لا يكتمل (مثل بقية خطة الأسبوع) يُستكمل في الدورة التالية كما كان.
- الباحث يبقى على وضع النقل اليدوي (`RESEARCH_MANUAL_MODE`) ولا يتغير.
- للتشغيل التلقائي مع Windows: ضع اختصاراً لـ `start-worker.cmd` في مجلد `shell:startup`.

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
الإعدادات ← «حسابات النشر المباشر» ← ربط. في المنشورات المعتمدة يظهر «انشر الآن على LinkedIn / X»، مع تأكيد قبل النشر، وصورة تصميم ريم تُرفق تلقائياً. الخادم يتحقق بنفسه أن المنشور معتمد ولم يتغير، ويمنع نشره مرتين على الشبكة نفسها.

