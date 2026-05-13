# Project Fijnstof

Auteur: Robbe Wulgaert · AI in de Klas · robbewulgaert.be  
© 2026 Robbe Wulgaert. Alle rechten voorbehouden.

## Korte uitleg

Project Fijnstof is een meetopdracht met Arduino en een HM330X-sensor. Leerlingen meten PM1, PM2.5 en PM10, bekijken de Europese AQI en vergelijken meetreeksen op basis van echte data.

De website is de lesomgeving: voorspellen, opstelling controleren, verbinden, meten, vergelijken en rapporteren. Er is ook een demomodus, zodat je het lesverloop kunt tonen zonder sensor.

## Wat leerlingen doen

Leerlingen:

- formuleren een onderzoeksvraag en hypothese;
- kiezen een meetplek en mogelijke bron van fijnstof;
- controleren Arduino, sensor en firmware;
- verbinden de Arduino met de browser of starten de demomodus;
- verzamelen één of meerdere meetreeksen;
- vergelijken gemiddelde en maximale waarden;
- exporteren CSV-data voor verdere verwerking;
- maken een PDF-rapport met grafiek, samenvatting, besluit en reflectie.

## Wat leerlingen oefenen

De opdracht maakt deze leerinhouden concreet:

- fijnstof: PM1, PM2.5 en PM10;
- concentratie in `µg/m³`;
- Europese AQI als samenvattende score;
- seriële communicatie tussen Arduino en browser;
- meetduur en tijdstempels;
- grafieken lezen;
- ruwe data gebruiken voor een onderbouwd besluit.

## Lesverloop

1. Open `index.html` als startpagina.
2. Ga naar `platform.html`.
3. Upload `fijnstofsensor.ino` naar de Arduino.
4. Controleer de sensoropstelling.
5. Vul onderzoeksvraag, hypothese, meetplek en verwachte bron in.
6. Verbind de Arduino of start de demomodus.
7. Start een meetreeks.
8. Stop de meetreeks.
9. Maak eventueel een nieuwe meetreeks op een andere plek of in een andere situatie.
10. Vergelijk de meetreeksen.
11. Vul besluit en reflectie in.
12. Genereer het PDF-rapport of exporteer CSV.

## Benodigdheden

- Arduino-compatibel board;
- HM330X-fijnstofsensor;
- USB-kabel die data doorgeeft;
- Arduino IDE met de `Tomoto_HM330X`-bibliotheek;
- Chrome of Edge voor WebSerial.

## Seriële data

De nieuwe firmware stuurt data op 9600 baud:

```text
tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi
```

Meer detail staat in:

```text
docs/protocol.md
```

Oude firmware met alleen `PM1,PM2.5,PM10,AQI` blijft leesbaar, maar dan schat de webapp de meetduur. Voor klasgebruik is de nieuwe firmware beter.

De Arduino-code stuurt ook statusregels die beginnen met `#`. Die helpen bij foutzoeken, bijvoorbeeld wanneer de HM330X niet gevonden wordt of wanneer een meting niet leesbaar is. De webapp toont die regels als diagnose en gebruikt ze niet als meetdata.

## Bestandsstructuur

```text
Project Fijnstof/
|-- index.html                  landingspagina
|-- platform.html               meetplatform
|-- style.css                   vormgeving
|-- script.js                   WebSerial, demo, grafieken en rapportage
|-- landing.js                  mobiel menu op de landingspagina
|-- fijnstofsensor.ino          Arduino-code
|-- readme.md
|-- docs/
|   |-- protocol.md
|-- vendor/
|   |-- chart.umd.min.js
|   |-- jspdf.umd.min.js
|   |-- jspdf.plugin.autotable.min.js
```

## Privacy en opslag

De website gebruikt geen server en geen leerlingenaccounts. Meetgegevens blijven in de browser. Alleen wanneer een leerling zelf een CSV of PDF downloadt, wordt er een bestand op het toestel bewaard.

## Voor publicatie op GitHub Pages

Publiceer de repo-root via GitHub Pages. Controleer na publicatie:

- `index.html` opent als startpagina;
- `platform.html` laadt zonder ontbrekende bestanden;
- de bestanden in `vendor/` staan mee online;
- WebSerial werkt in Chrome of Edge;
- de demomodus start ook zonder Arduino.
