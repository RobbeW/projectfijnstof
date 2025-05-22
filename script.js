/*
  script.js
  © 2025 Robbe Wulgaert · aiindeklas.be / robbewulgaert.be
  Interactieve Luchtkwaliteitsmeter: WebSerial data streaming, live chart en PDF-rapport met jsPDF
*/

// —— LineBreakTransformer: splitst serial data op nieuwe regels ——
class LineBreakTransformer {
  constructor() { this.chunks = ''; }
  transform(chunk, controller) {
    this.chunks += chunk;
    const lines = this.chunks.split('\n');
    this.chunks = lines.pop();
    lines.forEach(line => controller.enqueue(line));
  }
  flush(controller) { controller.enqueue(this.chunks); }
}

// Globale state
let port, reader;
let keepReading = false;
let startTime, endTime;
const measurementData = [];

// DOMContentLoaded: init everything
window.addEventListener('DOMContentLoaded', () => {
  // Canvas-element
  const canvas = document.getElementById('aqi-chart');

  // ===== SmoothieChart Setup =====
  const smoothie = new SmoothieChart({
    millisPerPixel: 50,
    interpolation: 'linear',
    grid: { fillStyle: '#fff', strokeStyle: '#e0e0e0' }
  });
  const seriesPM1  = new TimeSeries();
  const seriesPM25 = new TimeSeries();
  const seriesPM10 = new TimeSeries();
  const seriesAQI  = new TimeSeries();

  smoothie.addTimeSeries(seriesPM1,  { strokeStyle: 'blue',   lineWidth: 2 });
  smoothie.addTimeSeries(seriesPM25, { strokeStyle: 'red',    lineWidth: 2 });
  smoothie.addTimeSeries(seriesPM10, { strokeStyle: 'green',  lineWidth: 2 });
  smoothie.addTimeSeries(seriesAQI,  { strokeStyle: 'purple', lineWidth: 4 });
  smoothie.streamTo(canvas, 1000);

  // UI elements
  const btnConnect = document.getElementById('btn-connect');
  const btnStart   = document.getElementById('btn-start');
  const btnStop    = document.getElementById('btn-stop');
  const btnReport  = document.getElementById('btn-report');
  const debugBar   = document.getElementById('debug-bar');
  const modal      = document.getElementById('report-modal');
  const form       = document.getElementById('report-form');

  // —— Arduino Connection ——
  async function connectArduino() {
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      console.log('✅ Arduino verbonden');
      btnConnect.classList.add('opacity-50');
      btnConnect.disabled = true;
    } catch (err) {
      console.error('❌ Verbindingsfout:', err);
      alert('Kon niet verbinden met de Arduino.');
    }
  }

  // —— Start Data Stream ——
  async function startReading() {
    if (!port) { alert('Verbind eerst met de Arduino.'); return; }
    if (keepReading) { console.warn('Metingen lopen al.'); return; }

    keepReading = true;
    startTime = new Date();
    btnStart.disabled = true; btnStart.classList.add('opacity-50');
    btnStop.disabled  = false; btnStop.classList.remove('opacity-50');

    reader = port.readable
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TransformStream(new LineBreakTransformer()))
      .getReader();

    while (keepReading) {
      try {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value.trim()) continue;

        const parts = value.split(',').map(s => s.trim());
        if (parts.length !== 4 || parts.some(isNaN)) continue;

        const [pm1, pm25, pm10, aqi] = parts.map(Number);
        const now = Date.now();
        measurementData.push({ timestamp: now, pm1, pm25, pm10, aqi });

        seriesPM1.append(now, pm1);
        seriesPM25.append(now, pm25);
        seriesPM10.append(now, pm10);
        seriesAQI.append(now, aqi);

        updateUI(pm1, pm25, pm10, aqi);
      } catch (err) {
        console.error('Fout tijdens leeslus:', err);
        break;
      }
    }
  }

  // —— Stop Data Stream ——
  function stopReading() {
    keepReading = false;
    endTime = new Date();
    if (reader) reader.cancel();
    btnStart.disabled = false; btnStart.classList.remove('opacity-50');
    btnStop.disabled  = true;  btnStop.classList.add('opacity-50');
    console.log('🛑 Metingen gestopt');
  }

  // —— UI Update Functie ——
function updateUI(pm1, pm25, pm10, aqi) {
    const elPM1    = document.querySelector('[data-pm1]');
    const elPM25   = document.querySelector('[data-pm25]');
    const elPM10   = document.querySelector('[data-pm10]');
    const elAQI    = document.querySelector('[data-aqi]');
    const debugBar = document.getElementById('debug-bar');

    if (elPM1)    elPM1.textContent  = pm1 .toFixed(1) + ' µg/m³';
    if (elPM25)   elPM25.textContent = pm25.toFixed(1) + ' µg/m³';
    if (elPM10)   elPM10.textContent = pm10.toFixed(1) + ' µg/m³';
    if (elAQI)    elAQI.textContent  = aqi;
    if (debugBar) {
        debugBar.textContent = 
            `PM1: ${pm1.toFixed(1)} | PM2.5: ${pm25.toFixed(1)} | PM10: ${pm10.toFixed(1)} | AQI: ${aqi}`;
    }
}

  // —— Modal Logic ——
  btnReport.addEventListener('click', () => { modal.classList.remove('hidden'); modal.classList.add('flex'); });
  document.getElementById('btn-cancel').addEventListener('click', () => { modal.classList.add('hidden'); modal.classList.remove('flex'); });

  // —— PDF Generatie met jsPDF & autoTable ——
  function generatePdfReport(e) {
    e.preventDefault();
    if (!measurementData.length) { alert('Geen metingen voor rapport.'); return; }
    if (!window.jspdf?.jsPDF) { alert('jsPDF niet geladen.'); return; }

    const names    = document.getElementById('input-names').value.trim();
    const question = document.getElementById('input-question').value.trim();
    const duration = Math.round(((endTime || new Date()) - (startTime || new Date()))/60000);

    const avg = arr => (arr.reduce((s,x)=>s+x,0)/arr.length).toFixed(1);
    const pm1s  = measurementData.map(d=>d.pm1);
    const pm25s = measurementData.map(d=>d.pm25);
    const pm10s = measurementData.map(d=>d.pm10);
    const aqis  = measurementData.map(d=>d.aqi);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text('Rapport Luchtkwaliteit',14,20);
    doc.setFontSize(12);
// Voor de PDF-generatie, vervang de datumregel:
doc.setFontSize(12);
// Vervang deze regel:
// doc.text(`Datum: ${(startTime||new Date()).toLocaleDateString()}`,14,30);
// door:

// Datum in DD/MM/YYYY
const formatDate = date => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};
const formattedDate = formatDate(startTime || new Date());
doc.text(`Datum: ${formattedDate}`, 14, 30);

// En zorg dat de volgende regels ongewijzigd volgen:
doc.text(`Duur (min): ${duration}`, 14, 36);
doc.text(`Studenten: ${names}`, 14, 42);
doc.text(`Onderzoeksvraag: ${question}`, 14, 48);

    doc.text('Gemiddelden:',14,60);
    doc.text(`• PM1: ${avg(pm1s)} µg/m³`,18,66);
    doc.text(`• PM2.5: ${avg(pm25s)} µg/m³`,18,72);
    doc.text(`• PM10: ${avg(pm10s)} µg/m³`,18,78);
    doc.text(`• AQI: ${avg(aqis)}`,18,84);
    doc.addPage();
    doc.text('Ruwe meetdata',14,20);
    doc.autoTable({ startY:26, head:[['Tijd','PM1','PM2.5','PM10','AQI']], body: measurementData.map(d=>[
      new Date(d.timestamp).toLocaleTimeString(), d.pm1.toFixed(1), d.pm25.toFixed(1), d.pm10.toFixed(1), d.aqi.toString()
    ]), styles:{fontSize:10} });
    doc.save('Luchtkwaliteitsrapport.pdf');
    modal.classList.add('hidden');
  }

  // —— Bind Events ——
  btnConnect.addEventListener('click', connectArduino);
  btnStart.addEventListener('click', startReading);
  btnStop.addEventListener('click', stopReading);
  form.addEventListener('submit', generatePdfReport);
});
