"use strict";
// نموذج «اطلب تواصلاً» لموقعي انطلق ووهج (Leads.gs).
// الرابط من اللوحة: lead.html#u=<رابط الخادم>&k=<رمز النموذج>&b=entaliq|wahaj[&e=1 للتضمين]
// يُقبل رابط خادم Google Apps Script فقط، فلا يمكن استغلال الصفحة لإرسال البيانات إلى جهة أخرى.
(function () {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const url = params.get("u") || "", key = params.get("k") || "", slug = params.get("b") === "wahaj" ? "wahaj" : "entaliq";
  const okUrl = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url);
  const BR = {
    entaliq: { name: "انطلق", mark: "انطلق للطاقة", title: "خلّنا نخفض فاتورة الطاقة في منشأتك", sub: "تدقيق الطاقة والقياس وإدارة المباني. اترك بياناتك، ونتواصل معك خلال ساعات العمل.", service: 1 },
    wahaj: { name: "وهج", mark: "وهج", title: "حوّل سطحك إلى محطة طاقة شمسية", sub: "طاقة أنظف. حياة أكثر إشراقًا. اترك بياناتك، ونتواصل معك خلال ساعات العمل.", service: 0 }
  }[slug];
  const $ = id => document.getElementById(id);
  document.body.dataset.brand = slug;
  if (params.get("e") === "1") document.body.dataset.embed = "1";
  $("lfMark").textContent = BR.mark; $("lfTitle").textContent = BR.title; $("lfSub").textContent = BR.sub; $("lfBrandName").textContent = BR.mark;
  $("lfService").selectedIndex = BR.service;
  document.title = "اطلب تواصلاً · " + BR.mark;

  const form = $("lfForm"), status = $("lfStatus"), send = $("lfSend"), t0 = Date.now();
  const say = (msg, bad) => { status.textContent = msg; status.dataset.tone = bad ? "bad" : ""; };
  if (!okUrl || !key) { say("رابط النموذج غير مكتمل. انسخه من جديد من اللوحة: مسار المبيعات ← من الموقع.", true); send.disabled = true; return; }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(form), v = k => String(f.get(k) || "").trim();
    if (!v("name")) { say("اكتب اسمك.", true); $("lfName").focus(); return; }
    if (!v("phone") && !v("email")) { say("اكتب رقم جوالك أو بريدك لنتواصل معك.", true); return; }
    if (v("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) { say("البريد غير صحيح.", true); return; }
    if (!$("lfConsent").checked) { say("نحتاج موافقتك على التواصل معك.", true); return; }
    send.disabled = true; say("جاري الإرسال…");
    const body = { action: "lead_submit", key, brand: BR.name, name: v("name"), company: v("company"), phone: v("phone"), email: v("email"), city: v("city"),
      service: v("service"), message: v("message"), website: v("website"), consent: true, elapsed: Date.now() - t0,
      page: (document.referrer && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : location.href.split("#")[0]).slice(0, 300) };
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.status !== "success") throw new Error(d.message || "تعذر إرسال الطلب.");
      form.hidden = true; $("lfDone").hidden = false;
    } catch (err) {
      say((err && err.message && !/fetch|network|json/i.test(err.message) ? err.message : "تعذر الإرسال الآن") + " يمكنك المحاولة مرة أخرى.", true);
      send.disabled = false;
    }
  });
})();
