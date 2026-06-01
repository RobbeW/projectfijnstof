# Project Fijnstof

Auteur: Robbe Wulgaert · AI in de Klas · robbewulgaert.be  
© 2026 Robbe Wulgaert. Alle rechten voorbehouden.

## Korte uitleg

Project Fijnstof is een meetopdracht met Arduino en een HM330X-sensor. Leerlingen meten PM1, PM2.5 en PM10, bekijken de Europese AQI en vergelijken meetreeksen op basis van echte data.

De website is de lesomgeving: voorspellen, opstelling controleren, verbinden, meten, vergelijken en rapporteren. Er is ook een demomodus, zodat je het lesverloop kunt tonen zonder sensor. Met een optionele microSD-kaart en batterijpack kan dezelfde sensor ook zelfstandig op locatie loggen.

## Wat leerlingen doen

Leerlingen:

- formuleren een onderzoeksvraag en hypothese;
- kiezen een meetplek en mogelijke bron van fijnstof;
- controleren Arduino, sensor en firmware;
- verbinden de Arduino met de browser, starten de demomodus of uploaden een microSD-log;
- verzamelen één of meerdere meetreeksen;
- kunnen een veldmeting doen zonder laptop aan de sensor;
- spelen een geïmporteerde log opnieuw af in de grafiek;
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
6. Verbind de Arduino, start de demomodus of upload een CSV-log van de microSD-kaart.
7. Start een meetreeks.
8. Stop de meetreeks.
9. Maak eventueel een nieuwe meetreeks op een andere plek of in een andere situatie.
10. Vergelijk de meetreeksen.
11. Vul besluit en reflectie in.
12. Genereer het PDF-rapport of exporteer CSV.

## Lesverloop met microSD en batterij

1. Upload `fijnstofsensor.ino` naar de Arduino.
2. Plaats een FAT32-geformatteerde microSD-kaart in de module.
3. Sluit de sensor aan op een batterijpack.
4. Wacht minstens 10 seconden zodat de HM330X stabiel meet.
5. Laat de sensor 1 uur of langer op locatie liggen.
6. Haal de microSD-kaart uit de module.
7. Open `platform.html` en upload het bestand `LOG001.CSV`, `LOG002.CSV`, enzovoort.
8. Speel de meetreeks af, onderzoek pieken en maak het rapport.

## Benodigdheden

- Arduino-compatibel board;
- HM330X-fijnstofsensor;
- optionele microSD-module;
- microSD-kaart, bij voorkeur FAT32;
- batterijpack voor veldmetingen zonder laptop;
- USB-kabel die data doorgeeft;
- Arduino IDE met de `Tomoto_HM330X`-bibliotheek;
- Chrome of Edge voor WebSerial.

## Aansluitingen microSD

Voor een Arduino Uno/Nano gebruikt de firmware standaard `CS` op pin 10:

| microSD-module | Arduino Uno/Nano |
| --- | --- |
| `CS` | `10` |
| `MOSI` | `11` |
| `MISO` | `12` |
| `SCK` | `13` |
| `VCC` | `5V` of `3.3V`, volgens de module |
| `GND` | `GND` |

Controleer de specificaties van de microSD-module. Niet elke module heeft dezelfde spanningsregelaar of level shifting.

De firmware heeft een optionele `STATUS_LED_PIN`. Die staat standaard uit (`-1`), omdat de ingebouwde LED op veel Uno/Nano-borden pin 13 gebruikt en die pin tegelijk `SCK` is voor microSD. Gebruik alleen een externe status-LED op een vrije pin als je dat nodig hebt.

## Seriële data

De firmware stuurt data op 9600 baud en schrijft dezelfde regels naar microSD wanneer er een kaart beschikbaar is:

```text
tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi
```

Meer detail staat in:

```text
docs/protocol.md
```

Oude firmware of oude CSV-bestanden met alleen `PM1,PM2.5,PM10,AQI` blijven leesbaar, maar dan schat de webapp de meetduur. Voor klasgebruik is de nieuwe firmware beter.

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
|-- data/
|   |-- fake_fijnstof_1uur.csv  verzonnen testdata voor import en playback
|-- readme.md
|-- docs/
|   |-- protocol.md
|-- vendor/
|   |-- chart.umd.min.js
|   |-- jspdf.umd.min.js
|   |-- jspdf.plugin.autotable.min.js
```

## Privacy en opslag

De website gebruikt geen server en geen leerlingenaccounts. Het platform bewaart ingevulde antwoorden, meetreeksen en geïmporteerde microSD-logs automatisch in `localStorage` van dezelfde browser, zodat een verversing of gesloten tabblad niet meteen alle klasmetingen wist. Alleen wanneer een leerling zelf een CSV uploadt, CSV exporteert of PDF downloadt, wordt er een los lokaal bestand gelezen of bewaard.

## Testen zonder hardware

Gebruik `data/fake_fijnstof_1uur.csv` om de import en playback te testen. Dat bestand bevat plausibele maar verzonnen waarden met enkele pieken, zodat de grafiek en samenvatting gemakkelijk te controleren zijn. Upload dit bestand in `platform.html` via `Upload log-bestand`.

## Voor publicatie op GitHub Pages

Publiceer de repo-root via GitHub Pages. Controleer na publicatie:

- `index.html` opent als startpagina;
- `platform.html` laadt zonder ontbrekende bestanden;
- de bestanden in `vendor/` staan mee online;
- WebSerial werkt in Chrome of Edge;
- de demomodus start ook zonder Arduino;
- `data/fake_fijnstof_1uur.csv` kan worden geüpload in `platform.html`.
