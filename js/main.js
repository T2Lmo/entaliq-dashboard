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
if (state.url) refresh();
else openSettings();
