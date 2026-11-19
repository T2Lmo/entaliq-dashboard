#!/usr/bin/env node
// عامل Claude لمكتب انطلق: يسحب طلبات الوكلاء من خادم Apps Script وينفذها بـ Claude Code باشتراكك (بدون API).
// التشغيل: node claude-worker.mjs   (الإعدادات في worker/.env — انظر .env.example)
// يحتاج Node 18+ و Claude Code مسجّل الدخول (شغّل claude مرة واحدة وسجّل الدخول).

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

if (!EXEC_URL || !WORKER_TOKEN) {
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

if (process.argv.includes("--once")) {
  // اختبار محلي: node claude-worker.mjs --once "سؤال"
  const prompt = process.argv[process.argv.indexOf("--once") + 1] || "قل مرحباً بجملة واحدة.";
  runClaude({ id: "local", system: "أجب بالعربية باختصار.", prompt, model: DEFAULT_MODEL }).then(r => { console.log(r); process.exit(r.error ? 1 : 0); });
} else main();
