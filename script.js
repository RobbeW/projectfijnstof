/*
  script.js
  © 2025 Robbe Wulgaert · aiindeklas.be / robbewulgaert.be
  Interactieve Luchtkwaliteitsmeter: WebSerial data streaming, live chart en PDF-rapport met jsPDF
*/

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

window.addEventListener('DOMContentLoaded', () => {
  // Canvas & Chart
  const canvas    = document.getElementById('aqi-chart');
  const smoothie  = new SmoothieChart({
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

  // UI Elements
  const btnConnect = document.getElementById('btn-connect');
  const btnStart   = document.getElementById('btn-start');
  const btnStop    = document.getElementById('btn-stop');
  const btnReport  = document.getElementById('btn-report');
  const form       = document.getElementById('report-form');
  const modal      = document.getElementById('report-modal');

  // State
  let port, reader;
  let keepReading = false;
  let startTime, endTime;
  const measurementData = [];

  // Helpers
  function updateUI(pm1, pm25, pm10, aqi) {
    document.querySelector('[data-pm1]').textContent  = pm1 .toFixed(1) + ' µg/m³';
    document.querySelector('[data-pm25]').textContent = pm25.toFixed(1) + ' µg/m³';
    document.querySelector('[data-pm10]').textContent = pm10.toFixed(1) + ' µg/m³';
    document.querySelector('[data-aqi]').textContent  = aqi;
  }
  function formatDate(d) {
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  // Arduino connect
  btnConnect.addEventListener('click', async () => {
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      btnConnect.disabled = true;
      btnConnect.classList.add('opacity-50');
    } catch (e) {
      alert('Kon niet verbinden: ' + e);
    }
  });

  // Start meting
  btnStart.addEventListener('click', async () => {
    if (!port) { alert('Verbind eerst met Arduino!'); return; }
    if (keepReading) return;
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
        const parts = value.split(',').map(s => parseFloat(s));
        if (parts.length !== 4 || parts.some(isNaN)) continue;
        const [pm1, pm25, pm10, aqi] = parts;
        const now = Date.now();
        measurementData.push({ timestamp: now, pm1, pm25, pm10, aqi });
        seriesPM1.append(now, pm1);
        seriesPM25.append(now, pm25);
        seriesPM10.append(now, pm10);
        seriesAQI.append(now, aqi);
        updateUI(pm1, pm25, pm10, aqi);
      } catch (e) {
        console.error(e);
        break;
      }
    }
  });

  // Stop meting
  btnStop.addEventListener('click', () => {
    keepReading = false;
    endTime = new Date();
    if (reader) reader.cancel();
    btnStop.disabled  = true;  btnStop.classList.add('opacity-50');
    btnStart.disabled = false; btnStart.classList.remove('opacity-50');
  });

  // Genereer PDF
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!measurementData.length) { alert('Geen data!'); return; }
    const names    = document.getElementById('input-names').value.trim();
    const question = document.getElementById('input-question').value.trim();
    const duration = Math.round((endTime - startTime)/60000);

    const avg = arr => (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1);
    const pm1s  = measurementData.map(d=>d.pm1);
    const pm25s = measurementData.map(d=>d.pm25);
    const pm10s = measurementData.map(d=>d.pm10);
    const aqis  = measurementData.map(d=>d.aqi);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text('Rapport Luchtkwaliteit', 14, 20);

    // Datum/DD-MM-YYYY en gewone tekst
    doc.setFontSize(12);
    doc.text(`Datum: ${formatDate(startTime)}`, 14, 30);
    doc.text(`Duur (min): ${duration}`, 14, 38);
    doc.text(`Studenten: ${names}`, 14, 46);

    // Vraag
    doc.text('Onderzoeksvraag:', 14, 58);
    const vraagLines = doc.splitTextToSize(question, 180);
    doc.text(vraagLines, 14, 64);

    // Gemiddelden
    let y = 64 + vraagLines.length * 7 + 12;
    doc.text('Gemiddelden:', 14, y);
    y += 12;
    [ `• PM1: ${avg(pm1s)} µg/m³`,
      `• PM2.5: ${avg(pm25s)} µg/m³`,
      `• PM10: ${avg(pm10s)} µg/m³`,
      `• AQI: ${avg(aqis)}`
    ].forEach(line => {
      doc.text(line, 18, y);
      y += 12;
    });

    // Ruwe data
    doc.addPage();
    doc.text('Ruwe meetdata', 14, 20);
    doc.autoTable({
      startY: 26,
      head: [['Tijd','PM1','PM2.5','PM10','AQI']],
      body: measurementData.map(d => [
        new Date(d.timestamp).toLocaleTimeString(),
        d.pm1.toFixed(1),
        d.pm25.toFixed(1),
        d.pm10.toFixed(1),
        d.aqi.toString()
      ]),
      styles: { fontSize: 10 }
    });

    doc.save('Luchtkwaliteitsrapport.pdf');
    modal.classList.add('hidden');
  });

  // Modal show/hide
  btnReport.addEventListener('click', () => modal.classList.replace('hidden','flex'));
  document.getElementById('btn-cancel').addEventListener('click', () => modal.classList.replace('flex','hidden'));
});
