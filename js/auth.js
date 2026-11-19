"use strict";
// تسجيل الدخول بحساب Google (Google Identity Services)
// رمز Google (ID token) صالح ساعة، يُحفظ في sessionStorage فقط، ويتحقق منه الخادم في Auth.gs

function jwtPayload(t) {
  try {
    const b64 = String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
  } catch (e) { return null; }
}
// بيانات المستخدم إن كان رمزه ما زال صالحاً (بهامش دقيقة)
function googleUser() {
  const p = state.idToken ? jwtPayload(state.idToken) : null;
  return p && p.exp * 1000 > Date.now() + 60000 ? p : null;
}
const hasAuth = () => !!(state.token || googleUser());

function setIdToken(t) {
  state.idToken = t || "";
  try { t ? sessionStorage.setItem(KEYS.idToken, t) : sessionStorage.removeItem(KEYS.idToken); } catch (e) {}
}

let gisReady = null;
function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential, auto_select: true,
        cancel_on_tap_outside: false, use_fedcm_for_prompt: true, itp_support: true });
      resolve();
    };
    s.onerror = () => { gisReady = null; reject(new Error("تعذر تحميل تسجيل الدخول من Google")); };
    document.head.appendChild(s);
  });
  return gisReady;
}

function promptGoogle() {
  if (!GOOGLE_CLIENT_ID) return;
  loadGis().then(() => google.accounts.id.prompt()).catch(() => {});
}

async function onGoogleCredential(resp) {
  const p = jwtPayload(resp && resp.credential);
  if (!p) { toast("تعذر قراءة بيانات تسجيل الدخول", "bad"); return; }
  setIdToken(resp.credential);
  renderGoogleBox();
  toast("مرحباً " + (p.name || p.email), "ok");
  if (state.url) {
    await refresh({ quiet: true });
    if (state.loaded && dlg.open && !$("#inToken").value) dlg.close();
    loadSocialStatus();
  }
}

function signOutGoogle() {
  setIdToken("");
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  state.social = null;
  renderGoogleBox();
  renderSocialBox();
  toast("سُجّل الخروج من حساب Google في هذه اللوحة", "ok");
}

function renderGoogleBox() {
  const box = $("#googleBox");
  if (!box) return;
  box.hidden = !GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) return;
  const u = googleUser();
  const who = $("#googleWho"), btn = $("#googleBtn"), out = $("#btnGoogleOut");
  out.hidden = !u;
  who.textContent = u ? "مسجّل الدخول: " + u.email : "";
  btn.hidden = !!u;
  if (!u) loadGis().then(() => {
    btn.innerHTML = "";
    google.accounts.id.renderButton(btn, { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", locale: "ar" });
  }).catch(e => { who.textContent = e.message; });
}

function initGoogleAuth() {
  if (!GOOGLE_CLIENT_ID) return;
  renderGoogleBox();
  if (!googleUser() && !state.token) promptGoogle();
}
