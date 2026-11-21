"use strict";
// راكان بالصوت (Voice.gs): تتكلم أو تكتب، فيفهم الخادم الأمر وينفذه، ويرد راكان بالصوت.
// التعرف على الكلام ونطق الرد من المتصفح نفسه (Chrome أو Edge أو Safari)؛ الخادم يستقبل النص فقط.
// المرحلة الثانية: الطلب الحر يُكلَّف به الوكيل بعد تأكيدك، وتُقرأ خلاصته وتقدير سالم عند انتهائه.

const VOICE_KEY = "entaliq.voice";
const VOICE_YES = /^(?:نعم|ايه|إيه|اي|أي|أكد|اكد|أكّد|تمام|اوكي|أوكي|أكيد|اكيد|موافق|نفذ|نفّذ|ok|okay|yes)(?=[\s،.!]|$)/i;
const VOICE_NO = /^(?:لا|إلغاء|الغاء|ألغ|الغ|ألغي|الغي|كنسل|بلاش|cancel|no)(?=[\s،.!]|$)/i;
const VOICE_EXAMPLES = ["وش ينتظرني اليوم؟", "كم رد جانا؟", "وش سوى مازن اليوم؟", "هل العامل شغال؟", "مين موقوف؟",
  "أوقف خالد", "خل خالد يداوم", "مازن جهّز شركات اليوم", "بدر دوّر منافسات", "أرسل ملخص اليوم على إيميلي",
  "لمى اكتبي منشور عن ترشيد التكييف في المستشفيات", "جهّز عرض تدقيق طاقة لفندق في الرياض"];
const VOICE_W = {
  place: ["ولا منشأة", "منشأة واحدة", "منشأتين", "منشآت", "منشأة"],
  draft: ["ولا مسودة", "مسودة واحدة", "مسودتين", "مسودات", "مسودة"],
  follow: ["ولا متابعة", "متابعة واحدة", "متابعتين", "متابعات", "متابعة"],
  chance: ["ولا فرصة", "فرصة واحدة", "فرصتين", "فرص", "فرصة"],
  award: ["ولا ترسية", "ترسية واحدة", "ترسيتين", "ترسيات", "ترسية"]
};
const voiceNum = (n, w) => (n = Number(n) || 0) === 0 ? w[0] : n === 1 ? w[1] : n === 2 ? w[2] : n + " " + (n <= 10 ? w[3] : w[4]);
const VoiceRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const voiceCanSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";

const VS = {
  log: [], listening: false, thinking: false, running: "", pending: null, rec: null, interim: "", heard: "",
  cfg: (() => { try { return Object.assign({ voice: "", rate: 1, mute: false, autoListen: true }, JSON.parse(store.get(VOICE_KEY) || "{}")); } catch (e) { return { voice: "", rate: 1, mute: false, autoListen: true }; } })()
};
const voiceSave = () => store.set(VOICE_KEY, JSON.stringify(VS.cfg));

// ---------------- النطق ----------------
function voiceVoices() {
  if (!voiceCanSpeak) return [];
  const rank = v => (/^ar-SA/i.test(v.lang) ? 0 : /^ar/i.test(v.lang) ? 2 : 9) - (/natural|online|neural/i.test(v.name) ? 1 : 0);
  return speechSynthesis.getVoices().filter(v => /^ar/i.test(v.lang)).sort((a, b) => rank(a) - rank(b));
}
function voicePick() {
  const all = voiceVoices();
  return all.find(v => v.name === VS.cfg.voice) || all[0] || null;
}
function voiceSpeak(text, then) {
  if (!voiceCanSpeak || VS.cfg.mute || !text) { if (then) then(); return; }
  speechSynthesis.cancel();
  const v = voicePick();
  // Chrome يقطع النطق الطويل؛ نقسّمه جملاً
  const parts = String(text).replace(/[⁦-⁩]/g, "").replace(/\p{Extended_Pictographic}️?/gu, "").split(/(?<=[.!؟?])\s+/).flatMap(s => s.length > 220 ? s.split(/(?<=،)\s+/) : [s]).filter(Boolean);
  parts.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s);
    u.lang = v ? v.lang : "ar-SA"; if (v) u.voice = v;
    u.rate = Number(VS.cfg.rate) || 1;
    if (i === parts.length - 1 && then) { u.onend = () => then(); u.onerror = () => then(); }
    speechSynthesis.speak(u);
  });
}
function voiceHush() { if (voiceCanSpeak) speechSynthesis.cancel(); }

// ---------------- الاستماع ----------------
function voiceListen() {
  if (VS.listening && VS.rec) { VS.rec.stop(); return; }
  if (!VoiceRec) { toast("متصفحك لا يدعم التعرف على الكلام. اكتب أمرك، أو افتح اللوحة في Chrome أو Edge.", "warn"); const i = $("#voiceText"); if (i) i.focus(); return; }
  if (VS.thinking) return;
  voiceHush();
  const rec = new VoiceRec();
  rec.lang = "ar-SA"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  VS.rec = rec; VS.interim = ""; VS.heard = "";
  rec.onresult = e => {
    let fin = "", mid = "";
    for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (mid += e.results[i][0].transcript));
    VS.heard = fin.trim() || VS.heard; VS.interim = (fin + mid).trim();
    voicePaintLive();
  };
  rec.onerror = e => {
    const msg = { "not-allowed": "اسمح للوحة باستخدام الميكروفون من شريط العنوان ثم حاول مرة ثانية.", "service-not-allowed": "اسمح للوحة باستخدام الميكروفون من شريط العنوان ثم حاول مرة ثانية.",
      "no-speech": "ما سمعت شيء. اضغط الميكروفون وتكلم.", "audio-capture": "ما لقيت ميكروفون على هذا الجهاز.", network: "التعرف على الكلام يحتاج اتصال إنترنت." }[e.error];
    if (msg && e.error !== "aborted") toast(msg, e.error === "no-speech" ? "none" : "warn");
  };
  rec.onend = () => {
    VS.listening = false; VS.rec = null;
    const text = VS.heard || "";
    VS.interim = ""; VS.heard = "";
    renderVoiceView();
    if (text) voiceSubmit(text);
  };
  try { rec.start(); VS.listening = true; } catch (e) { VS.listening = false; toast("تعذر تشغيل الميكروفون: " + e.message, "warn"); }
  renderVoiceView();
}

// ---------------- الإرسال والرد ----------------
function voiceAdd(entry) {
  VS.log.push(Object.assign({ at: Date.now() }, entry));
  if (VS.log.length > 40) VS.log.splice(0, VS.log.length - 40);
  renderVoiceView();
}

async function voiceSubmit(text) {
  text = String(text || "").trim();
  if (!text || VS.thinking) return;
  voiceAdd({ who: "me", text });
  if (VS.pending) {
    const p = VS.pending;
    VS.pending = null;
    const other = p.op === "task" && voiceAgentIn(text, p.agent);
    if (other) {
      const np = Object.assign({}, p, { agent: other, prompt: "تكليف " + other });
      const say = "أكلّف " + other + " بدلاً منه؟ قل أكّد أو إلغاء.";
      VS.pending = np; // قبل الرسم، لتظهر أزرار التأكيد
      voiceAdd({ who: "rakan", text: say, confirm: np, compose: { agent: other, task: p.task } });
      voiceSpeak(say, () => { if (VS.cfg.autoListen && VoiceRec && state.view === "voice" && sheet.open) voiceListen(); });
      return;
    }
    if (VOICE_YES.test(text)) return voiceAsk({ confirm: p });
    if (VOICE_NO.test(text)) { const say = "تمام، ألغيت."; voiceAdd({ who: "rakan", text: say }); voiceSpeak(say); return; }
  }
  return voiceAsk({ text });
}

// اسم وكيل آخر في الجملة (لتحويل التكليف إليه)
function voiceAgentIn(text, except) {
  const t = String(text || "").replace(/[\u064B-\u065F]/g, "").replace(/ى/g, "ي");
  const hit = AGENTS.map(a => a.name).filter(n => n !== except && n !== "الباحث")
    .find(n => new RegExp("(^|[\\s،,ولب])" + n.replace(/ى/g, "ي") + "($|[\\s،,.؟?])").test(t));
  return hit || "";
}

async function voiceAsk(payload) {
  if (!state.url || !hasAuth()) { const say = "اربط اللوحة بالخادم أولاً من الإعدادات."; voiceAdd({ who: "rakan", text: say }); voiceSpeak(say); return; }
  VS.thinking = true; renderVoiceView();
  let res;
  try { res = await api(Object.assign({ action: "voice_ask" }, payload)); }
  catch (e) { res = { say: "تعذر: " + officeError(e) }; }
  finally { VS.thinking = false; }
  if (res.confirm) VS.pending = res.confirm; // قبل الرسم، لتظهر أزرار التأكيد
  voiceAdd({ who: "rakan", text: res.say || "", lines: res.lines, open: res.open, compose: res.compose, composeOnly: res.composeOnly, examples: res.examples, confirm: res.confirm });
  if (res.refreshOffice && state.office) loadOffice(true);
  voiceSpeak(res.say, () => { if (res.confirm && VS.cfg.autoListen && VoiceRec && state.view === "voice" && sheet.open) voiceListen(); });
  if (res.run) voiceRunJob(res.run);
}

// المهام الطويلة تُشغَّل بإجراءاتها المعتادة، وتُقرأ نتيجتها عند انتهائها
const VOICE_BUSY = { prospects: "prospectsBusy", tenders: "tendersBusy", studio: "contentBusy", exec: "execBusy" };
const VOICE_WHO = { prospects: "مازن", tenders: "بدر", studio: "الاستوديو", exec: "راكان" };
const voiceWho = run => run.kind === "task" ? run.agent : VOICE_WHO[run.kind];

// خلاصة تُقرأ بالصوت: أول جملتين أو ثلاث من المخرجات، بلا عناوين ولا روابط ولا تنسيق، وكل سطر جملة
function voiceGist(text) {
  const lines = String(text || "").replace(/```[\s\S]*?```/g, "\n").split(/\r?\n/)
    .filter(l => !/^\s*#/.test(l))
    .map(l => l.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "")
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/[*_`>|#]/g, "").replace(/\s+/g, " ").trim())
    .filter(l => l.length > 2 && !/[:：]$/.test(l));
  const plain = lines.map(l => /[.!؟?،]$/.test(l) ? l : l + ".").join(" ");
  let out = "";
  for (const part of plain.split(/(?<=[.!؟?])\s+/)) {
    if (out && (out + " " + part).length > 300) break;
    out = out ? out + " " + part : part;
    if (out.length > 170) break;
  }
  return { gist: out.slice(0, 320), more: plain.length > out.length + 20 };
}
async function voiceRunJob(run) {
  const flag = VOICE_BUSY[run.kind];
  if (VS.running || (flag && state[flag])) {
    const say = (VS.running ? VS.runningWho : voiceWho(run)) + " يشتغل الحين، أبلغك إذا خلص. اطلب الثانية بعده.";
    voiceAdd({ who: "rakan", text: say }); voiceSpeak(say); return;
  }
  VS.running = run.kind; VS.runningWho = voiceWho(run); if (flag) state[flag] = true; voiceFab(); renderVoiceView();
  let say = "", extra = {};
  try {
    const d = await api(run.body);
    if (run.kind === "task") {
      const f = (AGENT_BY_NAME[run.agent] || {}).f, m = String(d.audit || "").match(/نسبة الدقة:\s*(\d+)%/), g = voiceGist(d.output);
      say = run.agent + (f ? " خلصت" : " خلص") + " المهمة" + (m ? "، وقدّرها سالم " + m[1] + "%" : "") + ". " + g.gist + (g.more ? " والنص كامل تحت، وفي سجل المهام." : "");
      extra = { output: d.output, taskId: d.taskId };
      refresh({ quiet: true });
    } else if (run.kind === "prospects") {
      if (typeof acceptProspects === "function") acceptProspects(d);
      const r = d.run || {};
      say = "خلص مازن: " + voiceNum(r.found, VOICE_W.place) + " جديدة، و" + voiceNum(r.drafted, VOICE_W.draft) + "، و" + voiceNum(r.followUps, VOICE_W.follow) + ". تنتظر موافقتك في صفحة مازن.";
    } else if (run.kind === "tenders") {
      if (typeof acceptTenders === "function") acceptTenders(d);
      const r = d.run || {};
      say = "خلص بدر: " + voiceNum(r.found, VOICE_W.chance) + " جديدة، و" + voiceNum(r.awards, VOICE_W.award) + ".";
    } else if (run.kind === "studio") {
      say = d.message || "خلص الاستوديو.";
      refresh({ quiet: true });
    } else {
      state.exec = d.reports || state.exec; if (d.report) state.execSel = d.report.id;
      say = "كتب راكان " + (d.report ? d.report.kind === "أسبوعي" ? "ملخص الأسبوع" : d.report.kind === "شهري" ? "ملخص الشهر" : "ملخص اليوم" : "الملخص")
        + (d.report && d.report.report && d.report.report.headline ? ": " + d.report.report.headline : ".");
    }
  } catch (e) { say = "تعذر عمل " + voiceWho(run) + ": " + officeError(e); }
  finally { VS.running = ""; VS.runningWho = ""; if (flag) state[flag] = false; voiceFab(); }
  const open = { prospects: { view: "prospects", label: "افتح صفحة مازن" }, tenders: { view: "tenders", label: "افتح صفحة بدر" }, studio: { view: "content", label: "افتح المنشورات" }, exec: { view: "exec", label: "افتح الملخص" }, task: { view: "tasks", label: "افتح سجل المهام" } }[run.kind];
  voiceAdd(Object.assign({ who: "rakan", text: say, open }, extra));
  // إن كانت لوحة الصوت مغلقة: تنبيه مكتوب مع النطق
  if (state.view !== "voice" || !sheet.open) toast(say.slice(0, 160), /^تعذر/.test(say) ? "bad" : "ok");
  voiceSpeak(say);
}

// زر الميكروفون العائم ينبض ما دام وكيل يشتغل بطلبك
function voiceFab() {
  const b = $("#fabVoice");
  if (b) { b.classList.toggle("busy", !!VS.running); b.title = VS.running ? VS.runningWho + " يشتغل بطلبك" : "تكلم مع راكان"; }
}

function voiceOpenCompose(c) {
  state.agent = AGENT_BY_NAME[c.agent] ? c.agent : EXEC_AGENT; store.set(KEYS.agent, state.agent);
  if (state.agent === "الباحث") state.manualDraft.task = c.task; else store.set(KEYS.draft, c.task);
  openView("compose");
}

// ---------------- الرسم ----------------
function voiceLines(lines) {
  if (!lines || !lines.length) return "";
  const dated = x => esc(x).replace(/\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?/g, m => ltr(m));
  return `<details class="vmsg-more"><summary>التفاصيل</summary><ul>${lines.map(x => `<li>${dated(x)}</li>`).join("")}</ul></details>`;
}

function voiceMsgHtml(m, i) {
  const last = i === VS.log.length - 1;
  if (m.who === "me") return `<div class="vmsg" data-who="me"><p>${esc(m.text)}</p></div>`;
  const acts = [];
  if (m.confirm && last && VS.pending) acts.push(`<button type="button" class="btn btn-primary sm" data-vact="yes"><span class="lbl-text">أكّد: ${esc(m.confirm.prompt || "")}</span></button>`,
    `<button type="button" class="btn btn-line sm" data-vact="no"><span class="lbl-text">إلغاء</span></button>`);
  if (m.open) acts.push(`<button type="button" class="btn btn-line sm" data-vopen="${esc(m.open.view)}"><span class="lbl-text">${esc(m.open.label)}</span></button>`);
  if (m.compose && (!m.confirm || (last && VS.pending))) acts.push(`<button type="button" class="btn ${m.confirm ? "btn-line" : "btn-primary"} sm" data-vcompose="${i}"><span class="lbl-text">${m.confirm ? "عدّل قبل الإرسال" : "افتح تكليف " + esc(m.compose.agent)}</span></button>`);
  if (m.output) acts.push(copyButton(m.output, "نسخ النص"));
  const ex = m.examples ? `<div class="chips">${m.examples.map(x => `<button type="button" class="chip-ex" data-vex="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : "";
  const full = m.output ? `<details class="vmsg-more"><summary>النص كامل${m.taskId ? " · " + esc(m.taskId) : ""}</summary><div class="md">${md(m.output)}</div></details>` : "";
  return `<div class="vmsg" data-who="rakan">${avatar(EXEC_AGENT, "xs")}<div><p>${esc(m.text)}</p>${voiceLines(m.lines)}${full}
    ${acts.length ? `<div class="row-actions">${acts.join("")}</div>` : ""}${ex}</div></div>`;
}

function voicePaintLive() {
  const live = $("#voiceLive");
  if (live) { live.textContent = VS.interim || (VS.listening ? "أسمعك…" : ""); live.hidden = !VS.listening && !VS.interim; }
}

function renderVoiceView() {
  const box = $("#voiceBody");
  if (!box || state.view !== "voice") return;
  const keep = $("#voiceText") ? $("#voiceText").value : "";
  const voices = voiceVoices(), picked = voicePick();
  const status = VS.listening ? "أسمعك… تكلم ثم توقف" : VS.thinking ? "راكان يفكر…" : VS.running ? VS.runningWho + " يشتغل بطلبك، وأبلغك إذا خلص (تقدر تسأل في الأثناء)" : VoiceRec ? "اضغط الميكروفون وتكلم" : "اكتب أمرك (متصفحك لا يدعم التعرف على الكلام)";
  const intro = VS.log.length ? "" : `<div class="vmsg" data-who="rakan">${avatar(EXEC_AGENT, "xs")}<div><p>هلا، أنا راكان. اسألني عن المكتب، أو اطلب مني أوقف وكيل أو أشغّل مهمة، أو كلّف أي وكيل بكلامك وأقرأ لك النتيجة.</p>
    <div class="chips">${VOICE_EXAMPLES.map(x => `<button type="button" class="chip-ex" data-vex="${esc(x)}">${esc(x)}</button>`).join("")}</div></div></div>`;
  box.innerHTML = `<div class="sh-pad voice">
    <div class="voice-log" aria-live="polite">${intro}${VS.log.map(voiceMsgHtml).join("")}<p class="vmsg-live" id="voiceLive" hidden></p></div>
    <div class="voice-bar">
      <button type="button" class="voice-mic" data-vact="mic" aria-pressed="${VS.listening}" aria-label="${VS.listening ? "إيقاف الاستماع" : "تكلم مع راكان"}"${VoiceRec ? "" : " disabled"}>${ICON.mic}</button>
      <input class="input grow" id="voiceText" maxlength="300" placeholder="أو اكتب أمرك هنا…" aria-label="اكتب أمرك" value="${esc(keep)}">
      <button type="button" class="btn btn-primary sm" data-vact="send"${VS.thinking ? " disabled" : ""}><span class="lbl-text">إرسال</span></button>
    </div>
    <p class="hint voice-status" role="status">${esc(status)}</p>
    <details class="voice-set"><summary>إعدادات الصوت</summary>
      ${voices.length ? `<label class="lbl" for="voicePick">الصوت</label><select class="input" id="voicePick">${voices.map(v => `<option value="${esc(v.name)}"${picked && v.name === picked.name ? " selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}</select>`
        : `<p class="hint">${voiceCanSpeak ? "ما فيه صوت عربي في هذا المتصفح. في Edge أصوات سعودية طبيعية، أو أضف العربية من إعدادات Windows ← الوقت واللغة ← الكلام." : "متصفحك لا يدعم نطق الردود؛ تظهر مكتوبة فقط."}</p>`}
      <label class="lbl" for="voiceRate">السرعة</label>
      <select class="input" id="voiceRate">${[0.9, 1, 1.1, 1.25].map(r => `<option value="${r}"${Number(VS.cfg.rate) === r ? " selected" : ""}>${r === 1 ? "عادية" : r < 1 ? "أبطأ" : r === 1.1 ? "أسرع قليلاً" : "أسرع"}</option>`).join("")}</select>
      <label class="remember"><input type="checkbox" id="voiceMute"${VS.cfg.mute ? " checked" : ""}> بلا صوت (الردود مكتوبة فقط)</label>
      <label class="remember"><input type="checkbox" id="voiceAuto"${VS.cfg.autoListen ? " checked" : ""}> استمع تلقائياً بعد سؤال التأكيد</label>
      <div class="row-actions"><button type="button" class="btn btn-line sm" data-vact="test"><span class="lbl-text">جرّب الصوت</span></button>
        ${VS.log.length ? `<button type="button" class="btn btn-line sm" data-vact="clear"><span class="lbl-text">مسح المحادثة</span></button>` : ""}</div>
    </details>
    <p class="hint">يعمل الميكروفون في متصفح Chrome أو Edge أو Safari، ويحتاج إنترنت؛ يحوّل المتصفح كلامك إلى نص (عبر Google أو Microsoft أو Apple) ويصل النص فقط إلى خادم المكتب.
      الأوامر المعروفة تُنفَّذ فوراً، والتكليف الحر يُقرأ عليك قبل تنفيذه ويحتاج العامل على جهازك. لا حذف ولا موافقة على إرسال الرسائل أو النشر بالصوت، وإيقاف كل الوكلاء يحتاج تأكيدك.</p>
  </div>`;
  voicePaintLive();
  const log = box.querySelector(".voice-log"); if (log) log.scrollTop = log.scrollHeight;
}

// ---------------- الأحداث ----------------
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("#fabVoice")) {
    if (state.view !== "voice" || !sheet.open) openView("voice");
    if (!VS.listening && VoiceRec) voiceListen();
    return;
  }
  if (!t.closest("#voiceBody")) return;
  const vex = t.closest("[data-vex]");
  if (vex) { voiceSubmit(vex.dataset.vex); return; }
  const vopen = t.closest("[data-vopen]");
  if (vopen) { openView(vopen.dataset.vopen); return; }
  const vc = t.closest("[data-vcompose]");
  if (vc) { const m = VS.log[Number(vc.dataset.vcompose)]; if (m && m.compose) { if (m.confirm) VS.pending = null; voiceOpenCompose(m.compose); } return; }
  const act = (t.closest("[data-vact]") || {}).dataset;
  if (!act) return;
  if (act.vact === "mic") voiceListen();
  else if (act.vact === "send") { const i = $("#voiceText"); const v = i.value; i.value = ""; voiceSubmit(v); }
  else if (act.vact === "yes" || act.vact === "no") voiceSubmit(act.vact === "yes" ? "أكّد" : "إلغاء");
  else if (act.vact === "test") voiceSpeak("هلا، أنا راكان. هذا صوتي في المكتب.");
  else if (act.vact === "clear") { VS.log = []; VS.pending = null; renderVoiceView(); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target && e.target.id === "voiceText" && !e.isComposing) { e.preventDefault(); const v = e.target.value; e.target.value = ""; voiceSubmit(v); }
});
document.addEventListener("change", e => {
  const id = e.target && e.target.id;
  if (id === "voicePick") VS.cfg.voice = e.target.value;
  else if (id === "voiceRate") VS.cfg.rate = Number(e.target.value);
  else if (id === "voiceMute") { VS.cfg.mute = e.target.checked; if (VS.cfg.mute) voiceHush(); }
  else if (id === "voiceAuto") VS.cfg.autoListen = e.target.checked;
  else return;
  voiceSave();
});
// إغلاق اللوحة يوقف الاستماع والنطق
sheet.addEventListener("close", () => { if (VS.rec) VS.rec.abort(); VS.listening = false; voiceHush(); });
if (voiceCanSpeak) speechSynthesis.addEventListener("voiceschanged", () => { if (state.view === "voice") renderVoiceView(); });
