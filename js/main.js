"use strict";
// البداية

// ---------------- البداية ----------------
restoreResearchTracking();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleResearchPoll(500); });
buildGauge();
paintToday();
setInterval(paintToday, 60000);
setAuto(store.get(KEYS.auto) === "1");
renderStatus();
renderBoard();
initGoogleAuth();
// بدون رمز محفوظ أو جلسة Google صالحة نفتح الإعدادات لتسجيل الدخول بدل محاولة اتصال ستفشل
if (state.url && hasAuth()) refresh().then(ok => { if (ok) loadSocialStatus(); });
else openSettings();
