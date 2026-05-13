/*
  Project Fijnstof
  Copyright (c) 2026 Robbe Wulgaert

  Meet PM1, PM2.5 en PM10 met een HM330X-sensor.
  Stuurt CSV naar de browser:

  tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi
*/

#include <Tomoto_HM330X.h>

Tomoto_HM330X sensor;

const unsigned long SERIAL_INTERVAL_MS = 5000;
const unsigned long SENSOR_WARMUP_MS = 10000;
const unsigned long SENSOR_RETRY_MS = 2000;
const byte MAX_READ_FAILURES = 3;

unsigned long previousSerialMs = 0;
unsigned long previousRetryMs = 0;
unsigned long sensorReadySinceMs = 0;

bool sensorReady = false;
byte readFailures = 0;

void connectSensor(bool retry);
int calculateEuropeanAqi(uint16_t pm25, uint16_t pm10);

void setup() {
  Serial.begin(9600);
  delay(100);

  Serial.println(F("# Project Fijnstof 2026"));
  Serial.println(F("# CSV: tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi"));

  connectSensor(true);
}

void loop() {
  const unsigned long now = millis();

  if (!sensorReady) {
    if (now - previousRetryMs >= SENSOR_RETRY_MS) {
      connectSensor(false);
    }
    return;
  }

  if (now - sensorReadySinceMs < SENSOR_WARMUP_MS) {
    return;
  }

  if (now - previousSerialMs < SERIAL_INTERVAL_MS) {
    return;
  }
  previousSerialMs = now;

  if (!sensor.readSensor()) {
    readFailures++;
    Serial.print(F("# FOUT: HM330X meetwaarde niet leesbaar (poging "));
    Serial.print(readFailures);
    Serial.print(F("/"));
    Serial.print(MAX_READ_FAILURES);
    Serial.println(F(")."));

    if (readFailures >= MAX_READ_FAILURES) {
      sensorReady = false;
      previousRetryMs = now;
      Serial.println(F("# Sensorverbinding opnieuw zoeken."));
    }
    return;
  }

  readFailures = 0;

  const uint16_t pm1 = sensor.atm.getPM1();
  const uint16_t pm25 = sensor.atm.getPM2_5();
  const uint16_t pm10 = sensor.atm.getPM10();
  const int aqi = calculateEuropeanAqi(pm25, pm10);

  Serial.print(now);
  Serial.print(",");
  Serial.print(pm1);
  Serial.print(",");
  Serial.print(pm25);
  Serial.print(",");
  Serial.print(pm10);
  Serial.print(",");
  Serial.println(aqi);
}

void connectSensor(bool retry) {
  previousRetryMs = millis();
  Serial.println(F("# HM330X zoeken..."));

  if (sensor.begin(retry)) {
    sensorReady = true;
    sensorReadySinceMs = millis();
    readFailures = 0;
    Serial.println(F("# HM330X verbonden. Wacht 10 seconden zodat de sensor stabiel meet."));
  } else {
    sensorReady = false;
    Serial.println(F("# FOUT: HM330X niet gevonden. Controleer 5V, GND, SDA en SCL."));
  }
}

int calculateEuropeanAqi(uint16_t pm25, uint16_t pm10) {
  int pm25Index;
  if (pm25 <= 10) pm25Index = 1;
  else if (pm25 <= 20) pm25Index = 2;
  else if (pm25 <= 25) pm25Index = 3;
  else if (pm25 <= 50) pm25Index = 4;
  else if (pm25 <= 75) pm25Index = 5;
  else pm25Index = 6;

  int pm10Index;
  if (pm10 <= 20) pm10Index = 1;
  else if (pm10 <= 40) pm10Index = 2;
  else if (pm10 <= 50) pm10Index = 3;
  else if (pm10 <= 100) pm10Index = 4;
  else if (pm10 <= 150) pm10Index = 5;
  else pm10Index = 6;

  return max(pm25Index, pm10Index);
}
