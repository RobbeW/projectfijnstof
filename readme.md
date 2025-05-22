# Interactieve Luchtkwaliteitsmeter

**Auteur:** Robbe Wulgaert · [aiindeklas.be](http://aiindeklas.be) / [robbewulgaert.be](http://robbewulgaert.be)
**© 2025 Robbe Wulgaert**

---

## 🎯 Doel

Deze webapplicatie stelt 15–16-jarige leerlingen in staat om:

* Fijnstof (PM1, PM2.5 en PM10) in realtime te meten met een HM330X-sensor op een Arduino.
* De Europese Air Quality Index (AQI) te berekenen.
* Metingen grafisch te visualiseren via een live chart.
* Een PDF-rapport te genereren met samenvatting en ruwe data.
* Met de ruwe data aan de slag te gaan in de les met Excel, Python ... en deze mee te nemen naar een postersessie. 

## 📋 Vereisten

1. **Hardware**

   * Arduino-compatibel board met USB-poort.
   * HM330X-fijnstofsensor module.

2. **Software & Browser**

   * Google Chrome (of Chromium) met [WebSerial API]
   * Internetverbinding

3. **Bibliotheken**

   * **Arduino**: Tomoto\_HM330X sensorbibliotheek (via Library Manager of ZIP-installatie)
   * **Frontend (via CDN)**:

     * [Tailwind CSS](https://tailwindcss.com)
     * [Smoothie Charts](https://smoothiecharts.org)
     * [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)

## 🚀 Installatie & Gebruik

### 1. Arduino-firmware

1. Open `LuchtkwaliteitMeter.ino` in de Arduino IDE.
2. Installeer de `Tomoto_HM330X`-bibliotheek via **Sketch → Include Library → Manage Libraries** of toevoeging van ZIP.
3. Sluit de HM330X-sensor aan volgens de makersdocumentatie.
4. Upload de sketch naar de Arduino.
5. Open de Seriële Monitor op 9600 baud om te controleren of de sensor meet en CSV-gegevens verstuurt.

### 2. Webapplicatie

1. Clone deze repository:

   ```bash
   git clone https://github.com/gebruikersnaam/luchtkwaliteitsmeter.git
   cd luchtkwaliteitsmeter
   ```
2. Open `index.html` in Google Chrome (lokale webserver of file:// werkt).
3. Klik op **Verbind met Arduino** en sta de website toegang tot de seriële poort toe.
4. Klik op **Begin meting** om live data te zien:

   * Grafiek updatet elke seconde, nieuwe datapunt om de 5 sec.
   * Kaartjes en debugbalk tonen actuele waarden.
5. Klik op **Stop meting** om de stream te pauzeren.
6. Klik op **Genereer rapport**, vul formulier in en download een PDF-rapport met samenvatting en ruwe data.

## 📂 Projectstructuur

```
├── index.html       # Hoofd-HTML-pagina
├── style.css        # Aangepaste CSS-variabelen en -regels
├── script.js        # Frontend-logica (WebSerial, chart, PDF)
├── LuchtkwaliteitMeter.ino  # Arduino-sketch
└── README.md        # Deze documentatie
```

## 🔧 Technische details

* **WebSerial**: Communicatie met Arduino via `navigator.serial`.
* **SmoothieChart**: Live streaming grafiek.
* **html2pdf.js**: HTML → canvas → PDF-export van rapporttemplate.
* **Modale interface**: Tailwind utility classes voor responsive modals en knoppen.

## Licentie & Copyright

```
© 2025 Robbe Wulgaert, aiindeklas.be / robbewulgaert.be
Alle rechten voorbehouden.
```

Niet-herdistribueren zonder schriftelijke toestemming van de auteur.
Bij gebruik in de eigen klas: naamsvermelding auteur en Sint-Lievenscollege. 
