"use strict";
// ربط الأحداث

// ---------------- الأحداث ----------------
$("#btnRefresh").innerHTML = ICON.refresh;
$("#btnCompose").innerHTML = ICON.chat;
$("#btnCsv").innerHTML = ICON.download;
$("#btnFull").innerHTML = ICON.full;
$("#btnSettings").innerHTML = ICON.settings;
$("#btnOffice").innerHTML = ICON.team;
$("#sheetClose").innerHTML = ICON.close;
$("#btnShowToken").innerHTML = ICON.eye;
$("#sendIcon").innerHTML = ICON.send;
document.querySelectorAll(".ico-plus").forEach(e => { e.outerHTML = ICON.plus; });
$("#tvNews").innerHTML = GLYPH.news;
$("#tvBest").innerHTML = GLYPH.best;
$("#tvAssign").innerHTML = GLYPH.assign;
$("#tvLog").innerHTML = GLYPH.log;

function paintToday() {
  $("#today").textContent = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

$("#btnAuto").addEventListener("click", () => setAuto($("#btnAuto").getAttribute("aria-pressed") !== "true"));
$("#btnRefresh").addEventListener("click", () => refresh());
$("#btnCsv").addEventListener("click", exportCsv);
$("#btnFull").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
});
$("#btnSettings").addEventListener("click", openSettings);
$("#btnCloseSettings").addEventListener("click", () => dlg.close());
$("#settingsForm").addEventListener("submit", saveSettings);
$("#btnShowToken").addEventListener("click", () => { const i = $("#inToken"); i.type = i.type === "password" ? "text" : "password"; });
$("#btnGoogleOut").addEventListener("click", signOutGoogle);
$("#sheetClose").addEventListener("click", () => sheet.close());
sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });
sheet.addEventListener("close", () => { state.view = ""; });
$("#taskForm").addEventListener("submit", sendTask);
$("#agentDlgForm").addEventListener("submit", saveAgentDlg);
$("#agentDlgClose").addEventListener("click", () => agentDlg.close());
agentDlg.addEventListener("click", e => { if (e.target === agentDlg) agentDlg.close(); });
agentDlg.addEventListener("close", () => { state.agentDlg = null; });
$("#btnContentOlder").addEventListener("click", loadOlderContent);
document.addEventListener("change", e => {
  if (e.target.id === "execPick") { state.execSel = e.target.value; renderExecView(); }
  if (e.target.id === "brainFilter") { state.brainAgent = e.target.value; renderOfficeView(); }
  if (e.target.matches("[data-psel], [data-psel-all]")) prospectsSelect(e.target);
});
document.addEventListener("input", e => {
  if (e.target.closest && e.target.closest("[data-cnform]")) contractsPreview();
  if (state.editingId && e.target.id === "edit-" + state.editingId) state.editingDraft = e.target.value;
  if (state.askingId && e.target.id === "note-" + state.askingId) state.askingDraft = e.target.value;
});

const input = $("#taskInput");
input.value = store.get(KEYS.draft);
input.addEventListener("input", () => { if (state.agent === "الباحث") captureManualDraft(); else store.set(KEYS.draft, input.value); });
$("#manualReport").addEventListener("input", captureManualDraft);
$("#manualSources").addEventListener("input", () => { captureManualDraft(); renderManualSources(); });
$("#btnResearchPrompt").addEventListener("click", copyManualResearchPrompt);
$("#btnExtractSources").addEventListener("click", extractManualSources);
input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendTask(e); });

$("#taskSearch").addEventListener("input", e => { state.query = e.target.value; renderTasksView(); });
$("#taskFilter").innerHTML += AGENTS.map(a => `<option value="${esc(a.name)}">${esc(a.name)} · ${esc(a.role)}</option>`).join("");
$("#taskFilter").addEventListener("change", e => { state.filterAgent = e.target.value; renderTasksView(); });
$("#taskSort").addEventListener("change", e => { state.sort = e.target.value; renderTasksView(); });

document.addEventListener("click", async e => {
  const t = e.target;
  const actl = t.closest("[data-actl]");
  if (actl) { agentControl(actl); return; }
  const xrun = t.closest("[data-exec-run]");
  if (xrun) { runExec(xrun); return; }
  const xassign = t.closest("[data-exec-assign]");
  if (xassign) { execAssign(xassign); return; }
  if (t.closest("[data-exec-reload]")) { loadExec(); return; }
  const cntab = t.closest("[data-cntab]");
  if (cntab) { state.contractsTab = cntab.dataset.cntab; renderContractsView(); return; }
  const cnact = t.closest("[data-cnact]");
  if (cnact) { contractsAction(cnact); return; }
  const toCn = t.closest("[data-to-contract]");
  if (toCn && state.prospects) { const p = state.prospects.items.find(x => x.id === toCn.dataset.toContract); if (p) contractsFromProspect(p); return; }
  const ttab = t.closest("[data-ttab]");
  if (ttab) { state.tendersTab = ttab.dataset.ttab; renderTendersView(); return; }
  const tact = t.closest("[data-tact]");
  if (tact) { tendersAction(tact); return; }
  const ptab = t.closest("[data-ptab]");
  if (ptab) { state.prospectsFilter = ptab.dataset.ptab; state.prospectsEdit = ""; renderProspectsView(); return; }
  const pact = t.closest("[data-pact]");
  if (pact) { prospectsAction(pact); return; }
  if (t.closest('[data-action="studio-run"]')) { runStudioNow(t.closest('[data-action="studio-run"]')); return; }
  const bact = t.closest("[data-bact]");
  if (bact) { brainAction(bact); return; }
  const teach = t.closest("[data-teach]");
  if (teach) { openTeachDlg(teach); return; }
  const bex = t.closest("[data-brain-example]");
  if (bex) { saveBrainExample(bex); return; }
  const adEx = t.closest("[data-ad-example]");
  if (adEx) { const box = $("#ad-task"); if (box) { box.value = adEx.dataset.adExample; box.focus(); } return; }
  const opener = t.closest("[data-open]");
  if (opener) { openView(opener.dataset.open, { agent: opener.dataset.filterAgent, sort: opener.dataset.sort, cfilter: opener.dataset.cfilterOpen }); return; }
  const pick = t.closest("[data-pick]");
  if (pick) {
    state.agent = pick.dataset.pick; store.set(KEYS.agent, state.agent); renderCompose();
    const again = document.querySelector(`[data-pick="${CSS.escape(state.agent)}"]`); if (again) again.focus();
    return;
  }
  const ex = t.closest("[data-example]");
  if (ex) { input.value = ex.dataset.example; if (state.agent === "الباحث") captureManualDraft(); else store.set(KEYS.draft, input.value); input.focus(); return; }
  if (t.closest("[data-open-settings]")) { openSettings(); return; }
  if (t.closest("[data-refresh]")) { refresh(); return; }
  const fetchBtn = t.closest('[data-action="fetch-news"]');
  if (fetchBtn) { fetchNews(fetchBtn); return; }
  const planBtn = t.closest('[data-action="weekly-plan"], [data-action="seasonal-tips"], [data-action="site-ideas"]');
  if (planBtn) { contentJob(planBtn, { "weekly-plan": "plan", "seasonal-tips": "tips", "site-ideas": "sites" }[planBtn.dataset.action]); return; }
  const duty = t.closest("[data-duty]");
  if (duty) { officeDuty(duty); return; }
  const resend = t.closest("[data-research-resend]");
  if (resend) { resendResearch(resend.dataset.researchResend); return; }
  const follow = t.closest("[data-research-follow], [data-research-request]");
  if (follow) { followResearch(follow.dataset.researchFollow || follow.dataset.researchRequest); return; }
  const reaudit = t.closest("[data-task-reaudit]");
  if (reaudit) { reauditTask(reaudit); return; }
  const cact = t.closest("[data-cact]");
  if (cact) { contentAction(cact); return; }
  const otab = t.closest("[data-otab]");
  if (otab) { state.officeTab = otab.dataset.otab; state.officeEdit = ""; state.officeTaskEdit = ""; renderOfficeView(); return; }
  const oact = t.closest("[data-oact]");
  if (oact) { officeAction(oact); return; }
  const dedit = t.closest("[data-dedit]");
  if (dedit) { state.designEditId = dedit.dataset.dedit; renderContentView(); return; }
  const dsave = t.closest("[data-dsave]");
  if (dsave) { saveDesignEdit(dsave); return; }
  const spub = t.closest("[data-spub]");
  if (spub) { socialPublish(spub); return; }
  const scon = t.closest("[data-sconnect]");
  if (scon) { socialConnect(scon); return; }
  const sdis = t.closest("[data-sdisconnect]");
  if (sdis) { socialDisconnect(sdis); return; }
  const cfilter = t.closest("[data-cfilter]");
  if (cfilter) { state.contentFilter = cfilter.dataset.cfilter; renderContentView(); return; }
  // مقاس التصميم يُحفظ لكل منشور ويُعاد رسم صورته فقط
  const dsize = t.closest("[data-dsize]");
  if (dsize) {
    const id = dsize.dataset.id;
    state.designSize[id] = dsize.dataset.dsize;
    dsize.parentElement.querySelectorAll("[data-dsize]").forEach(b => b.setAttribute("aria-pressed", String(b === dsize)));
    const canvas = document.querySelector(`canvas[data-design="${CSS.escape(id)}"]`);
    if (canvas) { canvas.dataset.size = dsize.dataset.dsize; drawDesigns(canvas.parentElement); }
    return;
  }
  const dl = t.closest("[data-ddownload]");
  if (dl) { downloadDesign(dl.dataset.ddownload); return; }
  // نافذة النشر في X تفتح والتغريدة مكتوبة فيها؛ الصورة تُرفق يدوياً بعد تنزيلها
  const xo = t.closest("[data-x-open]");
  if (xo) {
    const row = state.content.find(r => r[0] === xo.dataset.id);
    if (!row || row[9] !== "معتمد" || state.contentVersions[row[0]] !== xo.dataset.version) { toast("حدّث المنشور واعتمده قبل فتح X.", "warn"); return; }
    window.open("https://x.com/intent/post?text=" + encodeURIComponent(copyMap.get(Number(xo.dataset.xOpen)) || ""), "_blank", "noopener");
    toast("فُتحت نافذة X بالتغريدة. أرفق صورة التصميم بعد تنزيلها ثم انشر.", "ok");
    return;
  }
  // النسخ أولاً ثم فتح LinkedIn في تبويب جديد؛ المستخدم يلصق في صفحة الشركة ثم يضغط «تم النشر»
  const li = t.closest("[data-li-open]");
  if (li) {
    const row = state.content.find(r => r[0] === li.dataset.id);
    if (!row || row[9] !== "معتمد" || state.contentVersions[row[0]] !== li.dataset.version) { toast("حدّث المنشور واعتمده قبل فتح LinkedIn.", "warn"); return; }
    const ok = await copyText(copyMap.get(Number(li.dataset.liOpen)) || "");
    window.open(linkedinUrl(), "_blank", "noopener");
    toast(ok ? "نُسخ المنشور. الصقه في صفحة الشركة على LinkedIn، ثم اضغط «تم النشر» هنا." : "تعذر النسخ؛ استخدم «تعديل» وانسخ النص يدوياً.", ok ? "ok" : "bad");
    return;
  }
  const cp = t.closest("[data-copy]");
  if (cp) {
    const ok = await copyText(copyMap.get(Number(cp.dataset.copy)) || "");
    const lbl = cp.querySelector(".lbl-text");
    const original = lbl.textContent;
    lbl.textContent = ok ? "تم النسخ" : "تعذر النسخ";
    setTimeout(() => { lbl.textContent = original; }, 1500);
  }
});

document.addEventListener("click", e => {
  const r = e.target.closest("[data-range]");
  if (r) setRange(r.dataset.range);
});
$("#btnTrendTable").addEventListener("click", () => { trendTableOn = !trendTableOn; renderTrend(computeMetrics()); });
const trendBox = $("#trendCharts");
const trendIndex = e => { const hit = e.target.closest && e.target.closest(".hit"); return hit ? Number(hit.dataset.i) : -1; };
trendBox.addEventListener("pointermove", e => { const i = trendIndex(e); if (i >= 0) showTrendTip(i); });
trendBox.addEventListener("pointerleave", hideTrendTip);
trendBox.addEventListener("focusin", e => { const i = trendIndex(e); if (i >= 0) showTrendTip(i); });
trendBox.addEventListener("focusout", hideTrendTip);

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { renderTicker(); renderTrend(computeMetrics()); }, 250);
});
