# مكتب انطلق الذكي — لوحة المؤشرات

واجهة ثابتة تُنشر على GitHub Pages وتتصل بخادم Google Apps Script (`Code.gs`).
لا تحتاج خطوة بناء: الملفات تُخدَم كما هي.

## البنية

```
index.html          الهيكل (HTML فقط)
css/styles.css      كل التنسيقات
js/                 سكربتات عادية (ليست modules) تتشارك النطاق العام، وتُحمَّل بهذا الترتيب:
  config.js         الوكلاء والفترات ومفاتيح التخزين والحالة والأيقونات
  api.js            الاتصال بخادم Apps Script (POST + ACCESS_TOKEN)
  utils.js          أدوات الحساب والعرض والمؤشرات
  dashboard.js      العدّاد والبطاقات والبلاطات وفلتر الفترة وتطور الأداء والشريط
  views.js          اللوحة الجانبية: المهام والأخبار والبحث والفريق والتنبيهات
  content.js        المحتوى والاعتماد
  designs.js        رسم تصاميم المنشورات بهوية كل علامة وإجراءات المحتوى
  app.js            الرسم الكامل والتحديث والإجراءات والإعدادات
  office.js         إدارة المكتب: الوكلاء والدوام والمهام المجدولة والأتمتة وتعديل التصاميم، وأدوات كل وكيل تحت اسمه وسجل المكتب
  executive.js      ملخص راكان التنفيذي: ما أنجزه كل وكيل ونتائجه ومقترحات التكليف
  auth.js           الدخول بحساب Google
  social.js         ربط LinkedIn و X والنشر المباشر
  events.js         ربط الأحداث
  main.js           البداية (يُشغَّل أخيراً)
apps-script/        ملفات تُضاف إلى مشروع Apps Script (Auth.gs, Social.gs, ClaudeBridge.gs, Office.gs, Executive.gs, Sites.gs) وخطوات التفعيل في SETUP.md
worker/             عامل Claude على جهازك: ينفذ طلبات الوكلاء بـ Claude Sonnet باشتراكك (بدون API)
```

> الترتيب في `index.html` مهم: كل ملف يستخدم ما عُرّف في الملفات التي قبله عند التحميل.

## التشغيل محلياً

```
npx http-server -c-1 .
```

ثم افتح `http://localhost:8080` وأدخل رابط `/exec` ورمز `ACCESS_TOKEN` من الإعدادات.

## الخادم (Google Apps Script)

كود الخادم غير موجود في هذا المستودع بعد. لتنزيله إلى مجلد `apps-script/`:

```
npm install -g @google/clasp
clasp login
mkdir apps-script && cd apps-script
clasp clone <SCRIPT_ID>
```

`SCRIPT_ID` من محرر Apps Script ← إعدادات المشروع (Project Settings) ← Script ID.
لا ترفع `.clasprc.json` ولا قيم Script Properties (مثل `ACCESS_TOKEN` ومفتاح النموذج) إلى GitHub.
