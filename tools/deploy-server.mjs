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
async function config() {
  let c = {};
  try { c = JSON.parse(readFileSync(CFG, "utf8")); } catch (e) { /* أول مرة */ }
  let changed = false;
  if (!c.original || !existsSync(c.original)) {
    const guess = [path.resolve(repo, "..", "Code-complete.gs")].find(p => existsSync(p)) || "";
    const typed = YES ? "" : await ask("\nملف الخادم الأصلي (Code-complete.gs الذي بُنيت عليه وحدات المكتب):\n  " + (guess || "لم أجده تلقائياً") + "\nاضغط Enter للموافقة، أو اكتب مساره: ");
    c.original = typed || guess;
    if (!c.original || !existsSync(c.original)) fail("ما لقيت ملف الخادم الأصلي. ضع مساره في " + CFG + " (الحقل original).");
    changed = true;
  }
  if (!c.execUrl) {
    c.execUrl = process.env.ENTALIQ_EXEC_URL || envExec() || await ask("\nرابط /exec للخادم (من إعدادات اللوحة): ");
    changed = true;
  }
  if (!c.deploymentId) {
    c.deploymentId = process.env.ENTALIQ_DEPLOYMENT_ID || execOf(c.execUrl);
    if (!c.deploymentId) fail("رابط /exec غير صالح؛ يجب أن يكون https://script.google.com/macros/s/…/exec");
    changed = true;
  }
  if (!c.scriptId) {
    say("\nمعرّف المشروع (Script ID): من محرر Apps Script ← ⚙️ Project Settings ← IDs ← Script ID.");
    c.scriptId = process.env.ENTALIQ_SCRIPT_ID || await ask("الصقه هنا: ");
    if (!/^[A-Za-z0-9_-]{30,}$/.test(c.scriptId)) fail("معرّف المشروع غير صالح.");
    changed = true;
  }
  if (changed) { mkdirSync(DIR, { recursive: true }); writeFileSync(CFG, JSON.stringify(c, null, 2)); say("حُفظت الإعدادات في " + CFG); }
  return c;
}

// ---------------- 1) تسجيل الدخول ----------------
async function ensureLogin() {
  step(1, "التحقق من تسجيل الدخول في clasp");
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
