"use strict";
// ربط LinkedIn و X والنشر المباشر عبر الخادم (Social.gs)
// الرموز تبقى في الخادم؛ اللوحة ترسل النص والصورة فقط. إن كان الخادم لا يدعم الربط تبقى هذه الأزرار مخفية.

const SOCIAL_NETS = { linkedin: { label: "LinkedIn" }, x: { label: "X" } };
const socialOn = net => !!(state.social && state.social[net] && state.social[net].connected);

async function loadSocialStatus() {
  if (!state.url || !hasAuth()) return;
  try {
    const data = await api({ action: "social_status" });
    state.social = data.networks || null;
  } catch (e) {
    state.social = null; // خادم أقدم لا يعرف social_status
  }
  renderSocialBox();
  if (state.view === "content") renderContentView();
}

function renderSocialBox() {
  const box = $("#socialBox");
  if (!box) return;
  box.hidden = !state.social;
  if (!state.social) return;
  $("#socialList").innerHTML = Object.keys(SOCIAL_NETS).map(net => {
    const s = state.social[net] || {};
    const label = SOCIAL_NETS[net].label;
    let status, action;
    if (!s.configured) { status = "غير مهيأ في الخادم (أضف مفاتيح التطبيق في Script Properties)"; action = ""; }
    else if (s.connected) {
      const target = net === "linkedin" ? (s.target === "organization" ? " · صفحة الشركة" : " · حساب شخصي") : "";
      status = "مربوط: " + (s.name || "") + target + (net === "linkedin" && s.expiresAt ? " · حتى " + s.expiresAt.slice(0, 10) : "");
      action = `<button type="button" class="btn btn-line sm" data-sdisconnect="${net}"><span class="lbl-text">فصل</span></button>`;
    } else { status = "غير مربوط"; action = `<button type="button" class="btn btn-primary sm" data-sconnect="${net}">${ICON.link}<span class="lbl-text">ربط ${label}</span></button>`; }
    return `<div class="social-row"><b>${label}</b><span class="hint">${esc(status)}</span>${action}</div>`;
  }).join("");
}

let socialWaiting = false;
async function socialConnect(btn) {
  const net = btn.dataset.sconnect;
  const stop = busy(btn, "جاري التجهيز");
  try {
    const data = await api({ action: "social_connect", network: net });
    window.open(data.url, "_blank", "noopener");
    socialWaiting = true;
    settingsMsg("أكمل الموافقة في النافذة التي فُتحت، ثم عد إلى هذه الصفحة.", "");
  } catch (e) { settingsMsg(e.message, "bad"); }
  finally { stop(); }
}
// عند العودة من نافذة الموافقة نحدّث حالة الربط
addEventListener("focus", () => { if (socialWaiting) { socialWaiting = false; loadSocialStatus(); } });

async function socialDisconnect(btn) {
  const net = btn.dataset.sdisconnect;
  if (!confirm("فصل " + SOCIAL_NETS[net].label + "؟ لن يمكن النشر المباشر حتى تعيد الربط.")) return;
  const stop = busy(btn, "جاري الفصل");
  try { const data = await api({ action: "social_disconnect", network: net }); state.social = data.networks || state.social; renderSocialBox(); }
  catch (e) { settingsMsg(e.message, "bad"); }
  finally { stop(); }
}

// زر النشر المباشر، أو رابط المنشور إن نُشر من هذه الجلسة
function socialPublishButton(net, id, version) {
  const done = state.socialPosts[net + ":" + id];
  if (done) return done.postUrl ? `<a class="btn btn-line sm" href="${esc(done.postUrl)}" target="_blank" rel="noopener noreferrer">${ICON.check}<span class="lbl-text">نُشر على ${SOCIAL_NETS[net].label}</span></a>` : "";
  if (!socialOn(net)) return "";
  return `<button type="button" class="btn btn-primary sm" data-spub="${net}" data-id="${esc(id)}" data-version="${esc(version)}">${ICON.send}<span class="lbl-text">انشر الآن على ${SOCIAL_NETS[net].label}</span></button>`;
}

async function designDataUrl(row, sizeKey) {
  const d = parseDesign(row[12]);
  if (!d) return { image: "", alt: "" };
  const c = document.createElement("canvas");
  await drawDesign(c, d, sizeKey);
  return { image: c.toDataURL("image/png"), alt: d.headline || "" };
}

async function socialPublish(btn) {
  const net = btn.dataset.spub, id = btn.dataset.id;
  const row = state.content.find(r => r[0] === id);
  if (!row || row[9] !== "معتمد" || state.contentVersions[id] !== btn.dataset.version) { toast("حدّث المنشور واعتمده قبل النشر.", "warn"); return; }
  if (state.socialBusy || state.contentBusy) { toast("انتظر حتى تكتمل العملية الحالية", "warn"); return; }
  const s = state.social[net] || {};
  const text = net === "x" ? String(row[13] || "") : linkedinText(row[7]);
  if (!text) { toast("لا يوجد نص للنشر.", "warn"); return; }
  if (net === "x" && xLength(text) > 280) { toast("التغريدة أطول من 280 حرفاً؛ عدّلها أولاً.", "warn"); return; }
  if (!confirm(`سيُنشر هذا المنشور علناً على ${SOCIAL_NETS[net].label} باسم ${s.name || "الحساب المربوط"}${parseDesign(row[12]) ? " مع صورة التصميم" : ""}. متابعة؟`)) return;
  state.socialBusy = true;
  const stop = busy(btn, "جاري النشر");
  try {
    const sizeKey = net === "x" ? "x" : (state.designSize[id] === "lip" ? "lip" : "li");
    const { image, alt } = await designDataUrl(row, sizeKey);
    const data = await api({ action: "social_publish", network: net, id, version: btn.dataset.version, text, image, alt });
    state.socialPosts[net + ":" + id] = data;
    toast((data.already ? "نُشر سابقاً على " : "نُشر على ") + SOCIAL_NETS[net].label + ". اضغط «تم النشر» بعد الانتهاء من كل المنصات.", "ok");
  } catch (e) { toast(e.message, "bad"); }
  finally { state.socialBusy = false; stop(); renderContentView(); }
}
