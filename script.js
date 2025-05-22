// script.js

// Helper: splits incoming serial data by newline
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

// —— SmoothieChart Setup ——
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
smoothie.streamTo(document.getElementById('aqi-chart'), 1000);

// —— State & Data Storage ——
let port, reader, keepReading = false;
let startTime, endTime;
const measurementData = [];

// —— Arduino Connection ——
async function connectArduino() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    console.log('✅ Arduino verbonden');
  } catch (err) {
    console.error('❌ Verbindingsfout:', err);
    alert('Kon niet verbinden met de Arduino.');
  }
}

// —— Start & Stream Data ——
async function startReading() {
  if (!port) {
    alert('Verbind eerst met de Arduino.');
    return;
  }
  keepReading = true;
  startTime = new Date();
  const textDecoder = new TextDecoderStream();
  port.readable.pipeTo(textDecoder.writable);
  reader = textDecoder.readable
    .pipeThrough(new TransformStream(new LineBreakTransformer()))
    .getReader();
  while (keepReading) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value.trim()) continue;
    const parts = value.split(',').map(s => s.trim());
    if (parts.length !== 4 || parts.some(isNaN)) continue;
    const [pm1, pm25, pm10, aqi] = parts.map(Number);
    const now = Date.now();
    measurementData.push({ timestamp: now, pm1, pm25, pm10, aqi });
    // Update chart
    seriesPM1.append(now, pm1);
    seriesPM25.append(now, pm25);
    seriesPM10.append(now, pm10);
    seriesAQI.append(now, aqi);
    // Update UI cards & debug
    document.querySelector('[data-pm1]').textContent   = pm1.toFixed(1) + ' µg/m³';
    document.querySelector('[data-pm25]').textContent  = pm25.toFixed(1) + ' µg/m³';
    document.querySelector('[data-pm10]').textContent  = pm10.toFixed(1) + ' µg/m³';
    document.querySelector('[data-aqi]').textContent   = aqi;
    document.querySelector('.debug-bar').textContent =
      `PM1: ${pm1.toFixed(1)} | PM2.5: ${pm25.toFixed(1)} | PM10: ${pm10.toFixed(1)} | AQI: ${aqi}`;
  }
}

// —— Stop Streaming ——
function stopReading() {
  keepReading = false;
  endTime = new Date();
  if (reader) reader.cancel();
}

// —— Report Modal Logic ——
const modal    = document.getElementById('report-modal');
const form     = document.getElementById('report-form');
const template = document.getElementById('report-template');

document.getElementById('btn-report').addEventListener('click', () => {
  modal.classList.remove('hidden');
  modal.classList.add('flex');
});
document.getElementById('btn-cancel').addEventListener('click', () => {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
});

// —— Generate PDF Report ——
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!measurementData.length) {
    alert('Geen metingen beschikbaar voor het rapport.');
    return;
  }

  // Gather form input
  const names    = document.getElementById('input-names').value.trim();
  const question = document.getElementById('input-question').value.trim();
  const duration = Math.round(((endTime || new Date()) - (startTime || new Date())) / 60000);

  // Compute averages
  const avg = arr => (arr.reduce((sum, x) => sum + x, 0) / arr.length).toFixed(1);
  const pm1s  = measurementData.map(d => d.pm1);
  const pm25s = measurementData.map(d => d.pm25);
  const pm10s = measurementData.map(d => d.pm10);
  const aqis  = measurementData.map(d => d.aqi);

  // Populate template
  document.getElementById('r-date').textContent     = (startTime || new Date()).toLocaleDateString();
  document.getElementById('r-duration').textContent = duration;
  document.getElementById('r-names').textContent    = names;
  document.getElementById('r-question').textContent = question;
  document.getElementById('r-pm1').textContent      = avg(pm1s);
  document.getElementById('r-pm25').textContent     = avg(pm25s);
  document.getElementById('r-pm10').textContent     = avg(pm10s);
  document.getElementById('r-aqi').textContent      = avg(aqis);

  // Fill raw data rows
  const tbody = document.getElementById('r-body');
  tbody.innerHTML = '';
  measurementData.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border px-2 py-1">${new Date(d.timestamp).toLocaleTimeString()}</td>
      <td class="border px-2 py-1">${d.pm1.toFixed(1)}</td>
      <td class="border px-2 py-1">${d.pm25.toFixed(1)}</td>
      <td class="border px-2 py-1">${d.pm10.toFixed(1)}</td>
      <td class="border px-2 py-1">${d.aqi}</td>
    `;
    tbody.appendChild(tr);
  });

  // Make template visible for html2pdf
  template.classList.remove('hidden');

  // Generate PDF
  html2pdf()
    .from(template)
    .set({ margin: 10, filename: 'Luchtkwaliteitsrapport.pdf', html2canvas: { scale: 2 } })
    .save()
    .then(() => {
      // Hide template and modal again
      template.classList.add('hidden');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
});

// —— Button Event Bindings ——
document.getElementById('btn-connect').addEventListener('click', connectArduino);
document.getElementById('btn-start').addEventListener('click', startReading);
document.getElementById('btn-stop').addEventListener('click', stopReading);
