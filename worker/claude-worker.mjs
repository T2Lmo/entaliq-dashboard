#!/usr/bin/env node
// عامل Claude لمكتب انطلق: يسحب طلبات الوكلاء من خادم Apps Script وينفذها بـ Claude Code باشتراكك (بدون API).
// ويرسل رسائل مازن التي وافقت عليها من بريد الشركة (SMTP) إن ضُبطت SMTP_* في .env؛ كلمة المرور تبقى على جهازك فقط.
// التشغيل: node claude-worker.mjs   (الإعدادات في worker/.env — انظر .env.example)
// اختبار البريد: node claude-worker.mjs --mail-test   (يرسل رسالة تجريبية إلى بريدك نفسه)
// يحتاج Node 20+ و Claude Code مسجّل الدخول (شغّل claude مرة واحدة وسجّل الدخول)، و npm install مرة واحدة للبريد.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, ".env"));

const EXEC_URL = process.env.EXEC_URL || "";
const WORKER_TOKEN = process.env.WORKER_TOKEN || "";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "sonnet";
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS) || 280000; // أقل من انتظار الخادم (5 دقائق)

if ((!EXEC_URL || !WORKER_TOKEN) && !process.argv.includes("--mail-test")) {
  console.error("أضف EXEC_URL و WORKER_TOKEN في worker/.env (انسخ .env.example).");
  process.exit(1);
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const log = (...a) => console.log(new Date().toLocaleTimeString("en-GB"), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(body, timeoutMs = 60000) {
  const res = await fetch(EXEC_URL, {
    method: "POST", redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, workerToken: WORKER_TOKEN })
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`رد غير متوقع (${res.status}): ${text.slice(0, 200)}`); }
  if (data.status !== "success") throw new Error(data.message || "خطأ من الخادم");
  return data;
}

// ينفذ مهمة واحدة بـ claude -p: تعليمات الوكيل كـ system prompt، والطلب عبر stdin
function runClaude(job) {
  return new Promise(resolve => {
    const dir = mkdtempSync(join(tmpdir(), "entaliq-claude-"));
    const sysFile = join(dir, "system.txt");
    writeFileSync(sysFile, job.system || "أنت مساعد مفيد. أجب بالعربية.", "utf8");
    const tools = job.web ? "WebSearch,WebFetch" : "";
    const args = ["-p", "--model", job.model || DEFAULT_MODEL, "--output-format", "json",
      "--system-prompt-file", sysFile, "--tools", tools, "--strict-mcp-config", "--no-session-persistence"];
    if (job.web) args.push("--allowedTools", "WebSearch", "WebFetch");
    const child = spawn(CLAUDE_BIN, args, { cwd: dir, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "", done = false;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); try { rmSync(dir, { recursive: true, force: true }); } catch {} resolve(r); };
    const timer = setTimeout(() => { child.kill(); finish({ error: "تجاوز الوقت المسموح للمهمة" }); }, JOB_TIMEOUT_MS);
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    child.on("error", e => finish({ error: `تعذر تشغيل ${CLAUDE_BIN}: ${e.message}` }));
    child.on("close", code => {
      try {
        const j = JSON.parse(out);
        if (j.is_error) return finish({ error: String(j.result || j.subtype || "خطأ من Claude") });
        finish({ result: String(j.result ?? ""), costUsd: j.total_cost_usd, ms: j.duration_ms });
      } catch {
        finish({ error: `خرج claude بالرمز ${code}: ${(err || out).slice(0, 400)}` });
      }
    });
    child.stdin.end(job.prompt || "");
  });
}

async function main() {
  log(`عامل Claude يعمل — النموذج الافتراضي: ${DEFAULT_MODEL}. أوقفه بـ Ctrl+C.`);
  let backoff = 2000;
  while (true) {
    try {
      const { job } = await call({ action: "claude_next", waitMs: 20000 }, 45000);
      backoff = 2000;
      if (!job) continue;
      log(`مهمة ${job.id.slice(0, 8)} (${job.model || DEFAULT_MODEL}${job.web ? "، مع البحث" : ""}) — ${job.prompt.length} حرف`);
      const t0 = Date.now();
      const r = await runClaude(job);
      await call({ action: "claude_done", id: job.id, result: r.result, error: r.error });
      log(r.error ? `فشلت: ${r.error}` : `اكتملت في ${Math.round((Date.now() - t0) / 1000)} ث — ${r.result.length} حرف`);
    } catch (e) {
      log(`خطأ في الاتصال: ${e.message}. إعادة المحاولة بعد ${backoff / 1000} ث`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}

// ---------------- بريد الشركة: إرسال رسائل مازن التي وافقت عليها ----------------
// الخادم يجدول الرسائل متباعدة في أيام وساعات الإرسال وبحد يومي؛ العامل يسأل كل دقيقة ويرسل ما حان موعده.
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP = {
  host: process.env.SMTP_HOST || "", port: SMTP_PORT, user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "",
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE !== "false" : SMTP_PORT === 465, ignoreTLS: process.env.SMTP_IGNORE_TLS === "true"
};
const MAIL_FROM = process.env.MAIL_FROM || SMTP.user;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "انطلق للطاقة";
const MAIL_BCC = process.env.MAIL_BCC || "";
const MAIL_POLL_MS = Number(process.env.MAIL_POLL_MS) || 60000;
const mailEnabled = !!(SMTP.host && SMTP.user && SMTP.pass);

async function makeTransport() {
  let nodemailer;
  try { nodemailer = (await import("nodemailer")).default; }
  catch { throw new Error("مكتبة البريد غير مثبتة: شغّل npm install داخل مجلد worker مرة واحدة (أو أعد فتح start-worker.cmd)."); }
  return nodemailer.createTransport({ host: SMTP.host, port: SMTP.port, secure: SMTP.secure, auth: { user: SMTP.user, pass: SMTP.pass },
    ignoreTLS: SMTP.ignoreTLS, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 60000 });
}

// نص عادي (أفضل للوصول إلى صندوق الوارد)، والرد إلى بريدك، ورابط إلغاء الاشتراك، والمتابعة في نفس المحادثة
function mailMessage(job) {
  return {
    from: { name: MAIL_FROM_NAME, address: MAIL_FROM }, to: job.to, subject: job.subject, text: job.body, replyTo: MAIL_FROM,
    bcc: MAIL_BCC || undefined, inReplyTo: job.inReplyTo || undefined, references: job.references || undefined,
    headers: { "List-Unsubscribe": `<mailto:${MAIL_FROM}?subject=unsubscribe>` }
  };
}

async function mailLoop() {
  let transport = null;
  while (!transport) {
    try { transport = await makeTransport(); await transport.verify(); log(`البريد جاهز: يرسل من ${MAIL_FROM} عبر ${SMTP.host}`); }
    catch (e) { log(`تعذر تجهيز البريد: ${e.message}. إعادة المحاولة بعد 5 دقائق`); transport = null; await sleep(300000); }
  }
  while (true) {
    try {
      const { job } = await call({ action: "mail_next", from: MAIL_FROM }, 45000);
      if (!job) { await sleep(MAIL_POLL_MS); continue; }
      let ok = false, messageId = "", error = "";
      try { const info = await transport.sendMail(mailMessage(job)); ok = true; messageId = info.messageId || ""; }
      catch (e) { error = e.message; }
      await call({ action: "mail_done", id: job.id, ok, messageId, error });
      log(ok ? `أُرسلت ${job.kind === "follow" ? "متابعة" : "رسالة"} إلى ${job.to}` : `تعذر الإرسال إلى ${job.to}: ${error}`);
      await sleep(3000);
    } catch (e) {
      log(`خطأ في بريد العامل: ${e.message}`);
      await sleep(MAIL_POLL_MS);
    }
  }
}

async function mailTest() {
  if (!mailEnabled) { console.error("أضف SMTP_HOST و SMTP_USER و SMTP_PASS في worker/.env أولاً."); process.exit(1); }
  const transport = await makeTransport();
  await transport.verify();
  const info = await transport.sendMail(mailMessage({ to: MAIL_FROM, subject: "اختبار بريد مكتب انطلق",
    body: "هذه رسالة تجريبية من عامل مكتب انطلق للتأكد من إعدادات البريد.\nإن وصلتك فالإرسال يعمل." }));
  console.log(`أُرسلت الرسالة التجريبية إلى ${MAIL_FROM} — ${info.messageId}`);
}

if (process.argv.includes("--once")) {
  // اختبار محلي: node claude-worker.mjs --once "سؤال"
  const prompt = process.argv[process.argv.indexOf("--once") + 1] || "قل مرحباً بجملة واحدة.";
  runClaude({ id: "local", system: "أجب بالعربية باختصار.", prompt, model: DEFAULT_MODEL }).then(r => { console.log(r); process.exit(r.error ? 1 : 0); });
} else if (process.argv.includes("--mail-test")) {
  mailTest().then(() => process.exit(0), e => { console.error(`تعذر الإرسال: ${e.message}`); process.exit(1); });
} else {
  if (mailEnabled) mailLoop();
  else log("البريد غير مضبوط (SMTP_* في worker/.env)؛ رسائل مازن تُرسل يدوياً من اللوحة.");
  main();
}
