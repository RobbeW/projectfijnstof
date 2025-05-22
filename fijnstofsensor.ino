/* 
  LuchtkwaliteitMeter.ino
  © 2025 Robbe Wulgaert, aiindeklas.be / robbewulgaert.be
  Meet fijnstof (PM1, PM2.5, PM10) met een HM330X-sensor
  en berekent de Europese AQI-index. Stuurt CSV over de seriële poort.
*/

// Zorg dat je de Tomoto_HM330X-bibliotheek hebt geïnstalleerd:
// Sketch → Include Library → Manage Libraries… → zoek “Tomoto HM330X” → Install

#include <Tomoto_HM330X.h>
Tomoto_HM330X sensor;  /*De sensor initialiseren*/

void setup() {
  Serial.begin(9600);  /*Regelt de communicatie met de PC*/
  delay(100);          /*Wacht 0.1 seconde*/
  sensor.begin();      /*Start de sensor*/
}

void loop() {
  float pm1, pm2_5, pm10;
  int index_aqi;

  sensor.readSensor();

  pm1 = sensor.atm.getPM1();
  pm2_5 = sensor.atm.getPM2_5();
  pm10 = sensor.atm.getPM10();

  // Europese AQI-bepaling op basis van PM2.5
  if (pm2_5 <= 10) index_aqi = 1;
  else if (pm2_5 <= 20) index_aqi = 2;
  else if (pm2_5 <= 25) index_aqi = 3;
  else if (pm2_5 <= 50) index_aqi = 4;
  else if (pm2_5 <= 75) index_aqi = 5;
  else index_aqi = 6;

  // Europese AQI-bepaling op basis van PM10
  int index_pm10;
  if (pm10 <= 20) index_pm10 = 1;
  else if (pm10 <= 40) index_pm10 = 2;
  else if (pm10 <= 50) index_pm10 = 3;
  else if (pm10 <= 100) index_pm10 = 4;
  else if (pm10 <= 150) index_pm10 = 5;
  else index_pm10 = 6;

  // De hoogste van beide indices wordt gekozen
  if (index_pm10 > index_aqi) index_aqi = index_pm10;

  // Print de waarden in CSV-formaat
  Serial.print(pm1);
  Serial.print(",");
  Serial.print(pm2_5);
  Serial.print(",");
  Serial.print(pm10);
  Serial.print(",");
  Serial.println(index_aqi);

  delay(5000);         /*Wacht 5 seconden*/
}

/* 
  LuchtkwaliteitMeter.ino
  © 2025 Robbe Wulgaert, aiindeklas.be / robbewulgaert.be
  Meet fijnstof (PM1, PM2.5, PM10) met een HM330X-sensor
  en berekent de Europese AQI-index. Stuurt CSV over de seriële poort.
*/