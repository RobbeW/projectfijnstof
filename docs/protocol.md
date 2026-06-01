# Project Fijnstof - serieel protocol

Copyright (c) 2026 Robbe Wulgaert

Dit document beschrijft het protocol tussen de Arduino met HM330X-sensor, het webplatform en een optionele microSD-kaart.

## Verbinding

- Board: Arduino-compatibel board
- Sensor: HM330X-fijnstofsensor
- Optionele opslag: microSD-module via SPI
- Baudrate: `9600`
- Formaat: CSV-regels, gescheiden door komma's
- Interval: ongeveer elke 5 seconden

WebSerial werkt in Chrome of Edge via `localhost`, `https://` of GitHub Pages.

## Meetmodi

Dezelfde firmware ondersteunt drie manieren van werken:

| Modus | Laptop nodig tijdens de meting? | microSD nodig? | Resultaat |
| --- | --- | --- | --- |
| Live dashboard | Ja | Nee | Data verschijnt live in `platform.html`. |
| Live dashboard + microSD | Ja | Ja | Data verschijnt live en wordt tegelijk op microSD bewaard. |
| Veldmeting met batterij | Nee | Ja | De sensor bewaart zelfstandig CSV-data op microSD. |

Als er geen microSD-kaart gevonden wordt, blijft de sensor gewoon live CSV via USB sturen. Als er wel een kaart gevonden wordt, maakt de firmware automatisch een uniek bestand zoals `LOG001.CSV`.

## Arduino naar browser en microSD

De firmware stuurt en bewaart vijf velden:

```text
tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi
```

Voorbeeld:

```text
15000,4,12,18,2
```

De Arduino mag ook statusregels sturen die beginnen met `#`. Die regels zijn bedoeld voor diagnose en tellen niet mee als meetdata.

```text
# HM330X verbonden. Wacht 10 seconden zodat de sensor stabiel meet.
# FOUT: HM330X niet gevonden. Controleer 5V, GND, SDA en SCL.
# microSD klaar. Logbestand: LOG001.CSV
```

De microSD-log mag ook commentaarregels bevatten die beginnen met `#`. Het platform negeert die regels bij import.

## Betekenis

| Veld | Betekenis |
| --- | --- |
| `tijd_ms` | Tijd sinds start van de Arduino in milliseconden |
| `pm1_ug_m3` | PM1-concentratie in microgram per kubieke meter |
| `pm25_ug_m3` | PM2.5-concentratie in microgram per kubieke meter |
| `pm10_ug_m3` | PM10-concentratie in microgram per kubieke meter |
| `aqi` | Europese AQI-score van 1 tot 6 |

De webapp gebruikt `tijd_ms` om de meetduur per meetreeks te berekenen. Oude firmware of oude bestanden die alleen `PM1,PM2.5,PM10,AQI` sturen blijven leesbaar, maar de timing is dan een schatting van 5 seconden per meetpunt.

## microSD-bestand

Een microSD-bestand gebruikt dezelfde CSV-structuur als de seriële data:

```csv
# Project Fijnstof 2026
tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi
15000,4,12,18,2
20000,5,13,20,2
```

Gebruik bij voorkeur FAT32 voor de microSD-kaart. De bestandsnaam wordt automatisch gekozen als `LOG001.CSV`, `LOG002.CSV`, enzovoort.

De optionele status-LED in de firmware staat standaard uit. Op veel Uno/Nano-borden deelt de ingebouwde LED pin 13 met `SCK`, waardoor die pin niet geschikt is als status-LED wanneer microSD via SPI gebruikt wordt.

## AQI

De Arduino berekent een eenvoudige Europese AQI op basis van PM2.5 en PM10. De hoogste van beide indices wordt doorgestuurd.

| AQI | Label |
| --- | --- |
| `1` | Zeer goed |
| `2` | Goed |
| `3` | Matig |
| `4` | Slecht |
| `5` | Zeer slecht |
| `6` | Extreem slecht |

## Browser naar Arduino

De huidige webapp stuurt geen commando's naar de Arduino. De communicatie loopt alleen van Arduino naar browser.

## Testbestand

Voor testen zonder sensor staat er een fake microSD-log in:

```text
data/fake_fijnstof_1uur.csv
```

Dat bestand bevat plausibele maar verzonnen meetdata voor ongeveer 1 uur. In `platform.html` kan je het uploaden via `Upload log-bestand`.
