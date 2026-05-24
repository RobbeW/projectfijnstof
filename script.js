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
  const DEMO_INTERVAL_MS = 1000;
  const LEGACY_INTERVAL_MS = 5000;
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
    comparisonChartCanvas: $("comparison-chart"),
    trialSummaryBody: $("trial-summary-body"),
    sampleBody: $("sample-body"),
    btnExportCsv: $("btn-export-csv"),
    inputConclusion: $("input-conclusion"),
    inputReflection: $("input-reflection"),
    btnReport: $("btn-report"),
    btnCodeHelp: $("btn-code-help"),
    btnCloseCodeHelp: $("btn-close-code-help"),
    codeHelpModal: $("code-help-modal"),
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
  };

  initialize();

  function initialize() {
    initializeCharts();
    bindEvents();
    updateCompatibilityNotice();
    updateDiagnostics("Nog geen data ontvangen.", [
      "Verbind de Arduino of start de demomodus.",
      "Verwachte regel: tijd_ms, PM1, PM2.5, PM10, AQI.",
    ]);
    createTrial();
    updateControls();
    updateWorkflowState();
    renderTables();
  }

  function bindEvents() {
    els.btnConnect.addEventListener("click", connectSerial);
    els.btnDemo.addEventListener("click", toggleDemoMode);
    els.btnNewTrial.addEventListener("click", () => createTrial({ focusName: true }));
    els.btnStart.addEventListener("click", startMeasurement);
    els.btnStop.addEventListener("click", stopMeasurement);
    els.btnExportCsv.addEventListener("click", exportCsv);
    els.btnReport.addEventListener("click", openReportModal);
    els.btnCodeHelp.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCodeHelpModal();
    });
    els.btnCloseCodeHelp.addEventListener("click", closeCodeHelpModal);
    els.codeHelpModal.addEventListener("click", (event) => {
      if (event.target === els.codeHelpModal) closeCodeHelpModal();
    });
    els.btnCancelReport.addEventListener("click", closeReportModal);
    els.btnReportBack.addEventListener("click", closeReportModal);
    els.reportModal.addEventListener("click", (event) => {
      if (event.target === els.reportModal) closeReportModal();
    });
    els.reportForm.addEventListener("submit", (event) => {
      event.preventDefault();
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
    ].forEach((input) => input.addEventListener("input", updateWorkflowState));

    [els.inputTrialName, els.inputCondition, els.inputNote, els.inputLocation, els.inputSource].forEach((input) => {
      input.addEventListener("input", () => {
        updateCurrentTrialMeta();
        renderTrialSummaries();
        updateComparisonChart();
      });
    });

    els.setupChecklist.addEventListener("change", updateWorkflowState);

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
      plugins: {
        legend: { position: "bottom" },
        title: { display: false, text: title },
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
      return;
    }
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
    const trial = {
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
    };
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
  }

  function startMeasurement() {
    if (!state.source) {
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
    const rows = state.currentTrial?.samples.slice(-8).reverse() || [];
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
    const rows = state.currentTrial?.samples.slice(-120) || [];
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

  function openReportModal() {
    if (!totalSampleCount()) {
      alert("Er zijn nog geen meetgegevens om te rapporteren.");
      return;
    }
    els.reportModal.classList.remove("hidden");
    els.reportNames.focus();
  }

  function openCodeHelpModal() {
    els.codeHelpModal.classList.remove("hidden");
    els.btnCloseCodeHelp.focus();
  }

  function closeCodeHelpModal() {
    els.codeHelpModal.classList.add("hidden");
    els.btnCodeHelp.focus();
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
    const hasSource = Boolean(state.source);
    els.btnStart.disabled = !hasSource || state.isMeasuring;
    els.btnStop.disabled = !state.isMeasuring;
    els.btnReport.disabled = !totalSampleCount();
    els.btnExportCsv.disabled = !totalSampleCount();
  }

  function updateDiagnostics(summary, items = []) {
    els.diagnosticSummary.textContent = summary;
    els.diagnosticList.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function updateWorkflowState() {
    const setupInputs = [...els.setupChecklist.querySelectorAll('input[type="checkbox"]')];
    const completed = {
      prediction: Boolean(els.inputQuestion.value.trim() && els.inputHypothesis.value.trim()),
      setup: setupInputs.length > 0 && setupInputs.every((input) => input.checked),
      connect: Boolean(state.source),
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

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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
