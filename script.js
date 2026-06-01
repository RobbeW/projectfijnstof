/* Copyright (c) 2026 Robbe Wulgaert */

class LineBreakTransformer {
  constructor() {
    this.chunks = "";
  }

  transform(chunk, controller) {
    this.chunks += chunk;
    const lines = this.chunks.split("\n");
    this.chunks = lines.pop();
    lines.forEach((line) => controller.enqueue(line));
  }

  flush(controller) {
    controller.enqueue(this.chunks);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const BAUD_RATE = 9600;
  const SAMPLE_INTERVAL_MS = 5000;
  const DEMO_INTERVAL_MS = 1000;
  const LEGACY_INTERVAL_MS = 5000;
  const PLATFORM_STORAGE_KEY = "aiindeklas:projectfijnstof:platform:v1";
  const AUTOSAVE_DELAY_MS = 700;
  const CHART_COLORS = {
    pm1: "#5200FF",
    pm25: "#D0006F",
    pm10: "#00A3A3",
    aqi: "#FFB000",
  };
  const AQI_LABELS = {
    1: "Zeer goed",
    2: "Goed",
    3: "Matig",
    4: "Slecht",
    5: "Zeer slecht",
    6: "Extreem slecht",
  };

  const els = {
    compatibilityNotice: $("compatibility-notice"),
    connectionStatus: $("connection-status"),
    workflowLinks: [...document.querySelectorAll("[data-step-link]")],
    inputQuestion: $("input-question"),
    inputHypothesis: $("input-hypothesis"),
    inputLocation: $("input-location"),
    inputSource: $("input-source"),
    setupChecklist: $("setup-checklist"),
    btnConnect: $("btn-connect"),
    btnDemo: $("btn-demo"),
    inputLogFile: $("input-log-file"),
    btnImportLog: $("btn-import-log"),
    diagnosticSummary: $("diagnostic-summary"),
    diagnosticList: $("diagnostic-list"),
    serialPreview: $("serial-preview"),
    inputTrialName: $("input-trial-name"),
    inputCondition: $("input-condition"),
    inputNote: $("input-note"),
    btnNewTrial: $("btn-new-trial"),
    btnStart: $("btn-start"),
    btnStop: $("btn-stop"),
    metricPm1: $("metric-pm1"),
    metricPm25: $("metric-pm25"),
    metricPm10: $("metric-pm10"),
    metricAqi: $("metric-aqi"),
    metricAqiLabel: $("metric-aqi-label"),
    liveChartCanvas: $("live-chart"),
    playbackTitle: $("playback-title"),
    playbackStatus: $("playback-status"),
    btnPlaybackPlay: $("btn-playback-play"),
    btnPlaybackPause: $("btn-playback-pause"),
    btnPlaybackReset: $("btn-playback-reset"),
    playbackSpeed: $("playback-speed"),
    playbackRange: $("playback-range"),
    playbackTime: $("playback-time"),
    comparisonChartCanvas: $("comparison-chart"),
    trialSummaryBody: $("trial-summary-body"),
    sampleBody: $("sample-body"),
    btnExportCsv: $("btn-export-csv"),
    inputConclusion: $("input-conclusion"),
    inputReflection: $("input-reflection"),
    btnReport: $("btn-report"),
    reportModal: $("report-modal"),
    reportForm: $("report-form"),
    reportNames: $("report-names"),
    reportClass: $("report-class"),
    btnCancelReport: $("btn-cancel-report"),
    btnReportBack: $("btn-report-back"),
  };

  const state = {
    port: null,
    reader: null,
    serialLoopActive: false,
    source: null,
    demoTimer: null,
    demoMs: 0,
    latestPacket: null,
    currentTrial: null,
    trials: [],
    isMeasuring: false,
    droppedLines: 0,
    legacyTimestampWarningShown: false,
    fallbackDeviceMs: 0,
    liveChart: null,
    comparisonChart: null,
    playbackTimer: null,
    playbackTrial: null,
    playbackIndex: 0,
    playbackSpeed: 10,
    playbackPlaying: false,
    autosaveFailed: false,
  };

  let autosaveTimer = null;

  initialize();

  function initialize() {
    initializeCharts();
    bindEvents();
    updateCompatibilityNotice();
    const restored = restoreSavedState();
    if (restored) {
      updateDiagnostics("Vorige voortgang hersteld uit deze browser.", [
        "Meet opnieuw verbinden blijft nodig, maar de bewaarde meetreeksen en antwoorden staan terug klaar.",
      ]);
    } else {
      updateDiagnostics("Nog geen data ontvangen.", [
        "Verbind de Arduino of start de demomodus.",
        "Verwachte regel: tijd_ms, PM1, PM2.5, PM10, AQI.",
      ]);
      createTrial({ skipAutosave: true });
    }
    updateControls();
    updateWorkflowState();
    renderTables();
    updateCharts();
    savePlatformState();
  }

  function bindEvents() {
    els.btnConnect.addEventListener("click", connectSerial);
    els.btnDemo.addEventListener("click", toggleDemoMode);
    els.inputLogFile.addEventListener("change", handleLogFileChoice);
    els.btnImportLog.addEventListener("click", () => els.inputLogFile.click());
    els.btnNewTrial.addEventListener("click", () => createTrial({ focusName: true }));
    els.btnStart.addEventListener("click", startMeasurement);
    els.btnStop.addEventListener("click", stopMeasurement);
    els.btnPlaybackPlay.addEventListener("click", startPlayback);
    els.btnPlaybackPause.addEventListener("click", pausePlayback);
    els.btnPlaybackReset.addEventListener("click", resetPlayback);
    els.playbackSpeed.addEventListener("change", () => {
      state.playbackSpeed = Number(els.playbackSpeed.value) || 10;
      if (state.playbackPlaying) restartPlaybackTimer();
      scheduleAutosave();
    });
    els.playbackRange.addEventListener("input", () => {
      pausePlayback();
      setPlaybackIndex(Number(els.playbackRange.value) || 0);
      scheduleAutosave();
    });
    els.btnExportCsv.addEventListener("click", exportCsv);
    els.btnReport.addEventListener("click", openReportModal);
    els.btnCancelReport.addEventListener("click", closeReportModal);
    els.btnReportBack.addEventListener("click", closeReportModal);
    els.reportModal.addEventListener("click", (event) => {
      if (event.target === els.reportModal) closeReportModal();
    });
    els.reportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      savePlatformState();
      generatePdf();
      closeReportModal();
    });

    [
      els.inputQuestion,
      els.inputHypothesis,
      els.inputLocation,
      els.inputSource,
      els.inputTrialName,
      els.inputCondition,
      els.inputNote,
      els.inputConclusion,
      els.inputReflection,
      els.reportNames,
      els.reportClass,
    ].forEach((input) => input.addEventListener("input", () => {
      updateWorkflowState();
      scheduleAutosave();
    }));

    [els.inputTrialName, els.inputCondition, els.inputNote, els.inputLocation, els.inputSource].forEach((input) => {
      input.addEventListener("input", () => {
        updateCurrentTrialMeta();
        renderTrialSummaries();
        updateComparisonChart();
        scheduleAutosave();
      });
    });

    els.setupChecklist.addEventListener("change", () => {
      updateWorkflowState();
      scheduleAutosave();
    });

    window.addEventListener("pagehide", () => savePlatformState());
    window.addEventListener("beforeunload", () => savePlatformState());

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveWorkflowLink(visible.target.id);
      }, { threshold: [0.25, 0.5, 0.75] });
      document.querySelectorAll(".workflow-section").forEach((section) => observer.observe(section));
    }
  }

  function updateCompatibilityNotice() {
    const messages = [];
    if (!window.isSecureContext) {
      messages.push("WebSerial werkt alleen via localhost, HTTPS of GitHub Pages.");
    }
    if (!("serial" in navigator)) {
      messages.push("Deze browser ondersteunt WebSerial niet. Gebruik Chrome of Edge, of werk met de demomodus.");
      els.btnConnect.disabled = true;
    }
    if (!window.Chart || !window.jspdf) {
      messages.push("De lokale bibliotheken worden geladen vanuit vendor/. Controleer die map als grafieken of PDF niet starten.");
    }
    if (messages.length) {
      els.compatibilityNotice.classList.remove("hidden");
      els.compatibilityNotice.innerHTML = messages.map((message) => `<p>${escapeHtml(message)}</p>`).join("");
    }
  }

  function restoreSavedState() {
    const saved = loadSavedState();
    if (!saved) return false;

    const restoredTrials = Array.isArray(saved.trials)
      ? saved.trials.map((trial, index) => hydrateTrial(trial, index + 1)).filter(Boolean)
      : [];

    state.trials = restoredTrials.length ? restoredTrials : [makeEmptyTrial(1)];
    state.currentTrial = state.trials.find((trial) => trial.id === saved.currentTrialId) || state.trials[0];
    state.source = saved.source === "file" ? "file" : null;
    state.latestPacket = hydrateSample(saved.latestPacket) || lastSample(state.currentTrial);
    state.playbackSpeed = numberOr(saved.playbackSpeed, 10);
    state.playbackIndex = Math.max(0, Math.floor(numberOr(saved.playbackIndex, 0)));
    state.playbackTrial = state.trials.find((trial) => trial.id === saved.playbackTrialId)
      || (state.currentTrial?.mode === "file" ? state.currentTrial : null);
    state.playbackPlaying = false;

    applyStoredForm(saved.form);
    applyActiveTrialToForm();

    if (state.playbackTrial?.samples.length) {
      state.playbackIndex = clamp(state.playbackIndex, 0, state.playbackTrial.samples.length - 1);
      state.currentTrial = state.playbackTrial;
      state.latestPacket = state.playbackTrial.samples[state.playbackIndex];
    } else {
      state.playbackIndex = 0;
    }

    if (state.latestPacket) updateMetrics(state.latestPacket);
    els.playbackSpeed.value = String(state.playbackSpeed);
    els.connectionStatus.textContent = state.source === "file" ? "SD-log hersteld" : "Voortgang hersteld";
    renderTables();
    updateCharts();
    updateControls();
    updateWorkflowState();
    return true;
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(PLATFORM_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.version === 1 ? parsed : null;
    } catch (error) {
      console.warn("Kon opgeslagen fijnstofvoortgang niet laden:", error);
      return null;
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      savePlatformState();
    }, AUTOSAVE_DELAY_MS);
  }

  function savePlatformState() {
    if (autosaveTimer) {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    try {
      localStorage.setItem(PLATFORM_STORAGE_KEY, JSON.stringify(serializePlatformState()));
      state.autosaveFailed = false;
    } catch (error) {
      if (!state.autosaveFailed) {
        state.autosaveFailed = true;
        updateDiagnostics("Automatisch bewaren lukt niet in deze browsercontext.", [
          "Download zeker een CSV of PDF voordat je de pagina sluit.",
          String(error),
        ]);
      }
    }
  }

  function serializePlatformState() {
    updateCurrentTrialMeta();
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      source: state.source === "file" ? "file" : null,
      currentTrialId: state.currentTrial?.id || null,
      playbackTrialId: state.playbackTrial?.id || null,
      playbackIndex: state.playbackIndex,
      playbackSpeed: state.playbackSpeed,
      latestPacket: state.latestPacket ? serializeSample(state.latestPacket) : null,
      form: {
        question: els.inputQuestion.value,
        hypothesis: els.inputHypothesis.value,
        location: els.inputLocation.value,
        source: els.inputSource.value,
        conclusion: els.inputConclusion.value,
        reflection: els.inputReflection.value,
        reportNames: els.reportNames.value,
        reportClass: els.reportClass.value,
        setupChecked: [...els.setupChecklist.querySelectorAll('input[type="checkbox"]')].map((input) => input.checked),
      },
      trials: state.trials.map(serializeTrial),
    };
  }

  function serializeTrial(trial) {
    return {
      id: trial.id,
      name: trial.name,
      location: trial.location,
      source: trial.source,
      condition: trial.condition,
      note: trial.note,
      samples: trial.samples.map(serializeSample),
      startedAt: trial.startedAt ? trial.startedAt.toISOString() : null,
      stoppedAt: trial.stoppedAt ? trial.stoppedAt.toISOString() : null,
      deviceStartMs: trial.deviceStartMs,
      mode: trial.mode || "",
      importedFile: trial.importedFile || "",
    };
  }

  function serializeSample(sample) {
    return [
      sample.deviceMs,
      sample.elapsedMs,
      sample.pm1,
      sample.pm25,
      sample.pm10,
      sample.aqi,
      sample.source || "",
    ];
  }

  function hydrateTrial(savedTrial, fallbackNumber) {
    if (!savedTrial || typeof savedTrial !== "object") return null;
    const trial = makeEmptyTrial(fallbackNumber);
    trial.id = String(savedTrial.id || trial.id);
    trial.name = String(savedTrial.name || trial.name);
    trial.location = String(savedTrial.location || "");
    trial.source = String(savedTrial.source || "");
    trial.condition = String(savedTrial.condition || "");
    trial.note = String(savedTrial.note || "");
    trial.samples = Array.isArray(savedTrial.samples)
      ? savedTrial.samples.map(hydrateSample).filter(Boolean)
      : [];
    trial.startedAt = parseStoredDate(savedTrial.startedAt);
    trial.stoppedAt = parseStoredDate(savedTrial.stoppedAt);
    trial.deviceStartMs = nullableNumber(savedTrial.deviceStartMs);
    trial.mode = String(savedTrial.mode || "");
    trial.importedFile = String(savedTrial.importedFile || "");
    return trial;
  }

  function hydrateSample(savedSample) {
    if (Array.isArray(savedSample)) {
      const sample = {
        deviceMs: numberOr(savedSample[0], 0),
        elapsedMs: numberOr(savedSample[1], 0),
        pm1: numberOr(savedSample[2], 0),
        pm25: numberOr(savedSample[3], 0),
        pm10: numberOr(savedSample[4], 0),
        aqi: clamp(Math.round(numberOr(savedSample[5], 1)), 1, 6),
        source: String(savedSample[6] || "restored"),
      };
      sample.rawLine = packetToLine(sample);
      return sample;
    }

    if (!savedSample || typeof savedSample !== "object") return null;
    const sample = {
      deviceMs: numberOr(savedSample.deviceMs, 0),
      elapsedMs: numberOr(savedSample.elapsedMs, 0),
      pm1: numberOr(savedSample.pm1, 0),
      pm25: numberOr(savedSample.pm25, 0),
      pm10: numberOr(savedSample.pm10, 0),
      aqi: clamp(Math.round(numberOr(savedSample.aqi, 1)), 1, 6),
      source: String(savedSample.source || "restored"),
    };
    sample.rawLine = String(savedSample.rawLine || packetToLine(sample));
    return sample;
  }

  function applyStoredForm(form) {
    if (!form || typeof form !== "object") return;
    els.inputQuestion.value = String(form.question || "");
    els.inputHypothesis.value = String(form.hypothesis || "");
    els.inputLocation.value = String(form.location || "");
    els.inputSource.value = String(form.source || "");
    els.inputConclusion.value = String(form.conclusion || "");
    els.inputReflection.value = String(form.reflection || "");
    els.reportNames.value = String(form.reportNames || "");
    els.reportClass.value = String(form.reportClass || "");

    const checked = Array.isArray(form.setupChecked) ? form.setupChecked : [];
    [...els.setupChecklist.querySelectorAll('input[type="checkbox"]')].forEach((input, index) => {
      input.checked = Boolean(checked[index]);
    });
  }

  function applyActiveTrialToForm() {
    if (!state.currentTrial) return;
    els.inputTrialName.value = state.currentTrial.name || "";
    els.inputLocation.value = state.currentTrial.location || els.inputLocation.value;
    els.inputSource.value = state.currentTrial.source || els.inputSource.value;
    els.inputCondition.value = state.currentTrial.condition || "";
    els.inputNote.value = state.currentTrial.note || "";
  }

  function initializeCharts() {
    if (!window.Chart) return;
    state.liveChart = new Chart(els.liveChartCanvas, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          dataset("PM1", CHART_COLORS.pm1),
          dataset("PM2.5", CHART_COLORS.pm25),
          dataset("PM10", CHART_COLORS.pm10),
          dataset("AQI x 10", CHART_COLORS.aqi),
        ],
      },
      options: chartOptions("µg/m³"),
    });

    state.comparisonChart = new Chart(els.comparisonChartCanvas, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { label: "Gem. PM2.5", data: [], backgroundColor: CHART_COLORS.pm25 },
          { label: "Max PM2.5", data: [], backgroundColor: "#f472b6" },
          { label: "Gem. PM10", data: [], backgroundColor: CHART_COLORS.pm10 },
          { label: "Max AQI x 10", data: [], backgroundColor: CHART_COLORS.aqi },
        ],
      },
      options: chartOptions("vergelijking"),
    });
  }

  function dataset(label, color) {
    return {
      label,
      data: [],
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.25,
    };
  }

  function chartOptions(title) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      onClick: handleChartClick,
      plugins: {
        legend: { position: "bottom" },
        title: { display: false, text: title },
        tooltip: {
          callbacks: {
            label(context) {
              const label = context.dataset.label || "";
              const value = Number(context.parsed.y || 0).toFixed(1);
              return `${label}: ${value}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: "#eef2f7" } },
        y: { beginAtZero: true, grid: { color: "#eef2f7" } },
      },
    };
  }

  async function connectSerial() {
    if (!("serial" in navigator)) {
      alert("WebSerial is niet beschikbaar in deze browser. Gebruik Chrome of Edge, of start de demomodus.");
      return;
    }
    try {
      pausePlayback();
      state.port = await navigator.serial.requestPort();
      await state.port.open({ baudRate: BAUD_RATE });
      state.reader = state.port.readable
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream(new LineBreakTransformer()))
        .getReader();
      state.source = "serial";
      els.connectionStatus.textContent = `Verbonden (${BAUD_RATE} baud)`;
      els.btnConnect.disabled = true;
      updateDiagnostics("Arduino verbonden. Wacht op de eerste meetregel.", [
        "De nieuwe firmware stuurt tijd_ms, PM1, PM2.5, PM10 en AQI.",
      ]);
      startSerialLoop();
      updateControls();
      updateWorkflowState();
    } catch (error) {
      updateDiagnostics("Verbinding mislukt.", [String(error)]);
      alert(`Verbindingsfout: ${error}`);
    }
  }

  function startSerialLoop() {
    if (state.serialLoopActive || !state.reader) return;
    state.serialLoopActive = true;
    readSerialLoop();
  }

  async function readSerialLoop() {
    while (state.reader) {
      try {
        const { value, done } = await state.reader.read();
        if (done) break;
        if (typeof value === "string") parseSerialLine(value, "serial");
      } catch (error) {
        updateDiagnostics("Leesfout op de seriële verbinding.", [String(error)]);
        break;
      }
    }
    state.serialLoopActive = false;
  }

  function parseSerialLine(line, source) {
    const trimmed = line.trim();
    if (!trimmed) return;
    els.serialPreview.textContent = `Laatste regel: ${trimmed}`;
    if (trimmed.startsWith("#")) {
      handleArduinoStatus(trimmed);
      return;
    }
    const values = trimmed.split(",").map((part) => Number(part.trim()));
    if (![4, 5].includes(values.length) || values.some((value) => !Number.isFinite(value))) {
      state.droppedLines += 1;
      updateDiagnostics("Seriële regel overgeslagen.", [
        `Ontvangen velden: ${values.length}. Verwacht 5 velden met tijd_ms, PM1, PM2.5, PM10, AQI.`,
      ]);
      return;
    }
    if (values.length === 4 && !state.legacyTimestampWarningShown) {
      state.legacyTimestampWarningShown = true;
      updateDiagnostics("Oud CSV-formaat ontvangen.", [
        "De app kan dit lezen, maar tijd_ms ontbreekt. Gebruik de nieuwe Arduino-code voor betrouwbaardere meetduur.",
      ]);
    }
    handlePacket(packetFromValues(values), source, trimmed);
  }

  function handleArduinoStatus(line) {
    const message = line.replace(/^#\s*/, "");
    const isError = /fout|niet gevonden|niet leesbaar/i.test(message);
    updateDiagnostics(message, [
      isError
        ? "Controleer voeding, GND, SDA en SCL. Kijk ook na of de juiste firmware op het bord staat."
        : "Statusregel van de Arduino ontvangen. Wacht op de eerste CSV-meetregel.",
    ]);
  }

  async function handleLogFileChoice(event) {
    const file = event.target.files?.[0] || null;
    if (file) await importLogFile(file);
    event.target.value = "";
  }

  async function importLogFile(file) {
    try {
      const text = await file.text();
      const result = parseLogCsv(text);
      const importedTrials = importLogResult(result, file.name);
      const sampleTotal = importedTrials.reduce((total, trial) => total + trial.samples.length, 0);
      updateDiagnostics(
        result.warnings.length ? "SD-log geladen met overgeslagen regels." : "SD-log geladen.",
        [
          `${importedTrials.length} meetreeks(en) en ${sampleTotal} meetpunten geïmporteerd uit ${file.name}.`,
          "Gebruik de tijdlijn of Speel af om de meting opnieuw te bekijken.",
          ...result.warnings.slice(0, 3),
        ]
      );
    } catch (error) {
      updateDiagnostics("SD-log niet geladen.", [String(error.message || error)]);
      alert(`Importfout: ${error.message || error}`);
    }
  }

  function parseLogCsv(text) {
    const rows = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => ({ raw: line, trimmed: line.trim() }))
      .filter((line) => line.trimmed && !line.trimmed.startsWith("#"))
      .map((line) => ({ raw: line.raw, cells: splitCsvLine(line.raw).map((cell) => cell.trim()) }));

    if (!rows.length) throw new Error("Het bestand bevat geen CSV-meetregels.");

    const hasHeader = looksLikeHeader(rows[0].cells);
    const headers = hasHeader ? rows[0].cells.map(normalizeHeader) : [];
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const packets = [];
    const groupedRows = [];
    const warnings = [];
    const meta = hasHeader ? metaFromHeaderRow(rows[1]?.cells || [], headers) : {};

    dataRows.forEach((row, index) => {
      try {
        const packet = hasHeader
          ? packetFromHeaderRow(row.cells, headers, index)
          : packetFromCsvRow(row.cells, index);
        packets.push({ ...packet, rawLine: row.raw });
        if (hasHeader && hasMetadataHeaders(headers)) {
          groupedRows.push({
            packet: { ...packet, rawLine: row.raw },
            meta: metaFromHeaderRow(row.cells, headers),
          });
        }
      } catch (error) {
        warnings.push(`Regel ${hasHeader ? index + 2 : index + 1}: ${error.message}`);
      }
    });

    if (!packets.length) {
      const detail = warnings.length ? ` ${warnings.slice(0, 3).join(" ")}` : "";
      throw new Error(`Geen geldige meetpunten gevonden.${detail}`);
    }

    return { packets, meta, groupedRows, warnings };
  }

  function importLogResult(result, filename) {
    if (state.isMeasuring) stopMeasurement();
    pausePlayback();
    removeEmptyCurrentTrial();

    const groups = groupPacketsForImport(result, filename);
    const importedTrials = groups.map((group) => importTrialFromPackets(group.packets, group.meta));
    const trial = importedTrials[importedTrials.length - 1];

    state.source = "file";
    state.latestPacket = trial.samples[trial.samples.length - 1] || null;
    els.connectionStatus.textContent = "SD-log geladen";
    if (state.latestPacket) updateMetrics(state.latestPacket);
    setPlaybackTrial(trial, trial.samples.length - 1);
    renderTables();
    updateCharts();
    updateControls();
    updateWorkflowState();
    savePlatformState();

    return importedTrials;
  }

  function groupPacketsForImport(result, filename) {
    if (!result.groupedRows?.length) {
      return [{
        packets: result.packets,
        meta: {
          ...result.meta,
          filename,
          name: result.meta.name || filename.replace(/\.[^.]+$/, "") || `SD-log ${state.trials.length + 1}`,
        },
      }];
    }

    const groups = new Map();
    result.groupedRows.forEach((row) => {
      const name = row.meta.name || filename.replace(/\.[^.]+$/, "") || "SD-log";
      if (!groups.has(name)) {
        groups.set(name, {
          packets: [],
          meta: {
            ...row.meta,
            filename,
            name,
          },
        });
      }
      groups.get(name).packets.push(row.packet);
    });
    return [...groups.values()];
  }

  function importTrialFromPackets(packets, meta) {
    const number = state.trials.length + 1;
    const firstDeviceMs = packets[0]?.deviceMs ?? 0;
    const trial = {
      id: `trial-${Date.now()}-${number}`,
      name: meta.name || `SD-log ${number}`,
      location: meta.location || els.inputLocation.value.trim(),
      source: meta.source || els.inputSource.value.trim(),
      condition: meta.condition || "microSD-log",
      note: meta.note || meta.filename || "",
      samples: packets.map((packet) => ({
        deviceMs: packet.deviceMs,
        elapsedMs: Math.max(0, packet.deviceMs - firstDeviceMs),
        pm1: packet.pm1,
        pm25: packet.pm25,
        pm10: packet.pm10,
        aqi: packet.aqi,
        source: "file",
        rawLine: packet.rawLine || packetToLine(packet),
      })),
      startedAt: null,
      stoppedAt: null,
      deviceStartMs: firstDeviceMs,
      mode: "file",
      importedFile: meta.filename || "",
    };

    state.trials.push(trial);
    state.currentTrial = trial;
    els.inputTrialName.value = trial.name;
    els.inputLocation.value = trial.location;
    els.inputSource.value = trial.source;
    els.inputCondition.value = trial.condition;
    els.inputNote.value = trial.note;
    return trial;
  }

  function splitCsvLine(line) {
    const cells = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(cell);
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells;
  }

  function looksLikeHeader(cells) {
    return cells.some((cell) => /[a-zA-Zµμ]/.test(cell));
  }

  function normalizeHeader(header) {
    return String(header || "")
      .toLowerCase()
      .replace(/[µμ]/g, "u")
      .replace(/[^a-z0-9]/g, "");
  }

  function packetFromHeaderRow(cells, headers, rowIndex) {
    const msIndex = findHeader(headers, ["tijdms", "timems", "devicems", "millis"]);
    const secondsIndex = findHeader(headers, ["tijds", "times", "tijd", "time", "t"]);
    const pm1Index = findHeader(headers, ["pm1", "pm1ugm3"]);
    const pm25Index = findHeader(headers, ["pm25", "pm25ugm3"]);
    const pm10Index = findHeader(headers, ["pm10", "pm10ugm3"]);
    const aqiIndex = findHeader(headers, ["aqi", "europeseaqi", "europeanaqi"]);

    const pm1 = readCsvNumber(cells, pm1Index, "PM1");
    const pm25 = readCsvNumber(cells, pm25Index, "PM2.5");
    const pm10 = readCsvNumber(cells, pm10Index, "PM10");
    const deviceMs = msIndex >= 0
      ? readCsvNumber(cells, msIndex, "tijd_ms")
      : secondsIndex >= 0
        ? readCsvNumber(cells, secondsIndex, "tijd_s") * 1000
        : (rowIndex + 1) * LEGACY_INTERVAL_MS;
    const aqi = aqiIndex >= 0
      ? readCsvNumber(cells, aqiIndex, "AQI")
      : calculateAqi(pm25, pm10);

    return cleanPacket(deviceMs, pm1, pm25, pm10, aqi);
  }

  function packetFromCsvRow(cells, rowIndex) {
    const values = cells.map((cell) => parseCsvNumber(cell));
    if (![4, 5].includes(values.length) || values.some((value) => !Number.isFinite(value))) {
      throw new Error("verwacht 4 of 5 numerieke CSV-velden.");
    }

    if (values.length === 5) {
      return cleanPacket(values[0], values[1], values[2], values[3], values[4]);
    }

    return cleanPacket((rowIndex + 1) * LEGACY_INTERVAL_MS, values[0], values[1], values[2], values[3]);
  }

  function metaFromHeaderRow(cells, headers) {
    return {
      name: readOptionalText(cells, headers, ["meetreeks", "measurementseries", "series", "trial"]),
      location: readOptionalText(cells, headers, ["plek", "meetplek", "location"]),
      source: readOptionalText(cells, headers, ["bron", "source"]),
      condition: readOptionalText(cells, headers, ["omstandigheden", "conditions"]),
      note: readOptionalText(cells, headers, ["notitie", "note"]),
    };
  }

  function hasMetadataHeaders(headers) {
    return ["meetreeks", "measurementseries", "series", "trial"].some((alias) => headers.includes(alias));
  }

  function readOptionalText(cells, headers, aliases) {
    const index = findHeader(headers, aliases);
    return index >= 0 ? String(cells[index] || "").trim() : "";
  }

  function findHeader(headers, aliases) {
    return headers.findIndex((header) => aliases.includes(header));
  }

  function readCsvNumber(cells, index, label) {
    if (index < 0) throw new Error(`${label} ontbreekt.`);
    const value = parseCsvNumber(cells[index]);
    if (!Number.isFinite(value)) throw new Error(`${label} is geen getal.`);
    return value;
  }

  function parseCsvNumber(value) {
    return Number(String(value ?? "").trim().replace(",", "."));
  }

  function cleanPacket(deviceMs, pm1, pm25, pm10, aqi) {
    if (![deviceMs, pm1, pm25, pm10, aqi].every(Number.isFinite)) {
      throw new Error("meetregel bevat ongeldige getallen.");
    }
    return {
      deviceMs: Math.max(0, deviceMs),
      pm1: clamp(pm1, 0, 1000),
      pm25: clamp(pm25, 0, 1000),
      pm10: clamp(pm10, 0, 1000),
      aqi: clamp(Math.round(aqi), 1, 6),
    };
  }

  function removeEmptyCurrentTrial() {
    if (!state.currentTrial || state.currentTrial.samples.length) return;
    const index = state.trials.indexOf(state.currentTrial);
    if (index >= 0) state.trials.splice(index, 1);
    state.currentTrial = null;
  }

  function packetFromValues(values) {
    if (values.length === 5) {
      return {
        deviceMs: values[0],
        pm1: clamp(values[1], 0, 1000),
        pm25: clamp(values[2], 0, 1000),
        pm10: clamp(values[3], 0, 1000),
        aqi: clamp(Math.round(values[4]), 1, 6),
      };
    }
    state.fallbackDeviceMs += LEGACY_INTERVAL_MS;
    return {
      deviceMs: state.fallbackDeviceMs,
      pm1: clamp(values[0], 0, 1000),
      pm25: clamp(values[1], 0, 1000),
      pm10: clamp(values[2], 0, 1000),
      aqi: clamp(Math.round(values[3]), 1, 6),
    };
  }

  function handlePacket(packet, source, rawLine) {
    state.latestPacket = { ...packet, source, rawLine };
    updateMetrics(packet);
    if (state.isMeasuring) {
      addSampleToCurrentTrial(packet, source, rawLine);
    }
    renderSampleTable();
    renderTrialSummaries();
    updateCharts();
    updateControls();
    updateWorkflowState();
    if (state.isMeasuring) scheduleAutosave();
    if (totalSampleCount() === 0) {
      updateDiagnostics("Data ontvangen.", ["Klik op Start meting om meetpunten in een meetreeks op te slaan."]);
    }
  }

  function toggleDemoMode() {
    if (state.demoTimer) {
      window.clearInterval(state.demoTimer);
      state.demoTimer = null;
      state.source = state.reader ? "serial" : null;
      els.btnDemo.textContent = "Start demomodus";
      els.connectionStatus.textContent = state.reader ? `Verbonden (${BAUD_RATE} baud)` : "Niet verbonden";
      updateDiagnostics("Demomodus gestopt.", ["Verbind Arduino of start opnieuw een demo."]);
      updateControls();
      updateWorkflowState();
      scheduleAutosave();
      return;
    }
    pausePlayback();
    state.source = "demo";
    state.demoMs = 0;
    els.btnDemo.textContent = "Stop demomodus";
    els.connectionStatus.textContent = "Demomodus actief";
    updateDiagnostics("Demomodus actief.", [
      "Gesimuleerde PM-waarden testen de interface zonder sensor.",
    ]);
    makeDemoTick();
    state.demoTimer = window.setInterval(makeDemoTick, DEMO_INTERVAL_MS);
    updateControls();
    updateWorkflowState();
    scheduleAutosave();
  }

  function makeDemoTick() {
    state.demoMs += DEMO_INTERVAL_MS;
    const t = state.demoMs / 1000;
    const trafficPulse = 1 + Math.max(0, Math.sin(t / 9)) * 1.3;
    const indoorDip = 0.82 + Math.sin(t / 17) * 0.12;
    const pm1 = 4 + Math.sin(t / 3) * 1.2 + Math.random() * 1.4;
    const pm25 = (8 + Math.sin(t / 5) * 3 + Math.random() * 2.4) * trafficPulse * indoorDip;
    const pm10 = pm25 * (1.4 + Math.sin(t / 7) * 0.22) + Math.random() * 4;
    const packet = {
      deviceMs: state.demoMs,
      pm1: clamp(pm1, 0, 1000),
      pm25: clamp(pm25, 0, 1000),
      pm10: clamp(pm10, 0, 1000),
      aqi: calculateAqi(pm25, pm10),
    };
    handlePacket(packet, "demo", packetToLine(packet));
  }

  function createTrial(options = {}) {
    if (state.isMeasuring) stopMeasurement();
    const number = state.trials.length + 1;
    const trial = makeEmptyTrial(number);
    state.trials.push(trial);
    state.currentTrial = trial;
    els.inputTrialName.value = trial.name;
    els.inputCondition.value = "";
    els.inputNote.value = "";
    renderTables();
    updateCharts();
    updateControls();
    updateWorkflowState();
    if (options.focusName) els.inputTrialName.focus();
    if (!options.skipAutosave) scheduleAutosave();
  }

  function makeEmptyTrial(number) {
    return {
      id: `trial-${Date.now()}-${number}`,
      name: `Meting ${number}`,
      location: els.inputLocation?.value.trim() || "",
      source: els.inputSource?.value.trim() || "",
      condition: "",
      note: "",
      samples: [],
      startedAt: null,
      stoppedAt: null,
      deviceStartMs: null,
      mode: "",
      importedFile: "",
    };
  }

  function startMeasurement() {
    if (!(state.source === "serial" || state.source === "demo")) {
      alert("Verbind eerst de Arduino of start de demomodus.");
      return;
    }
    if (!state.currentTrial || state.currentTrial.samples.length) {
      createTrial();
    }
    updateCurrentTrialMeta();
    state.currentTrial.startedAt = new Date();
    state.currentTrial.deviceStartMs = state.latestPacket ? state.latestPacket.deviceMs : null;
    state.isMeasuring = true;
    els.connectionStatus.textContent = state.source === "demo" ? "Demomodus meet" : `Meten (${BAUD_RATE} baud)`;
    updateDiagnostics("Meting loopt.", [
      "Laat de sensor op dezelfde plek staan voor een bruikbare reeks.",
    ]);
    updateControls();
    updateWorkflowState();
    scheduleAutosave();
  }

  function stopMeasurement() {
    if (!state.isMeasuring) return;
    state.isMeasuring = false;
    if (state.currentTrial) {
      state.currentTrial.stoppedAt = new Date();
      updateCurrentTrialMeta();
    }
    els.connectionStatus.textContent = state.source === "demo" ? "Demomodus actief" : state.source ? `Verbonden (${BAUD_RATE} baud)` : "Niet verbonden";
    updateDiagnostics("Meting gestopt.", [
      "Maak een nieuwe meetreeks of vergelijk de resultaten.",
    ]);
    renderTables();
    updateCharts();
    updateControls();
    updateWorkflowState();
    savePlatformState();
  }

  function updateCurrentTrialMeta() {
    if (!state.currentTrial) return;
    state.currentTrial.name = els.inputTrialName.value.trim() || state.currentTrial.name;
    state.currentTrial.location = els.inputLocation.value.trim();
    state.currentTrial.source = els.inputSource.value.trim();
    state.currentTrial.condition = els.inputCondition.value.trim();
    state.currentTrial.note = els.inputNote.value.trim();
  }

  function addSampleToCurrentTrial(packet, source, rawLine) {
    if (!state.currentTrial) createTrial();
    if (!state.currentTrial.samples.length && state.currentTrial.deviceStartMs === null) {
      state.currentTrial.deviceStartMs = packet.deviceMs;
    }
    const elapsedMs = Math.max(0, packet.deviceMs - (state.currentTrial.deviceStartMs ?? packet.deviceMs));
    state.currentTrial.samples.push({
      deviceMs: packet.deviceMs,
      elapsedMs,
      pm1: packet.pm1,
      pm25: packet.pm25,
      pm10: packet.pm10,
      aqi: packet.aqi,
      source,
      rawLine,
    });
  }

  function updateMetrics(packet) {
    els.metricPm1.textContent = `${formatNumber(packet.pm1)} µg/m³`;
    els.metricPm25.textContent = `${formatNumber(packet.pm25)} µg/m³`;
    els.metricPm10.textContent = `${formatNumber(packet.pm10)} µg/m³`;
    els.metricAqi.textContent = String(packet.aqi);
    els.metricAqiLabel.textContent = AQI_LABELS[packet.aqi] || "--";
    const status = packet.aqi <= 2 ? "good" : packet.aqi <= 3 ? "medium" : "bad";
    document.querySelector('[data-level="aqi"]').dataset.status = status;
  }

  function renderTables() {
    renderSampleTable();
    renderTrialSummaries();
  }

  function renderSampleTable() {
    const rows = visibleSamplesForCurrentTrial().slice(-8).reverse();
    if (!rows.length) {
      els.sampleBody.innerHTML = '<tr><td colspan="5">Nog geen data.</td></tr>';
      return;
    }
    els.sampleBody.innerHTML = rows.map((sample) => `
      <tr>
        <td>${(sample.elapsedMs / 1000).toFixed(0)} s</td>
        <td>${formatNumber(sample.pm1)}</td>
        <td>${formatNumber(sample.pm25)}</td>
        <td>${formatNumber(sample.pm10)}</td>
        <td>${sample.aqi} (${escapeHtml(AQI_LABELS[sample.aqi] || "--")})</td>
      </tr>
    `).join("");
  }

  function renderTrialSummaries() {
    const trials = trialsWithData();
    if (!trials.length) {
      els.trialSummaryBody.innerHTML = '<tr><td colspan="7">Nog geen meetreeks.</td></tr>';
      return;
    }
    els.trialSummaryBody.innerHTML = trials.map((trial) => {
      const summary = summarizeTrial(trial);
      return `
        <tr>
          <td>${escapeHtml(trial.name)}</td>
          <td>${escapeHtml(trial.location || "-")}</td>
          <td>${formatDuration(summary.durationMs)}</td>
          <td>${formatNumber(summary.avgPm25)}</td>
          <td>${formatNumber(summary.maxPm25)}</td>
          <td>${formatNumber(summary.avgPm10)}</td>
          <td>${summary.maxAqi}</td>
        </tr>
      `;
    }).join("");
  }

  function updateCharts() {
    updateLiveChart();
    updateComparisonChart();
  }

  function updateLiveChart() {
    if (!state.liveChart) return;
    const rows = visibleSamplesForCurrentTrial({ forChart: true });
    state.liveChart.data.labels = rows.map((sample) => `${(sample.elapsedMs / 1000).toFixed(0)}s`);
    state.liveChart.data.datasets[0].data = rows.map((sample) => sample.pm1);
    state.liveChart.data.datasets[1].data = rows.map((sample) => sample.pm25);
    state.liveChart.data.datasets[2].data = rows.map((sample) => sample.pm10);
    state.liveChart.data.datasets[3].data = rows.map((sample) => sample.aqi * 10);
    state.liveChart.update();
  }

  function updateComparisonChart() {
    if (!state.comparisonChart) return;
    const trials = trialsWithData();
    const summaries = trials.map(summarizeTrial);
    state.comparisonChart.data.labels = trials.map((trial) => trial.name);
    state.comparisonChart.data.datasets[0].data = summaries.map((summary) => summary.avgPm25);
    state.comparisonChart.data.datasets[1].data = summaries.map((summary) => summary.maxPm25);
    state.comparisonChart.data.datasets[2].data = summaries.map((summary) => summary.avgPm10);
    state.comparisonChart.data.datasets[3].data = summaries.map((summary) => summary.maxAqi * 10);
    state.comparisonChart.update();
  }

  function visibleSamplesForCurrentTrial(options = {}) {
    if (!state.currentTrial) return [];
    const samples = state.currentTrial.samples || [];
    if (state.playbackTrial === state.currentTrial && samples.length) {
      return samples.slice(0, state.playbackIndex + 1);
    }
    return options.forChart && state.currentTrial.mode !== "file" ? samples.slice(-120) : samples;
  }

  function handleChartClick(event, points, chart) {
    if (chart !== state.liveChart || !state.currentTrial?.samples.length) return;
    const nearest = chart.getElementsAtEventForMode(event, "nearest", { intersect: false }, true)[0];
    if (!nearest) return;
    if (state.currentTrial.mode === "file") {
      pausePlayback();
      setPlaybackTrial(state.currentTrial, nearest.index);
    } else {
      const visibleRows = visibleSamplesForCurrentTrial({ forChart: true });
      const sample = visibleRows[nearest.index];
      if (sample) updateMetrics(sample);
    }
  }

  function setPlaybackTrial(trial, index = 0) {
    state.playbackTrial = trial;
    state.playbackIndex = clamp(Math.round(index), 0, Math.max(0, (trial?.samples.length || 1) - 1));
    state.playbackPlaying = false;
    updatePlaybackReadout();
    scheduleAutosave();
  }

  function startPlayback() {
    if (!state.playbackTrial?.samples.length) return;
    if (state.playbackIndex >= state.playbackTrial.samples.length - 1) {
      setPlaybackIndex(0);
    }
    state.playbackPlaying = true;
    els.connectionStatus.textContent = "SD-log speelt af";
    restartPlaybackTimer();
    updatePlaybackReadout();
    scheduleAutosave();
  }

  function pausePlayback() {
    if (state.playbackTimer) {
      window.clearInterval(state.playbackTimer);
      state.playbackTimer = null;
    }
    if (state.playbackPlaying) {
      state.playbackPlaying = false;
      els.connectionStatus.textContent = state.source === "file" ? "SD-log geladen" : els.connectionStatus.textContent;
    }
    updatePlaybackReadout();
    scheduleAutosave();
  }

  function resetPlayback() {
    if (!state.playbackTrial?.samples.length) return;
    pausePlayback();
    setPlaybackIndex(0);
  }

  function restartPlaybackTimer() {
    if (state.playbackTimer) window.clearInterval(state.playbackTimer);
    const interval = Math.max(80, SAMPLE_INTERVAL_MS / Math.max(1, state.playbackSpeed));
    state.playbackTimer = window.setInterval(advancePlayback, interval);
  }

  function advancePlayback() {
    if (!state.playbackTrial?.samples.length) {
      pausePlayback();
      return;
    }
    if (state.playbackIndex >= state.playbackTrial.samples.length - 1) {
      pausePlayback();
      setPlaybackIndex(state.playbackTrial.samples.length - 1);
      return;
    }
    setPlaybackIndex(state.playbackIndex + 1);
  }

  function setPlaybackIndex(index) {
    if (!state.playbackTrial?.samples.length) return;
    state.playbackIndex = clamp(Math.round(index), 0, state.playbackTrial.samples.length - 1);
    const sample = state.playbackTrial.samples[state.playbackIndex];
    state.currentTrial = state.playbackTrial;
    state.latestPacket = sample;
    updateMetrics(sample);
    renderSampleTable();
    updateLiveChart();
    updatePlaybackReadout();
    updateWorkflowState();
    scheduleAutosave();
  }

  function updatePlaybackReadout() {
    const trial = state.playbackTrial;
    const hasPlayback = Boolean(trial?.samples.length);
    const sample = hasPlayback ? trial.samples[state.playbackIndex] : null;
    els.btnPlaybackPlay.disabled = !hasPlayback || state.playbackPlaying;
    els.btnPlaybackPause.disabled = !hasPlayback || !state.playbackPlaying;
    els.btnPlaybackReset.disabled = !hasPlayback;
    els.playbackRange.disabled = !hasPlayback;
    els.playbackSpeed.disabled = !hasPlayback;
    els.playbackRange.max = hasPlayback ? String(trial.samples.length - 1) : "0";
    els.playbackRange.value = hasPlayback ? String(state.playbackIndex) : "0";
    els.playbackTitle.textContent = hasPlayback ? trial.name : "Liveweergave";
    els.playbackTime.textContent = sample ? formatDuration(sample.elapsedMs) : "0 s";
    els.playbackStatus.textContent = hasPlayback
      ? `${state.playbackIndex + 1}/${trial.samples.length} meetpunten · ${state.playbackPlaying ? "afspelen" : "gepauzeerd"}`
      : "Nog geen SD-log geladen.";
  }

  function openReportModal() {
    if (!totalSampleCount()) {
      alert("Er zijn nog geen meetgegevens om te rapporteren.");
      return;
    }
    els.reportModal.classList.remove("hidden");
    els.reportNames.focus();
  }

  function closeReportModal() {
    els.reportModal.classList.add("hidden");
  }

  function generatePdf() {
    if (!window.jspdf?.jsPDF) {
      alert("PDF-bibliotheek kon niet geladen worden.");
      return;
    }
    if (state.isMeasuring) stopMeasurement();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const margin = 14;
    let y = 18;
    const trials = trialsWithData();
    const summaries = trials.map(summarizeTrial);

    doc.setFontSize(18);
    doc.text("Rapport Project Fijnstof", margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Datum: ${new Date().toLocaleDateString("nl-BE")}`, margin, y);
    y += 6;
    doc.text(`Naam/namen: ${els.reportNames.value.trim() || "-"}`, margin, y);
    y += 6;
    doc.text(`Klas: ${els.reportClass.value.trim() || "-"}`, margin, y);
    y += 6;
    doc.text(`Aantal meetpunten: ${totalSampleCount()}`, margin, y);
    y += 10;

    y = addPdfBlock(doc, y, "Onderzoeksvraag", els.inputQuestion.value || "-");
    y = addPdfBlock(doc, y, "Hypothese", els.inputHypothesis.value || "-");
    y = addPdfBlock(doc, y, "Meetplek en verwachte bron", `Plek: ${els.inputLocation.value || "-"}\nBron: ${els.inputSource.value || "-"}`);

    if (typeof doc.autoTable === "function") {
      doc.autoTable({
        startY: y,
        head: [["Meetreeks", "Duur", "Gem. PM2.5", "Max PM2.5", "Gem. PM10", "Max AQI"]],
        body: trials.map((trial, index) => [
          trial.name,
          formatDuration(summaries[index].durationMs),
          formatNumber(summaries[index].avgPm25),
          formatNumber(summaries[index].maxPm25),
          formatNumber(summaries[index].avgPm10),
          String(summaries[index].maxAqi),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [82, 0, 255] },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    try {
      const image = els.comparisonChartCanvas.toDataURL("image/png", 1);
      if (y > 165) {
        doc.addPage();
        y = 18;
      }
      doc.setFontSize(12);
      doc.text("Vergelijkende grafiek", margin, y);
      y += 4;
      doc.addImage(image, "PNG", margin, y, 180, 78);
      y += 86;
    } catch (error) {
      console.warn("Kon grafiek niet toevoegen aan PDF:", error);
    }

    y = addPdfBlock(doc, y, "Besluit", els.inputConclusion.value || "-");
    y = addPdfBlock(doc, y, "Reflectie", els.inputReflection.value || "-");

    doc.addPage();
    doc.setFontSize(12);
    doc.text("Ruwe meetdata", margin, 18);
    if (typeof doc.autoTable === "function") {
      const body = trials.flatMap((trial) => trial.samples.map((sample) => [
        trial.name,
        `${(sample.elapsedMs / 1000).toFixed(0)} s`,
        formatNumber(sample.pm1),
        formatNumber(sample.pm25),
        formatNumber(sample.pm10),
        String(sample.aqi),
      ]));
      doc.autoTable({
        startY: 24,
        head: [["Meetreeks", "t", "PM1", "PM2.5", "PM10", "AQI"]],
        body,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [82, 0, 255] },
      });
    }

    doc.save(`Rapport_Project_Fijnstof_${dateStamp()}.pdf`);
  }

  function exportCsv() {
    const trials = trialsWithData();
    if (!trials.length) {
      alert("Er zijn nog geen meetgegevens om te exporteren.");
      return;
    }
    const rows = [
      ["meetreeks", "plek", "bron", "omstandigheden", "notitie", "tijd_s", "pm1_ug_m3", "pm25_ug_m3", "pm10_ug_m3", "aqi"].join(","),
      ...trials.flatMap((trial) => trial.samples.map((sample) => [
        csvCell(trial.name),
        csvCell(trial.location),
        csvCell(trial.source),
        csvCell(trial.condition),
        csvCell(trial.note),
        (sample.elapsedMs / 1000).toFixed(0),
        sample.pm1.toFixed(2),
        sample.pm25.toFixed(2),
        sample.pm10.toFixed(2),
        sample.aqi,
      ].join(","))),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project_fijnstof_${dateStamp()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateControls() {
    const hasLiveSource = state.source === "serial" || state.source === "demo";
    els.btnStart.disabled = !hasLiveSource || state.isMeasuring;
    els.btnStop.disabled = !state.isMeasuring;
    els.btnReport.disabled = !totalSampleCount();
    els.btnExportCsv.disabled = !totalSampleCount();
    updatePlaybackReadout();
  }

  function updateDiagnostics(summary, items = []) {
    els.diagnosticSummary.textContent = summary;
    els.diagnosticList.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function updateWorkflowState() {
    const setupInputs = [...els.setupChecklist.querySelectorAll('input[type="checkbox"]')];
    const requiredSetupInputs = setupInputs.filter((input) => !input.dataset.optional);
    const completed = {
      prediction: Boolean(els.inputQuestion.value.trim() && els.inputHypothesis.value.trim()),
      setup: requiredSetupInputs.length > 0 && requiredSetupInputs.every((input) => input.checked),
      connect: Boolean(state.source) || totalSampleCount() > 0,
      measurement: totalSampleCount() > 0,
      comparison: trialsWithData().length > 0,
      conclusion: Boolean(els.inputConclusion.value.trim()),
    };
    els.workflowLinks.forEach((link) => {
      link.classList.toggle("is-complete", Boolean(completed[link.dataset.stepLink]));
    });
  }

  function setActiveWorkflowLink(stepId) {
    els.workflowLinks.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.stepLink === stepId);
    });
  }

  function trialsWithData() {
    return state.trials.filter((trial) => trial.samples.length);
  }

  function totalSampleCount() {
    return state.trials.reduce((total, trial) => total + trial.samples.length, 0);
  }

  function summarizeTrial(trial) {
    const samples = trial.samples;
    return {
      durationMs: samples.length ? samples[samples.length - 1].elapsedMs : 0,
      avgPm1: average(samples.map((sample) => sample.pm1)),
      avgPm25: average(samples.map((sample) => sample.pm25)),
      avgPm10: average(samples.map((sample) => sample.pm10)),
      maxPm25: max(samples.map((sample) => sample.pm25)),
      maxPm10: max(samples.map((sample) => sample.pm10)),
      maxAqi: max(samples.map((sample) => sample.aqi)),
    };
  }

  function calculateAqi(pm25, pm10) {
    let pm25Index = 1;
    if (pm25 <= 10) pm25Index = 1;
    else if (pm25 <= 20) pm25Index = 2;
    else if (pm25 <= 25) pm25Index = 3;
    else if (pm25 <= 50) pm25Index = 4;
    else if (pm25 <= 75) pm25Index = 5;
    else pm25Index = 6;

    let pm10Index = 1;
    if (pm10 <= 20) pm10Index = 1;
    else if (pm10 <= 40) pm10Index = 2;
    else if (pm10 <= 50) pm10Index = 3;
    else if (pm10 <= 100) pm10Index = 4;
    else if (pm10 <= 150) pm10Index = 5;
    else pm10Index = 6;
    return Math.max(pm25Index, pm10Index);
  }

  function packetToLine(packet) {
    return [
      packet.deviceMs,
      packet.pm1.toFixed(2),
      packet.pm25.toFixed(2),
      packet.pm10.toFixed(2),
      packet.aqi,
    ].join(",");
  }

  function addPdfBlock(doc, y, title, text) {
    if (y > 255) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(12);
    doc.text(title, 14, y);
    y += 5;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, 14, y);
    return y + lines.length * 5 + 5;
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function max(values) {
    return values.length ? Math.max(...values) : 0;
  }

  function formatNumber(value) {
    return Number(value || 0).toFixed(1);
  }

  function formatDuration(ms) {
    if (!ms) return "0 s";
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} s`;
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) return "-";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} kB`;
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function lastSample(trial) {
    return trial?.samples?.length ? trial.samples[trial.samples.length - 1] : null;
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function nullableNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function parseStoredDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
