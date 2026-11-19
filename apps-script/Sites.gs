/**
 * Sites.gs — أفكار ومنشورات وتصاميم من مواقعنا (انطلق ووهج).
 *
 * الدورة: قراءة صفحات كل موقع ← حفظ نصها في ورقة Sites ← اختيار صفحات جديدة أو تغيّرت (ثم الأقدم استخداماً)
 *   ← راكان يقترح أفكاراً مبنية على الصفحة ← تُضاف للمحتوى «فكرة»
 *   ← في الوضع الكامل: لمى تكتب أول فكرتين ← سالم يدقق مقابل نص الصفحة ← ريم تصمم ← زياد يكتب نسخة X ← «مسودة» للاعتماد.
 *
 * تُشغَّل من اللوحة (المحتوى ← «أفكار من مواقعنا») أو أسبوعياً من «إدارة المكتب ← الأتمتة والهوية».
 * الصفحات التي تحتاج JavaScript لعرض نصها لا يمكن قراءتها من الخادم؛ لذلك موقع انطلق المعتمد هنا هو www.entaliq.com.sa/ar.
 *
 * يعتمد على Code.gs: setupSheets, callGemini, AGENTS_PROMPTS, PILLARS, addContent_, writePost_, contentRow_, contentItem_,
 * contentVersion_, commitContent_, designPost_, writeTweet_, brandOf_, cleanText_, digest_, cell_, columnValues_, stripFences_,
 * appError_, checkBudget_, withWriteLock_, BRAND_LOOKS. وعلى Office.gs: officeLoad_.
 */

const SITES_ = {
  defaults: [
    { brand: "انطلق", url: "https://www.entaliq.com.sa/ar", enabled: true },
    { brand: "وهج", url: "https://wahaj-solar.netlify.app/", enabled: true }
  ],
  sheet: "Sites",
  headers: ["الرابط", "العلامة", "العنوان", "النص", "البصمة", "آخر فحص", "آخر أفكار", "عدد الأفكار"],
  maxPagesPerSite: 10, maxText: 6000, minText: 150,
  pagesPerRun: 2, ideasPerPage: 2, draftsPerRun: 2,
  pillars: ["نصائح ترشيد", "حالات استخدام", "عن الشركة"],
  skip: /\/(login|signin|signup|portal|privacy|terms|cart|account)(\/|$)|\.(css|js|png|jpe?g|gif|webp|svg|ico|pdf|xml|json|webmanifest|txt|zip)$/i,
  marker: "صفحة من موقعنا"
};

// ---------------- الإعدادات ----------------
function sitesList_() {
  const cfg = typeof officeLoad_ === "function" ? officeLoad_().cfg : {};
  return Array.isArray(cfg.sites) && cfg.sites.length ? cfg.sites : SITES_.defaults;
}

function sitesValidate_(list) {
  if (!Array.isArray(list) || list.length > 6) throw appError_("VALIDATION_ERROR", "حتى 6 مواقع");
  return list.map(s => {
    const url = String((s && s.url) || "").trim();
    if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(url)) throw appError_("VALIDATION_ERROR", "رابط موقع غير صالح: " + url);
    if (!Object.prototype.hasOwnProperty.call(BRAND_LOOKS, s.brand)) throw appError_("VALIDATION_ERROR", "علامة غير معروفة: " + s.brand);
    return { brand: s.brand, url: url, enabled: s.enabled !== false };
  });
}

function sitesSheet_(ss) {
  let sheet = ss.getSheetByName(SITES_.sheet);
  if (!sheet) {
    withWriteLock_(() => {
      sheet = ss.getSheetByName(SITES_.sheet);
      if (!sheet) { sheet = ss.insertSheet(SITES_.sheet); sheet.appendRow(SITES_.headers); sheet.setFrozenRows(1); }
    });
  }
  return sheet;
}

// ---------------- القراءة ----------------
function sitesFetch_(url) {
  checkBudget_(15000);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { "Accept-Language": "ar,en;q=0.5" } });
  if (res.getResponseCode() !== 200) throw new Error("HTTP " + res.getResponseCode());
  return res.getContentText();
}

// نص الصفحة: العنوان والوصف ثم العناوين والفقرات وعناصر القوائم، بلا سكربتات أو قوائم تنقل مكررة
function sitesPageText_(html) {
  const title = cleanText_((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const desc = ((html.match(/<meta[^>]+name=["']description["'][^>]*>/i) || [""])[0].match(/content=["']([^"']*)["']/i) || [])[1] || "";
  const page = html.replace(/<(script|style|noscript|svg|nav|footer|form|template)\b[\s\S]*?<\/\1>/gi, " ");
  const blocks = [...page.matchAll(/<(h[1-4]|p|li|blockquote|figcaption|dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(m => cleanText_(m[2]).replace(/\s+/g, " ").trim())
    .filter(t => t.length >= 12);
  const unique = blocks.filter((t, i) => blocks.indexOf(t) === i);
  const text = [cleanText_(desc)].concat(unique).filter(Boolean).join("\n").slice(0, SITES_.maxText);
  return { title: title, text: text };
}

function sitesLinks_(html, root) {
  const base = root.match(/^(https:\/\/[^/]+)(\/.*)?$/), origin = base[1];
  const prefix = (base[2] || "").replace(/\/$/, ""); // www.entaliq.com.sa/ar → صفحات /ar فقط؛ الجذر → كل الصفحات
  const out = [];
  [...html.matchAll(/href=["']([^"'#]+)["']/gi)].forEach(m => {
    let href = m[1].trim();
    if (/^(mailto|tel|javascript|data):/i.test(href)) return;
    if (href.indexOf("//") === 0) href = "https:" + href;
    if (href[0] === "/") href = origin + href;
    if (href.indexOf(origin + "/") !== 0 && href !== origin) return;
    href = href.split("?")[0].replace(/\/$/, "") || origin;
    const path = href.slice(origin.length) || "/";
    if (SITES_.skip.test(path) || /\/en(\/|$)/.test(path)) return;
    if (prefix && path.indexOf(prefix) !== 0) return;
    if (out.indexOf(href) < 0) out.push(href);
  });
  return out;
}

// يقرأ صفحات المواقع المفعّلة ويحدّث ورقة Sites؛ يعيد الصفحات مع حالة كل منها
function sitesScan_(ss) {
  const sheet = sitesSheet_(ss), now = new Date(), result = { pages: [], warnings: [] };
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, SITES_.headers.length).getValues() : [];
  const index = {};
  rows.forEach((r, i) => { index[r[0]] = i; });
  sitesList_().filter(s => s.enabled !== false).forEach(site => {
    let rootHtml;
    try { rootHtml = sitesFetch_(site.url); }
    catch (err) { if (err.code === "BUDGET_EXCEEDED") throw err; result.warnings.push(site.brand + ": تعذر فتح " + site.url + " (" + err.message + ")"); return; }
    const urls = [site.url.replace(/\/$/, "")].concat(sitesLinks_(rootHtml, site.url)).filter((u, i, a) => a.indexOf(u) === i).slice(0, SITES_.maxPagesPerSite);
    urls.forEach((url, n) => {
      try {
        const html = n === 0 ? rootHtml : sitesFetch_(url);
        const p = sitesPageText_(html);
        if (p.text.length < SITES_.minText) { if (n === 0) result.warnings.push(site.brand + ": الصفحة الرئيسية بلا نص مقروء (قد تحتاج JavaScript)"); return; }
        const hash = digest_(p.text), at = index[url];
        const prev = at === undefined ? null : rows[at];
        const status = !prev ? "new" : prev[4] !== hash ? "changed" : "same";
        const row = [url, site.brand, p.title, p.text, hash, now, prev ? prev[6] : "", prev ? prev[7] : 0];
        if (prev) rows[at] = row; else { index[url] = rows.length; rows.push(row); }
        result.pages.push({ url: url, brand: site.brand, title: p.title, text: p.text, status: status, lastIdeas: row[6], ideasCount: Number(row[7]) || 0 });
      } catch (err) {
        if (err.code === "BUDGET_EXCEEDED") throw err;
        result.warnings.push(site.brand + ": " + url + " — " + err.message);
      }
    });
  });
  withWriteLock_(() => {
    if (rows.length) sheet.getRange(2, 1, rows.length, SITES_.headers.length).setValues(rows.map(r => r.map(cell_)));
  });
  return result;
}

// سياق صفحة محفوظة لتكتب منها لمى (ويُستخدم أيضاً عند «اكتب المنشور» و«إعادة الكتابة» لفكرة من الموقع)
function siteContext_(ss, url) {
  const sheet = ss.getSheetByName(SITES_.sheet);
  if (!sheet || sheet.getLastRow() < 2) return "";
  const row = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().find(r => r[0] === url);
  return row ? SITES_.marker + " (" + row[1] + "): " + row[2] + "\nالرابط: " + row[0] + "\n\nنص الصفحة:\n" + row[3] : "";
}

// ---------------- الأفكار ----------------
function sitesIdeas_(page, recentIdeas) {
  const audience = page.brand === "وهج" ? "وهج" : "انطلق";
  const raw = callGemini(AGENTS_PROMPTS["راكان"],
    "هذه صفحة من موقعنا. اقترح حتى " + SITES_.ideasPerPage + " أفكار منشورات LinkedIn مبنية على ما ورد فيها فقط (خدمة، منتج، خطوة، فائدة، قطاع، سؤال يطرحه العميل).\n"
    + "لا تكرر هذه الأفكار الموجودة: " + (recentIdeas.slice(0, 40).join(" | ") || "لا يوجد") + "\n"
    + 'أعد JSON فقط: {"ideas": [{"pillar": "' + SITES_.pillars.join('" أو "') + '", "audience": "انطلق" أو "وهج" (الأقرب: ' + audience + '), '
    + '"service": الخدمة أو المنتج من ملف الشركة, "idea": عنوان الفكرة, "angle": زاوية المعالجة في جملة}]}\n\n'
    + siteContextFromPage_(page), true);
  let j = null;
  try { j = JSON.parse(stripFences_(raw)); } catch (e) {}
  const items = j && Array.isArray(j.ideas) ? j.ideas : Array.isArray(j) ? j : [];
  return items.filter(it => it && SITES_.pillars.indexOf(it.pillar) >= 0 && ["انطلق", "وهج"].indexOf(it.audience) >= 0
      && typeof it.service === "string" && it.service.trim() && typeof it.idea === "string" && it.idea.trim())
    .slice(0, SITES_.ideasPerPage)
    .map(it => ({ pillar: it.pillar, audience: it.audience, service: it.service.trim().slice(0, 80), idea: it.idea.trim().slice(0, 200), angle: String(it.angle || "").slice(0, 300) }));
}

function siteContextFromPage_(page) {
  return SITES_.marker + " (" + page.brand + "): " + page.title + "\nالرابط: " + page.url + "\n\nنص الصفحة:\n" + page.text;
}

// ---------------- التشغيل ----------------
// mode: "full" = أفكار + كتابة أول فكرتين وتصميمهما، "ideas" = أفكار فقط
function sitesRun_(mode) {
  const ss = setupSheets(), sheet = ss.getSheetByName("Content");
  const scan = sitesScan_(ss);
  const result = { mode: mode, scanned: scan.pages.length, pages: 0, ideas: 0, drafts: 0, designed: 0, failed: 0, warnings: scan.warnings.slice() };
  // الجديد والمتغيّر أولاً، ثم الأقل استخداماً، حتى يعطي كل تشغيل أفكاراً من صفحات مختلفة
  // وبالتناوب بين المواقع: صفحة من انطلق ثم من وهج… حتى لا يأخذ موقع واحد كل التشغيل
  const order = { new: 0, changed: 1, same: 2 };
  const ranked = scan.pages.slice().sort((a, b) => order[a.status] - order[b.status]
    || String(a.lastIdeas || "").localeCompare(String(b.lastIdeas || "")) || a.ideasCount - b.ideasCount);
  const byBrand = {};
  ranked.forEach(p => { (byBrand[p.brand] = byBrand[p.brand] || []).push(p); });
  const picked = [];
  for (let round = 0; picked.length < SITES_.pagesPerRun && round < SITES_.maxPagesPerSite; round++) {
    Object.keys(byBrand).forEach(b => { if (picked.length < SITES_.pagesPerRun && byBrand[b][round]) picked.push(byBrand[b][round]); });
  }
  if (!picked.length) { result.warnings.push("لم تُقرأ أي صفحة بنص كافٍ من المواقع المفعّلة"); return sitesMessage_(result); }
  const recent = columnValues_(sheet, 7).slice(-200).map(String).reverse();
  const created = [];
  for (const page of picked) {
    try {
      checkBudget_(40000);
      const ideas = sitesIdeas_(page, recent);
      ideas.forEach(it => {
        const id = withWriteLock_(() => addContent_(Object.assign({}, it, { status: "فكرة", source: page.url, note: "من موقع " + page.brand + ": " + page.title })));
        created.push({ id: id, brief: it, page: page });
        recent.unshift(it.idea);
      });
      result.ideas += ideas.length;
      result.pages++;
      sitesMarkUsed_(ss, page.url, ideas.length);
    } catch (err) {
      result.warnings.push(page.title + ": " + err.message);
      if (err.code === "BUDGET_EXCEEDED") break;
      result.failed++;
    }
  }
  if (mode === "full") {
    // أول فكرة من كل صفحة أولاً (فيُكتب منشور لانطلق وآخر لوهج)، ثم البقية
    const firsts = created.filter((c, i) => created.findIndex(x => x.page.url === c.page.url) === i);
    const queue = firsts.concat(created.filter(c => firsts.indexOf(c) < 0));
    for (const c of queue.slice(0, SITES_.draftsPerRun)) {
      try {
        checkBudget_(60000);
        const post = writePost_(Object.assign({ context: siteContextFromPage_(c.page) }, c.brief));
        let saved = commitContent_(sheet, { id: c.id, version: contentVersion_(contentItem_(sheet, contentRow_(sheet, c.id))) }, cur => {
          cur[7] = post.text; cur[8] = post.audit; cur[9] = "مسودة"; return cur;
        });
        result.drafts++;
        try {
          checkBudget_(40000);
          const brand = brandOf_(c.brief.audience, c.brief.service), warnings = [];
          let design;
          try { design = designPost_(brand, saved.item, post.text, warnings); }
          catch (err) { // نصوص التصميم أطول من القالب أحياناً: محاولة ثانية واحدة
            if (err.code !== "INVALID_PREPARED_CONTENT") throw err;
            checkBudget_(30000);
            design = designPost_(brand, saved.item, post.text, warnings);
          }
          const tweet = writeTweet_(brand, post.text, warnings);
          saved = commitContent_(sheet, { id: c.id, version: saved.version }, cur => { cur[12] = JSON.stringify(design); cur[13] = tweet; return cur; });
          result.designed++;
        } catch (err) {
          result.warnings.push(c.brief.idea + " (التصميم): " + err.message + " — جهّزه من زر «جهّز التصميم ونسخة X»");
          if (err.code === "BUDGET_EXCEEDED") break;
        }
      } catch (err) {
        result.warnings.push(c.brief.idea + ": " + err.message + " — بقيت «فكرة» ويمكن كتابتها من اللوحة");
        if (err.code === "BUDGET_EXCEEDED") break;
        result.failed++;
      }
    }
  }
  return sitesMessage_(result);
}

function sitesMarkUsed_(ss, url, count) {
  const sheet = ss.getSheetByName(SITES_.sheet), urls = columnValues_(sheet, 1), i = urls.indexOf(url);
  if (i < 0) return;
  withWriteLock_(() => {
    const r = sheet.getRange(i + 2, 7, 1, 2), v = r.getValues()[0];
    r.setValues([[new Date(), (Number(v[1]) || 0) + count]]);
  });
}

function sitesMessage_(r) {
  r.message = "صفحات مقروءة: " + r.scanned + " · صفحات استُخدمت: " + r.pages + " · أفكار جديدة: " + r.ideas
    + (r.mode === "full" ? " · مسودات للمراجعة: " + r.drafts + " · مصممة: " + r.designed : "")
    + (r.failed ? " · تعذرت: " + r.failed : "");
  return r;
}
