// tools/deploy-server.mjs — تحديث خادم المكتب (Google Apps Script) بأمر واحد: deploy-server.cmd
//
// الخطوات:
//  1) يتأكد أنك مسجل دخولك في clasp (أداة Google الرسمية)، وإلا يفتح لك تسجيل الدخول مرة واحدة.
//  2) يسحب الكود المنشور الآن من مشروعك، ويحفظ منه نسخة احتياطية في local/server-backups/.
//  3) إن تغيّر الكود في المحرر منذ آخر نشر من هنا (عدّلته بيدك مثلاً) يتوقف ويسألك قبل الاستبدال.
//  4) يبني الملف الكامل (local/build-server.mjs) ويتأكد أنه سليم.
//  5) يرفعه مكان الملف نفسه، وينشئ نسخة، ويحدّث النشر نفسه، فيبقى رابط /exec كما هو.
//  6) يسأل الخادم عن رقم نسخته ليتأكد أن الكود الجديد هو الذي يرد.
//
// أول مرة يسألك عن معرّف المشروع (Script ID)، ويأخذ رابط /exec من worker/.env، ويحفظهما في local/deploy.json.
// الخيارات: --check (يسحب ويبني ويقارن فقط، بلا رفع)  --yes (بلا أسئلة)  --force (يستبدل حتى لو تغيّر الكود في المحرر)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, rmSync, appendFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "..");
const DIR = process.env.ENTALIQ_DEPLOY_DIR || path.join(repo, "local");
const CFG = path.join(DIR, "deploy.json"), WORK = path.join(DIR, "deploy-work"), BACKUPS = path.join(DIR, "server-backups");
const LAST = path.join(DIR, "deploy-last.gs"), BUILT = path.join(DIR, "Code-complete.gs"), BUILDER = path.join(repo, "local", "build-server.mjs");
const CLASP = process.env.ENTALIQ_CLASP || "npx --yes @google/clasp@3.4.1";
const argv = process.argv.slice(2), CHECK = argv.includes("--check"), YES = argv.includes("--yes"), FORCE = argv.includes("--force");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const say = m => console.log(m);
const step = (n, m) => console.log("\n[" + n + "/6] " + m);
const done = (code, msg) => { if (msg) console[code ? "error" : "log"]((code ? "\n✕ " : "\n✓ ") + msg); rl.close(); process.exit(code); };
const fail = msg => done(1, msg);
const ask = async q => YES ? "" : (await rl.question(q)).trim();
const norm = s => String(s || "").replace(/\r\n/g, "\n").trim();
const lines = n => n === 1 ? "سطر واحد" : n === 2 ? "سطران" : n <= 10 ? n + " أسطر" : n.toLocaleString("en-US") + " سطراً";

function clasp(args, opts = {}) {
  const r = spawnSync(CLASP + " " + args, { shell: true, cwd: opts.cwd || WORK, encoding: "utf8", stdio: opts.inherit ? "inherit" : "pipe", env: process.env });
  return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).replace(/^npm notice.*$/gm, "").trim() };
}
const walk = d => readdirSync(d).flatMap(n => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const execOf = url => { const m = String(url || "").match(/^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]{20,})\/exec\/?$/); return m ? m[1] : ""; };
function envExec() {
  try { const m = readFileSync(path.join(repo, "worker", ".env"), "utf8").match(/^\s*EXEC_URL\s*=\s*["']?([^"'\s]+)/m); return m ? m[1] : ""; }
  catch (e) { return ""; }
}

// ---------------- الإعدادات (مرة واحدة) ----------------
const saveCfg = c => { mkdirSync(DIR, { recursive: true }); writeFileSync(CFG, JSON.stringify(c, null, 2)); };
// معرّف المشروع، أو رابط المحرر الذي فيه المعرّف (…/projects/<ID>/edit)
const scriptIdOf = v => { const s = String(v || "").trim().replace(/^["']|["']$/g, ""); const m = s.match(/\/projects\/([A-Za-z0-9_-]{30,})/); return m ? m[1] : /^[A-Za-z0-9_-]{30,}$/.test(s) ? s : ""; };
// يسأل حتى يأتي جواب صالح (3 محاولات)، ويشرح الخطأ بدل أن يتوقف
async function askUntil(question, parse, wrong) {
  for (let i = 0; i < 3; i++) {
    const v = parse(await ask(question));
    if (v) return v;
    say("  ✕ " + wrong + " جرّب مرة ثانية.");
  }
  return "";
}

async function config() {
  let c = {};
  try { c = JSON.parse(readFileSync(CFG, "utf8")); } catch (e) { /* أول مرة */ }
  let changed = false;
  if (!c.original || !existsSync(c.original)) {
    const guess = [path.resolve(repo, "..", "Code-complete.gs")].find(p => existsSync(p)) || "";
    if (guess) say("ملف الخادم الأصلي: " + guess);
    else if (!YES) say("\nما لقيت ملف الخادم الأصلي (Code-complete.gs الذي بُنيت عليه وحدات المكتب) بجانب مجلد المستودع.");
    c.original = guess || (YES ? "" : await askUntil("اكتب مساره الكامل: ", v => { const p = v.replace(/^["']|["']$/g, ""); return existsSync(p) ? p : ""; }, "ما لقيت ملفاً بهذا المسار."));
    if (!c.original) fail("ما لقيت ملف الخادم الأصلي. ضع مساره في " + CFG + " (الحقل original).");
    changed = true;
  }
  if (!c.scriptId) {
    c.scriptId = scriptIdOf(process.env.ENTALIQ_SCRIPT_ID);
    if (!c.scriptId && !YES) {
      say("\nمعرّف المشروع (Script ID): من محرر Apps Script ← ⚙️ إعدادات المشروع ← المعرّفات ← «معرّف النص البرمجي».");
      c.scriptId = await askUntil("الصق معرّف المشروع هنا ثم Enter: ", scriptIdOf, "هذا ليس معرّف مشروع (نص طويل من حروف وأرقام، يبدأ عادة بـ 1).");
    }
    if (!c.scriptId) fail("معرّف المشروع مطلوب. ضعه في " + CFG + " (الحقل scriptId).");
    changed = true;
  }
  // رابط /exec: من الإعدادات أو worker/.env، وإلا يُعرف من نشرات المشروع بعد تسجيل الدخول (resolveDeployment)
  if (!c.execUrl || !c.deploymentId) {
    const url = process.env.ENTALIQ_EXEC_URL || envExec();
    const id = process.env.ENTALIQ_DEPLOYMENT_ID || execOf(url);
    if (url && id) { c.execUrl = url; c.deploymentId = id; changed = true; }
  }
  if (changed) { saveCfg(c); say("حُفظت الإعدادات في " + CFG); }
  return c;
}

// النشر الذي يرد عليه رابط /exec: إن لم يُعرف من الإعدادات، نقرؤه من نشرات المشروع نفسه
async function resolveDeployment(c) {
  if (c.execUrl && c.deploymentId) return;
  const r = clasp("--json list-deployments " + c.scriptId, { cwd: repo });
  let list = [];
  try {
    const j = JSON.parse(r.out.slice(r.out.search(/[[{]/)));
    // clasp 3.4 يعطي {deploymentId, versionNumber, description}؛ والإصدارات الأقدم تضعها داخل deploymentConfig
    list = (Array.isArray(j) ? j : j.deployments || []).map(d => { const k = d.deploymentConfig || {};
      return { id: d.deploymentId, version: d.versionNumber || k.versionNumber, desc: d.description || k.description || "" }; })
      .filter(d => d.id && d.version).sort((a, b) => b.version - a.version);
  } catch (e) { /* نسأل عن الرابط */ }
  let pick = null;
  if (list.length === 1) pick = list[0];
  else if (list.length > 1 && !YES) {
    say("\nفي المشروع أكثر من نشر. اختر الذي رابطه في إعدادات اللوحة (⚙️ ← رابط تطبيق الويب):");
    list.forEach((d, i) => say("  " + (i + 1) + ") https://script.google.com/macros/s/" + d.id + "/exec  (النسخة " + d.version + (d.desc ? " · " + d.desc : "") + ")"));
    const n = await askUntil("اكتب رقم النشر ثم Enter: ", v => { const k = Number(v); return k >= 1 && k <= list.length ? String(k) : ""; }, "اكتب رقماً من القائمة.");
    pick = n ? list[Number(n) - 1] : null;
  }
  if (!pick && !YES) {
    const url = await askUntil("\nالصق رابط /exec من إعدادات اللوحة (⚙️ ← رابط تطبيق الويب) ثم Enter: ", v => execOf(v.trim()) ? v.trim() : "", "الرابط يجب أن يكون بالشكل https://script.google.com/macros/s/…/exec");
    if (url) pick = { id: execOf(url) };
  }
  if (!pick) fail("ما عرفت النشر الذي يرد عليه رابط /exec. ضع الرابط في " + CFG + " (الحقلان execUrl وdeploymentId).");
  c.deploymentId = pick.id; c.execUrl = "https://script.google.com/macros/s/" + pick.id + "/exec";
  saveCfg(c);
  say("النشر: " + c.execUrl);
}

// ---------------- 1) تسجيل الدخول ----------------
// هل نزّل npx أداة clasp من قبل؟ (أول تنزيل بضع دقائق بلا أي مخرجات، فننبه قبله)
function claspCached() {
  if (process.env.ENTALIQ_CLASP) return true;
  const base = process.platform === "win32" ? path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx") : path.join(process.env.HOME || "", ".npm", "_npx");
  try { return readdirSync(base).some(d => existsSync(path.join(base, d, "node_modules", "@google", "clasp", "package.json"))); } catch (e) { return false; }
}
async function ensureLogin() {
  step(1, "التحقق من تسجيل الدخول في clasp");
  if (!claspCached()) say("أول مرة على هذا الجهاز: ينزّل أداة Google ‏(clasp) بصمت، وقد يأخذ بضع دقائق. لا تغلق النافذة…");
  const state = () => { const r = clasp("--json show-authorized-user", { cwd: repo }); try { return JSON.parse(r.out.slice(r.out.indexOf("{"))); } catch (e) { return { loggedIn: false, raw: r.out }; } };
  let s = state();
  if (s.loggedIn) { say("مسجل الدخول" + (s.email ? " بـ " + s.email : "")); return; }
  say("تحتاج تسجيل دخول Google مرة واحدة:");
  say("  أ) فعّل «Google Apps Script API» من: https://script.google.com/home/usersettings");
  say("  ب) سيفتح المتصفح: ادخل بحساب Google صاحب الخادم ووافق.");
  if (YES) fail("شغّل الأمر بدون --yes لتسجيل الدخول أول مرة.");
  await ask("اضغط Enter لفتح تسجيل الدخول… ");
  clasp("login", { cwd: repo, inherit: true });
  s = state();
  if (!s.loggedIn) fail("لم يكتمل تسجيل الدخول. أعد تشغيل الأمر.");
  say("تم تسجيل الدخول" + (s.email ? " بـ " + s.email : ""));
}

// ---------------- 2) سحب المنشور الآن ونسخة احتياطية ----------------
function pullRemote(c) {
  step(2, "سحب الكود المنشور الآن ونسخة احتياطية منه");
  rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true });
  const r = clasp("clone " + c.scriptId + " --rootDir src");
  if (!r.ok) fail("تعذر سحب المشروع من Google:\n" + r.out + "\n\nتأكد من معرّف المشروع في " + CFG + "، ومن تفعيل Apps Script API في https://script.google.com/home/usersettings");
  const src = path.join(WORK, "src");
  if (!existsSync(src)) fail("لم يُسحب أي ملف من المشروع.");
  const files = walk(src), code = files.filter(f => /\.(gs|js)$/i.test(f));
  if (!files.some(f => path.basename(f) === "appsscript.json")) fail("المشروع المسحوب بلا appsscript.json؛ توقفت حتى لا أغيّر إعدادات النشر.");
  if (code.length !== 1) fail("المشروع فيه " + code.length + " ملفات كود:\n  " + code.map(f => path.relative(src, f)).join("\n  ")
    + "\nهذا الأمر يتوقع ملفاً واحداً (الكود الكامل الذي تلصقه). احذف الزائد من المحرر أو ادمجه، ثم أعد المحاولة.");
  const project = existsSync(path.join(WORK, ".clasp.json")) ? WORK : src;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const backup = path.join(BACKUPS, stamp);
  files.forEach(f => { const to = path.join(backup, path.relative(src, f)); mkdirSync(path.dirname(to), { recursive: true }); copyFileSync(f, to); });
  say("سُحب " + path.basename(code[0]) + " (" + lines(norm(readFileSync(code[0], "utf8")).split("\n").length) + ")، والنسخة الاحتياطية في:\n  " + backup);
  return { src, codeFile: code[0], project, backup };
}

// ---------------- 3) هل تغيّر الكود في المحرر؟ ----------------
async function checkDrift(remote) {
  step(3, "مقارنة المنشور بآخر نشر من هذا الجهاز");
  const now = norm(readFileSync(remote.codeFile, "utf8"));
  const prev = existsSync(LAST) ? norm(readFileSync(LAST, "utf8")) : existsSync(BUILT) ? norm(readFileSync(BUILT, "utf8")) : null;
  if (prev === null) { say("أول نشر من هنا؛ النسخة الاحتياطية تحفظ ما كان منشوراً."); return; }
  if (now === prev) { say("المنشور مطابق لآخر نسخة بُنيت هنا."); return; }
  say("⚠ الكود المنشور يختلف عن آخر نسخة بُنيت أو نُشرت من هنا (ربما عدّلت في المحرر بيدك، أو ما لصقت آخر نسخة).");
  say("  نسخة مما هو منشور الآن محفوظة في: " + remote.backup);
  if (CHECK) return;
  if (FORCE) { say("  --force: سأستبدله."); return; }
  if (YES) fail("توقفت حتى لا أستبدل تعديلاً يدوياً. راجع النسخة الاحتياطية، ثم أعد التشغيل مع --force إن أردت الاستبدال.");
  const a = await ask("أكمل وأستبدله بالنسخة الجديدة؟ اكتب «نعم» للمتابعة: ");
  if (!/^(نعم|y|yes)$/i.test(a)) fail("ما رفعت شي.");
}

// ---------------- 4) البناء ----------------
function build(c) {
  step(4, "بناء الملف الكامل والتحقق منه");
  if (!existsSync(BUILDER)) fail("أداة البناء غير موجودة على هذا الجهاز: " + BUILDER);
  mkdirSync(DIR, { recursive: true });
  const b = spawnSync(process.execPath, [BUILDER, c.original, BUILT], { cwd: repo, encoding: "utf8" });
  if (b.status !== 0) fail("تعذر البناء:\n" + (b.stdout || "") + (b.stderr || ""));
  const code = readFileSync(BUILT, "utf8");
  try { new Function(code); } catch (e) { fail("الملف المبني فيه خطأ صياغة: " + e.message); }
  const m = code.match(/const HEALTH_ = \{[\s\S]{0,400}?server:\s*(\d+)/);
  if (!m) fail("لم أجد رقم نسخة الخادم (HEALTH_.server) في الملف المبني.");
  say("بُني الملف الكامل (" + lines(norm(code).split("\n").length) + ") وصياغته سليمة · نسخة الخادم " + m[1]);
  return { code, version: Number(m[1]) };
}

// ---------------- 5) الرفع والنشر ----------------
function sha() { const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : "local"; }

function deploy(c, remote, built) {
  step(5, "الرفع ونشر نسخة جديدة على الرابط نفسه");
  copyFileSync(BUILT, remote.codeFile);
  const P = '-P "' + remote.project + '"';
  const push = clasp(P + " push -f");
  if (!push.ok) fail("تعذر الرفع:\n" + push.out);
  const desc = "Entaliq office server v" + built.version + " (" + sha() + ") " + new Date().toISOString().slice(0, 16).replace("T", " ");
  const ver = clasp(P + ' create-version "' + desc + '"');
  const n = (ver.out.match(/version\s*(\d+)/i) || ver.out.match(/(\d+)/) || [])[1];
  if (!ver.ok || !n) fail("رُفع الكود لكن تعذر إنشاء نسخة:\n" + ver.out + "\nأكمل من المحرر: Deploy ← Manage deployments ← Edit ← New version.");
  const dep = clasp(P + " update-deployment " + c.deploymentId + " -V " + n + ' -d "' + desc + '"');
  if (!dep.ok) fail("أُنشئت النسخة " + n + " لكن تعذر تحديث النشر:\n" + dep.out + "\nأكمل من المحرر: Deploy ← Manage deployments ← Edit ← Version " + n + ".");
  say("رُفع الكود، والنسخة " + n + " منشورة على النشر نفسه.");
  return Number(n);
}

// ---------------- 6) التحقق من الخادم ----------------
async function verify(c, expected) {
  step(6, "التأكد أن الخادم يرد بالنسخة الجديدة");
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(c.execUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "server_version" }), redirect: "follow" });
      const j = await res.json();
      if (j && Number(j.server) === expected) { say("الخادم يرد بنسخة " + expected + "."); return true; }
      say("الخادم يرد بنسخة " + (j && j.server !== undefined ? j.server : "قديمة") + "؛ أنتظر قليلاً…");
    } catch (e) { say("ما وصلني رد بعد (" + e.message + ")؛ أنتظر قليلاً…"); }
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

// ---------------- التشغيل ----------------
(async () => {
  say("تحديث خادم مكتب انطلق" + (CHECK ? " (فحص فقط، بلا رفع)" : ""));
  const c = await config();
  await ensureLogin();
  await resolveDeployment(c);
  const remote = pullRemote(c);
  await checkDrift(remote);
  const built = build(c);
  if (CHECK) {
    const same = norm(readFileSync(remote.codeFile, "utf8")) === norm(built.code);
    done(0, same ? "المنشور مطابق للنسخة الجديدة؛ لا حاجة للرفع." : "النسخة الجديدة جاهزة (" + lines(norm(built.code).split("\n").length) + "، نسخة الخادم " + built.version + "). شغّل الأمر بدون --check لرفعها.");
  }
  const n = deploy(c, remote, built);
  writeFileSync(LAST, built.code);
  appendFileSync(path.join(DIR, "deploy-log.txt"), new Date().toISOString() + "\tversion " + n + "\tserver " + built.version + "\t" + sha() + "\n");
  const ok = await verify(c, built.version);
  if (!ok) done(1, "نُشرت النسخة " + n + " لكن الخادم ما رد برقم النسخة الجديد بعد. افتح «صحة المكتب» بعد دقيقة؛ إن بقي قديماً فتحقق من النشر في المحرر.");
  done(0, "تم: الخادم محدّث (نسخة الخادم " + built.version + "، نسخة Apps Script " + n + ")، والرابط /exec كما هو. النسخة الاحتياطية السابقة في:\n  " + remote.backup);
})().catch(e => fail(e && e.stack || String(e)));
