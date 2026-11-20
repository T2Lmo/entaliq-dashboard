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

if ((!EXEC_URL || !WORKER_TOKEN) && !process.argv.includes("--mail-test") && !process.argv.includes("--inbox-test")) {
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

// ---------------- قراءة الوارد: ردود رسائل مازن والارتدادات وطلبات الإيقاف ----------------
// يقرأ صندوق الوارد كل 5 دقائق، ويرسل للخادم فقط ما يخص رسائل مازن: ردٌّ في نفس المحادثة، أو من بريد أو نطاق منشأة راسلناها،
// أو إشعار ارتداد يذكر بريدها. بقية بريد الشركة لا يغادر جهازك.
const IMAP = {
  host: process.env.IMAP_HOST || (SMTP.host ? SMTP.host.replace(/^smtp\./i, "imap.") : ""), port: Number(process.env.IMAP_PORT) || 993,
  secure: process.env.IMAP_SECURE ? process.env.IMAP_SECURE !== "false" : true, user: process.env.IMAP_USER || SMTP.user, pass: process.env.IMAP_PASS || SMTP.pass
};
const INBOX_POLL_MS = Number(process.env.INBOX_POLL_MS) || 300000;
const INBOX_FIRST_DAYS = Number(process.env.INBOX_FIRST_DAYS) || 14;
const inboxEnabled = !!(IMAP.host && IMAP.user && IMAP.pass) && process.env.INBOX_READ !== "false";
const INBOX_STATE = join(here, ".inbox-state.json");

const rootDomain = host => {
  const parts = String(host || "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2];
  return (["com", "net", "org", "gov", "edu", "med", "sch"].includes(sld) && parts[parts.length - 1].length === 2 ? parts.slice(-3) : parts.slice(-2)).join(".");
};
const readInboxState = () => { try { return JSON.parse(readFileSync(INBOX_STATE, "utf8")); } catch { return {}; } };
const writeInboxState = s => { try { writeFileSync(INBOX_STATE, JSON.stringify(s), "utf8"); } catch (e) { log(`تعذر حفظ حالة الوارد: ${e.message}`); } };

// نص الرد بلا الرسالة المقتبسة تحته
function stripQuoted(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n"), out = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) continue;
    if (/^\s*(On .+wrote:|في .+كتب:|-{2,}\s*Original Message|-{2,}\s*الرسالة الأصلية|From:\s|من:\s|Sent from my)/i.test(l)) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function makeImap() {
  let ImapFlow, simpleParser;
  try { ({ ImapFlow } = await import("imapflow")); ({ simpleParser } = await import("mailparser")); }
  catch { throw new Error("مكتبة قراءة البريد غير مثبتة: شغّل npm install داخل مجلد worker مرة واحدة (أو أعد فتح start-worker.cmd)."); }
  const client = new ImapFlow({ host: IMAP.host, port: IMAP.port, secure: IMAP.secure, auth: { user: IMAP.user, pass: IMAP.pass }, logger: false,
    tls: process.env.IMAP_INSECURE_TLS === "true" ? { rejectUnauthorized: false } : undefined });
  return { client, simpleParser };
}

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery/i;
const BOUNCE_SUBJECT = /undeliver|delivery status|failure notice|returned mail|delivery failed|mail delivery|لم يتم تسليم|فشل التسليم/i;

async function scanInbox(watch) {
  const { client, simpleParser } = await makeImap();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const found = [];
  try {
    const box = client.mailbox;
    let st = readInboxState();
    if (st.uidValidity !== String(box.uidValidity)) st = { uidValidity: String(box.uidValidity), lastUid: 0 };
    const uids = st.lastUid ? await client.search({ uid: `${st.lastUid + 1}:*` }, { uid: true })
      : await client.search({ since: new Date(Date.now() - INBOX_FIRST_DAYS * 86400000) }, { uid: true });
    const fresh = (uids || []).filter(u => u > st.lastUid);
    const emails = new Set(watch.emails), domains = new Set(watch.domains), ids = new Set(watch.messageIds);
    let maxUid = st.lastUid;
    if (fresh.length) for await (const msg of client.fetch(fresh, { uid: true, envelope: true, headers: ["references", "in-reply-to", "auto-submitted"] }, { uid: true })) {
      maxUid = Math.max(maxUid, msg.uid);
      const env = msg.envelope || {}, from = String((env.from && env.from[0] && env.from[0].address) || "").toLowerCase();
      const head = msg.headers ? msg.headers.toString("utf8") : "";
      const refs = Array.from(new Set([env.inReplyTo].concat(head.match(/<[^<>\s]+>/g) || []).filter(Boolean)));
      const bounce = BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(env.subject || "");
      const linked = refs.some(r => ids.has(r)) || emails.has(from) || domains.has(rootDomain(from.split("@")[1]));
      if (!linked && !bounce) continue; // ليس من رسائل مازن: لا يُقرأ ولا يُرسل
      const one = await client.fetchOne(String(msg.uid), { source: true }, { uid: true });
      const parsed = await simpleParser(one.source);
      const text = String(parsed.text || "").slice(0, 30000);
      let bounceRcpt = "";
      if (bounce) {
        const low = text.toLowerCase();
        bounceRcpt = watch.emails.find(e => low.includes(e)) || "";
        if (!bounceRcpt) continue; // ارتداد لا يخص رسائل مازن
      }
      const auto = (/^auto-submitted:\s*(.+)$/im.exec(head) || [])[1] || "";
      found.push({ uid: msg.uid, messageId: env.messageId || parsed.messageId || "", from, fromName: (env.from && env.from[0] && env.from[0].name) || "",
        subject: env.subject || "", date: (env.date ? new Date(env.date) : new Date()).toISOString(), inReplyTo: env.inReplyTo || "", references: refs,
        autoSubmitted: auto.trim(), bounce, bounceRcpt, text: bounce ? text.slice(0, 1500) : stripQuoted(text).slice(0, 3000) });
    }
    st.lastUid = Math.max(st.lastUid, maxUid, ...(uids || []));
    writeInboxState(st);
  } finally { lock.release(); await client.logout().catch(() => {}); }
  return found;
}

async function inboxLoop() {
  log(`قراءة الوارد مفعلة: ${IMAP.user} عبر ${IMAP.host} كل ${Math.round(INBOX_POLL_MS / 60000)} دقائق (ردود رسائل مازن فقط)`);
  while (true) {
    try {
      const { watch } = await call({ action: "inbox_watch" }, 45000);
      if (watch && (watch.emails.length || watch.messageIds.length)) {
        const found = await scanInbox(watch);
        for (let i = 0; i < found.length; i += 15) {
          const r = await call({ action: "inbox_report", messages: found.slice(i, i + 15) }, 330000);
          log(`الوارد: ${r.matched} ردود على رسائل مازن` + (r.byKind && Object.keys(r.byKind).length ? " — " + Object.entries(r.byKind).map(([k, n]) => k + " " + n).join("، ") : ""));
        }
      }
    } catch (e) { log(`خطأ في قراءة الوارد: ${e.message}`); }
    await sleep(INBOX_POLL_MS);
  }
}

async function inboxTest() {
  if (!inboxEnabled) { console.error("أضف SMTP_USER و SMTP_PASS (أو IMAP_*) في worker/.env أولاً."); process.exit(1); }
  const { client } = await makeImap();
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const recent = await client.search({ since: new Date(Date.now() - INBOX_FIRST_DAYS * 86400000) }, { uid: true });
    console.log(`الوارد جاهز: ${IMAP.user} عبر ${IMAP.host} — ${(recent || []).length} رسالة في آخر ${INBOX_FIRST_DAYS} يوماً. لا يُرسل للخادم إلا ما يخص رسائل مازن.`);
  } finally { lock.release(); await client.logout().catch(() => {}); }
}

if (process.argv.includes("--once")) {
  // اختبار محلي: node claude-worker.mjs --once "سؤال"
  const prompt = process.argv[process.argv.indexOf("--once") + 1] || "قل مرحباً بجملة واحدة.";
  runClaude({ id: "local", system: "أجب بالعربية باختصار.", prompt, model: DEFAULT_MODEL }).then(r => { console.log(r); process.exit(r.error ? 1 : 0); });
} else if (process.argv.includes("--mail-test")) {
  mailTest().then(() => process.exit(0), e => { console.error(`تعذر الإرسال: ${e.message}`); process.exit(1); });
} else if (process.argv.includes("--inbox-test")) {
  inboxTest().then(() => process.exit(0), e => { console.error(`تعذرت قراءة الوارد: ${e.message}`); process.exit(1); });
} else {
  if (mailEnabled) mailLoop();
  else log("البريد غير مضبوط (SMTP_* في worker/.env)؛ رسائل مازن تُرسل يدوياً من اللوحة.");
  if (inboxEnabled) inboxLoop();
  main();
}
