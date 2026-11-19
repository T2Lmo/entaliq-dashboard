/**
 * Social.gs — ربط LinkedIn و X والنشر المباشر من لوحة مكتب انطلق.
 *
 * التركيب (مرة واحدة):
 *  1) في بداية doGet(e):
 *       const cb = handleSocialCallback_(e); if (cb) return cb;
 *  2) في doPost بعد التحقق من المستخدم (authorizeUser_ في Auth.gs):
 *       const social = handleSocialAction_(body, user); if (social) return social;
 *
 * Script Properties:
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET   من تطبيقك على developer.linkedin.com
 *   LINKEDIN_ORG_URN     اختياري: urn:li:organization:123456 للنشر باسم صفحة الشركة
 *                        (يتطلب منتج Community Management API). بدونه يُنشر باسم الحساب الشخصي.
 *   LINKEDIN_VERSION     اختياري: مثل 202610. الافتراضي الشهر السابق.
 *   X_CLIENT_ID, X_CLIENT_SECRET                 من تطبيقك على developer.x.com (OAuth 2.0, Web App)
 *
 * عنوان الرجوع (Redirect URI) في التطبيقين = رابط /exec لهذا المشروع نفسه، بالضبط.
 *
 * رموز الحسابات تُحفظ في Script Properties على الخادم فقط ولا تصل إلى المتصفح.
 */

const SOCIAL_ = {
  linkedin: { label: "LinkedIn", tokenKey: "SOCIAL_LINKEDIN" },
  x: { label: "X", tokenKey: "SOCIAL_X" }
};

// ---------------- الموجّه ----------------
function handleSocialAction_(body, user) {
  const action = body && body.action;
  if (["social_status", "social_connect", "social_disconnect", "social_publish"].indexOf(action) < 0) return null;
  try {
    let data;
    if (action === "social_status") data = { networks: { linkedin: socialStatus_("linkedin"), x: socialStatus_("x") } };
    else {
      const network = String(body.network || "");
      if (!SOCIAL_[network]) throw socialError_("BAD_REQUEST", "شبكة غير معروفة.");
      if (action === "social_connect") data = { url: socialConnectUrl_(network, user) };
      else if (action === "social_disconnect") { PropertiesService.getScriptProperties().deleteProperty(SOCIAL_[network].tokenKey); data = { networks: { linkedin: socialStatus_("linkedin"), x: socialStatus_("x") } }; }
      else data = socialPublish_(network, body, user);
    }
    return socialJson_(Object.assign({ status: "success" }, data));
  } catch (e) {
    return socialJson_({ status: "error", code: e.code || "ERROR", message: e.message || String(e) });
  }
}

function socialJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function socialStatus_(network) {
  const props = PropertiesService.getScriptProperties();
  const configured = network === "linkedin"
    ? !!(props.getProperty("LINKEDIN_CLIENT_ID") && props.getProperty("LINKEDIN_CLIENT_SECRET"))
    : !!(props.getProperty("X_CLIENT_ID") && props.getProperty("X_CLIENT_SECRET"));
  const t = socialToken_(network);
  const out = { configured: configured, connected: false };
  if (!t) return out;
  out.connected = network === "x" ? !!(t.refresh_token || t.expires_at > Date.now()) : t.expires_at > Date.now();
  out.name = t.name || "";
  out.connectedBy = t.connected_by || "";
  out.expiresAt = network === "linkedin" ? new Date(t.expires_at).toISOString() : "";
  if (network === "linkedin") out.target = props.getProperty("LINKEDIN_ORG_URN") ? "organization" : "member";
  return out;
}

function socialToken_(network) {
  const raw = PropertiesService.getScriptProperties().getProperty(SOCIAL_[network].tokenKey);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function saveSocialToken_(network, t) {
  PropertiesService.getScriptProperties().setProperty(SOCIAL_[network].tokenKey, JSON.stringify(t));
}

function socialRedirectUri_() { return ScriptApp.getService().getUrl(); }

// ---------------- بدء الربط ----------------
function socialConnectUrl_(network, user) {
  const props = PropertiesService.getScriptProperties();
  const state = network + "." + Utilities.getUuid().replace(/-/g, "");
  const record = { network: network, by: (user && user.email) || "" };
  let url;
  if (network === "linkedin") {
    const id = props.getProperty("LINKEDIN_CLIENT_ID");
    if (!id) throw socialError_("CONFIG", "LINKEDIN_CLIENT_ID غير مضبوط في Script Properties.");
    const scope = props.getProperty("LINKEDIN_ORG_URN") ? "openid profile w_member_social w_organization_social" : "openid profile w_member_social";
    url = "https://www.linkedin.com/oauth/v2/authorization?" + query_({ response_type: "code", client_id: id, redirect_uri: socialRedirectUri_(), state: state, scope: scope });
  } else {
    const id = props.getProperty("X_CLIENT_ID");
    if (!id) throw socialError_("CONFIG", "X_CLIENT_ID غير مضبوط في Script Properties.");
    const verifier = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    record.verifier = verifier;
    const challenge = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier)).replace(/=+$/, "");
    url = "https://x.com/i/oauth2/authorize?" + query_({ response_type: "code", client_id: id, redirect_uri: socialRedirectUri_(), state: state,
      scope: "tweet.read tweet.write users.read media.write offline.access", code_challenge: challenge, code_challenge_method: "S256" });
  }
  CacheService.getScriptCache().put("oauth_" + state, JSON.stringify(record), 600);
  return url;
}

// ---------------- الرجوع من LinkedIn / X ----------------
function handleSocialCallback_(e) {
  const p = (e && e.parameter) || {};
  if (!p.state || !/^(linkedin|x)\.[0-9a-f]{32}$/.test(p.state)) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get("oauth_" + p.state);
  if (!raw) return socialPage_(false, "انتهت صلاحية طلب الربط. ابدأ الربط من اللوحة مرة أخرى.");
  cache.remove("oauth_" + p.state);
  const record = JSON.parse(raw);
  if (p.error) return socialPage_(false, "رُفض الربط: " + (p.error_description || p.error));
  if (!p.code) return socialPage_(false, "لم يصل رمز الربط.");
  try {
    if (record.network === "linkedin") linkedinExchange_(p.code, record.by);
    else xExchange_(p.code, record.verifier, record.by);
    return socialPage_(true, "تم ربط " + SOCIAL_[record.network].label + " بنجاح. يمكنك إغلاق هذه النافذة والعودة إلى اللوحة.");
  } catch (err) {
    return socialPage_(false, "تعذر إكمال الربط: " + err.message);
  }
}

function socialPage_(ok, message) {
  const safe = String(message).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  return HtmlService.createHtmlOutput('<div dir="rtl" style="font-family:system-ui,Tahoma;padding:40px;text-align:center;font-size:18px;color:' + (ok ? "#1a7f4b" : "#b3261e") + '">' + safe + "</div>")
    .setTitle("ربط الحسابات");
}

// ---------------- LinkedIn ----------------
function linkedinExchange_(code, by) {
  const props = PropertiesService.getScriptProperties();
  const res = fetchJson_("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "post", contentType: "application/x-www-form-urlencoded",
    payload: query_({ grant_type: "authorization_code", code: code, redirect_uri: socialRedirectUri_(),
      client_id: props.getProperty("LINKEDIN_CLIENT_ID"), client_secret: props.getProperty("LINKEDIN_CLIENT_SECRET") })
  });
  const me = fetchJson_("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: "Bearer " + res.access_token } });
  saveSocialToken_("linkedin", { access_token: res.access_token, expires_at: Date.now() + (Number(res.expires_in) || 0) * 1000,
    member: "urn:li:person:" + me.sub, name: me.name || "", connected_by: by });
}

function linkedinVersion_() {
  const v = PropertiesService.getScriptProperties().getProperty("LINKEDIN_VERSION");
  if (v) return v;
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return Utilities.formatDate(d, "UTC", "yyyyMM");
}

// صيغة commentary في LinkedIn تحتاج تهريب الرموز المحجوزة، والهاشتاقات بصيغة {hashtag|\#|كلمة}
function linkedinCommentary_(text) {
  const parts = String(text).split(/(#[\p{L}\p{N}_]+)/u);
  return parts.map(function (part) {
    const m = part.match(/^#([\p{L}\p{N}_]+)$/u);
    if (m) return "{hashtag|\\#|" + m[1] + "}";
    return part.replace(/[\\|{}@\[\]()<>#*_~]/g, "\\$&");
  }).join("");
}

function linkedinPublish_(text, imageBlob, altText) {
  const t = socialToken_("linkedin");
  if (!t || t.expires_at <= Date.now()) throw socialError_("NOT_CONNECTED", "اربط LinkedIn من الإعدادات أولاً (أو أعد الربط: الصلاحية 60 يوماً).");
  const author = PropertiesService.getScriptProperties().getProperty("LINKEDIN_ORG_URN") || t.member;
  const headers = { Authorization: "Bearer " + t.access_token, "LinkedIn-Version": linkedinVersion_(), "X-Restli-Protocol-Version": "2.0.0" };
  const post = { author: author, commentary: linkedinCommentary_(text), visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false };
  if (imageBlob) {
    const init = fetchJson_("https://api.linkedin.com/rest/images?action=initializeUpload", { method: "post", contentType: "application/json", headers: headers,
      payload: JSON.stringify({ initializeUploadRequest: { owner: author } }) });
    const up = UrlFetchApp.fetch(init.value.uploadUrl, { method: "put", payload: imageBlob.getBytes(), contentType: "application/octet-stream",
      headers: { Authorization: "Bearer " + t.access_token }, muteHttpExceptions: true });
    if (up.getResponseCode() >= 300) throw socialError_("LINKEDIN", "تعذر رفع الصورة إلى LinkedIn (" + up.getResponseCode() + ").");
    post.content = { media: { id: init.value.image, altText: String(altText || "").slice(0, 300) } };
  }
  const res = UrlFetchApp.fetch("https://api.linkedin.com/rest/posts", { method: "post", contentType: "application/json", headers: headers,
    payload: JSON.stringify(post), muteHttpExceptions: true });
  if (res.getResponseCode() !== 201) throw socialError_("LINKEDIN", "رفض LinkedIn النشر (" + res.getResponseCode() + "): " + res.getContentText().slice(0, 300));
  const h = res.getHeaders();
  const urn = h["x-restli-id"] || h["X-RestLi-Id"] || h["X-Restli-Id"] || "";
  return { postId: urn, postUrl: urn ? "https://www.linkedin.com/feed/update/" + urn + "/" : "" };
}

// ---------------- X ----------------
function xBasicAuth_() {
  const props = PropertiesService.getScriptProperties();
  return "Basic " + Utilities.base64Encode(props.getProperty("X_CLIENT_ID") + ":" + props.getProperty("X_CLIENT_SECRET"));
}

function xExchange_(code, verifier, by) {
  const res = fetchJson_("https://api.x.com/2/oauth2/token", { method: "post", contentType: "application/x-www-form-urlencoded", headers: { Authorization: xBasicAuth_() },
    payload: query_({ grant_type: "authorization_code", code: code, redirect_uri: socialRedirectUri_(), code_verifier: verifier,
      client_id: PropertiesService.getScriptProperties().getProperty("X_CLIENT_ID") }) });
  const me = fetchJson_("https://api.x.com/2/users/me", { headers: { Authorization: "Bearer " + res.access_token } });
  saveSocialToken_("x", { access_token: res.access_token, refresh_token: res.refresh_token || "", expires_at: Date.now() + (Number(res.expires_in) || 0) * 1000,
    username: me.data.username, name: "@" + me.data.username, connected_by: by });
}

// رمز X صالح ساعتين؛ يُجدَّد تلقائياً برمز التحديث (الذي يتغير مع كل تجديد)
function xAccessToken_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const t = socialToken_("x");
    if (!t) throw socialError_("NOT_CONNECTED", "اربط X من الإعدادات أولاً.");
    if (t.expires_at > Date.now() + 60000) return t;
    if (!t.refresh_token) throw socialError_("NOT_CONNECTED", "انتهت صلاحية ربط X؛ أعد الربط من الإعدادات.");
    const res = fetchJson_("https://api.x.com/2/oauth2/token", { method: "post", contentType: "application/x-www-form-urlencoded", headers: { Authorization: xBasicAuth_() },
      payload: query_({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: PropertiesService.getScriptProperties().getProperty("X_CLIENT_ID") }) });
    t.access_token = res.access_token;
    t.refresh_token = res.refresh_token || t.refresh_token;
    t.expires_at = Date.now() + (Number(res.expires_in) || 0) * 1000;
    saveSocialToken_("x", t);
    return t;
  } finally { lock.releaseLock(); }
}

function xPublish_(text, imageBlob) {
  const t = xAccessToken_();
  const tweet = { text: String(text) };
  if (imageBlob) {
    const up = fetchJson_("https://api.x.com/2/media/upload", { method: "post", headers: { Authorization: "Bearer " + t.access_token },
      payload: { media: imageBlob, media_category: "tweet_image" } });
    const mediaId = (up.data && up.data.id) || up.media_id_string;
    if (!mediaId) throw socialError_("X", "لم يُرجع X معرّف الصورة.");
    tweet.media = { media_ids: [String(mediaId)] };
  }
  const res = fetchJson_("https://api.x.com/2/tweets", { method: "post", contentType: "application/json", headers: { Authorization: "Bearer " + t.access_token },
    payload: JSON.stringify(tweet) });
  return { postId: res.data.id, postUrl: "https://x.com/" + t.username + "/status/" + res.data.id };
}

// ---------------- النشر ----------------
// body: { network, id, text, image (data:image/png;base64,… اختياري), alt }
// يمنع النشر المكرر لنفس المنشور على نفس الشبكة؛ يعيد الرابط السابق بدل النشر مرة ثانية
function socialPublish_(network, body, user) {
  const id = String(body.id || "").trim(), text = String(body.text || "").trim();
  if (!id || !text) throw socialError_("BAD_REQUEST", "المنشور أو نصه غير موجود.");
  if (network === "x" && xLengthServer_(text) > 280) throw socialError_("BAD_REQUEST", "التغريدة أطول من 280 حرفاً.");
  if (typeof socialCanPublish_ === "function" && !socialCanPublish_(id, body)) throw socialError_("FORBIDDEN", "المنشور غير معتمد، أو تغيّر منذ اعتماده.");
  const props = PropertiesService.getScriptProperties();
  const doneKey = "SOCIAL_PUB_" + network + "_" + id;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const prev = props.getProperty(doneKey);
    if (prev) return Object.assign({ already: true }, JSON.parse(prev));
    let blob = null;
    const m = String(body.image || "").match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (m) blob = Utilities.newBlob(Utilities.base64Decode(m[2]), "image/" + m[1], "design." + (m[1] === "png" ? "png" : "jpg"));
    const out = network === "linkedin" ? linkedinPublish_(text, blob, body.alt) : xPublish_(text, blob);
    const record = { postUrl: out.postUrl, postId: out.postId, at: new Date().toISOString(), by: (user && user.email) || "" };
    props.setProperty(doneKey, JSON.stringify(record));
    return record;
  } finally { lock.releaseLock(); }
}

// الخادم نفسه يتحقق أن المنشور معتمد ولم يتغير منذ عرضه، ونص X مطابق لنسخة زياد المحفوظة
// (يستخدم دوال Code.gs: setupSheets, contentRow_, contentItem_, contentVersion_)
function socialCanPublish_(id, body) {
  const sheet = setupSheets().getSheetByName("Content");
  const r = contentItem_(sheet, contentRow_(sheet, id));
  if (r[9] !== "معتمد" || typeof body.version !== "string" || contentVersion_(r) !== body.version) return false;
  if (body.network === "x" && String(r[13] || "").trim() !== String(body.text || "").trim()) return false;
  return true;
}

// ---------------- أدوات ----------------
function xLengthServer_(text) {
  return String(text).replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

function query_(obj) {
  return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]); }).join("&");
}

function fetchJson_(url, opts) {
  const res = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, opts));
  const code = res.getResponseCode(), text = res.getContentText();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch (e) {}
  if (code >= 300 || !data) throw socialError_("UPSTREAM", "خطأ من " + url.split("/")[2] + " (" + code + "): " + text.slice(0, 300));
  return data;
}

function socialError_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
