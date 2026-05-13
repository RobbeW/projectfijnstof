# Project Fijnstof - serieel protocol

Copyright (c) 2026 Robbe Wulgaert

Dit document beschrijft het protocol tussen de Arduino met HM330X-sensor en het webplatform.

## Verbinding

- Board: Arduino-compatibel board
- Sensor: HM330X-fijnstofsensor
- Baudrate: `9600`
- Formaat: CSV-regels, gescheiden door komma's
- Interval: ongeveer elke 5 seconden

WebSerial werkt in Chrome of Edge via `localhost`, `https://` of GitHub Pages.

## Arduino naar browser

De nieuwe firmware stuurt vijf velden:

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
```

## Betekenis

| Veld | Betekenis |
| --- | --- |
| `tijd_ms` | Tijd sinds start van de Arduino in milliseconden |
| `pm1_ug_m3` | PM1-concentratie in microgram per kubieke meter |
| `pm25_ug_m3` | PM2.5-concentratie in microgram per kubieke meter |
| `pm10_ug_m3` | PM10-concentratie in microgram per kubieke meter |
| `aqi` | Europese AQI-score van 1 tot 6 |

De webapp gebruikt `tijd_ms` om de meetduur per meetreeks te berekenen. Oude firmware die alleen `PM1,PM2.5,PM10,AQI` stuurt blijft leesbaar, maar de timing is dan een schatting.

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
