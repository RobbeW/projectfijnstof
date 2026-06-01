/*
  Project Fijnstof
  Copyright (c) 2026 Robbe Wulgaert

  Meet PM1, PM2.5 en PM10 met een HM330X-sensor.
  Stuurt CSV naar de browser en schrijft dezelfde regels optioneel naar microSD:

  tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi
*/

#include <SPI.h>
#include <SD.h>
#include <Tomoto_HM330X.h>

Tomoto_HM330X sensor;

const unsigned long SAMPLE_INTERVAL_MS = 5000;
const unsigned long SENSOR_WARMUP_MS = 10000;
const unsigned long SENSOR_RETRY_MS = 2000;
const unsigned long LED_BLINK_MS = 500;
const unsigned long LED_ERROR_BLINK_MS = 150;
const byte SD_CS_PIN = 10;
const byte MAX_READ_FAILURES = 3;
const int STATUS_LED_PIN = -1; // Zet op een vrije pin voor een externe status-LED. Gebruik geen pin 13 bij microSD op Uno/Nano.

File logFile;
char logFilename[13] = "";

unsigned long previousSampleMs = 0;
unsigned long previousRetryMs = 0;
unsigned long sensorReadySinceMs = 0;
unsigned long previousLedMs = 0;

bool sensorReady = false;
bool sdReady = false;
bool sdError = false;
bool ledState = false;
byte readFailures = 0;

void connectSensor(bool retry);
void setupStorage();
bool createLogFile();
void writeSample(unsigned long timestampMs, uint16_t pm1, uint16_t pm25, uint16_t pm10, int aqi);
bool printCsv(Print &output, unsigned long timestampMs, uint16_t pm1, uint16_t pm25, uint16_t pm10, int aqi);
void markSdError(const __FlashStringHelper *message);
void updateStatusLed(unsigned long now);
int calculateEuropeanAqi(uint16_t pm25, uint16_t pm10);

void setup() {
  if (STATUS_LED_PIN >= 0) pinMode(STATUS_LED_PIN, OUTPUT);
  Serial.begin(9600);
  delay(100);

  Serial.println(F("# Project Fijnstof 2026"));
  Serial.println(F("# CSV: tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi"));

  setupStorage();
  connectSensor(true);
}

void loop() {
  const unsigned long now = millis();
  updateStatusLed(now);

  if (!sensorReady) {
    if (now - previousRetryMs >= SENSOR_RETRY_MS) {
      connectSensor(false);
    }
    return;
  }

  if (now - sensorReadySinceMs < SENSOR_WARMUP_MS) {
    return;
  }

  if (now - previousSampleMs < SAMPLE_INTERVAL_MS) {
    return;
  }
  previousSampleMs = now;

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

  writeSample(now, pm1, pm25, pm10, aqi);
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

void setupStorage() {
  Serial.print(F("# microSD zoeken op CS-pin "));
  Serial.print(SD_CS_PIN);
  Serial.println(F("..."));

  if (!SD.begin(SD_CS_PIN)) {
    Serial.println(F("# microSD niet gevonden. De sensor blijft live CSV sturen via USB."));
    return;
  }

  if (!createLogFile()) {
    markSdError(F("# FOUT: geen vrij logbestand op microSD."));
    return;
  }

  logFile.println(F("tijd_ms,pm1_ug_m3,pm25_ug_m3,pm10_ug_m3,aqi"));
  logFile.flush();
  sdReady = true;

  Serial.print(F("# microSD klaar. Logbestand: "));
  Serial.println(logFilename);
}

bool createLogFile() {
  for (int index = 1; index <= 999; index++) {
    snprintf(logFilename, sizeof(logFilename), "LOG%03d.CSV", index);
    if (SD.exists(logFilename)) continue;

    logFile = SD.open(logFilename, FILE_WRITE);
    return logFile;
  }
  logFilename[0] = '\0';
  return false;
}

void writeSample(unsigned long timestampMs, uint16_t pm1, uint16_t pm25, uint16_t pm10, int aqi) {
  printCsv(Serial, timestampMs, pm1, pm25, pm10, aqi);

  if (!sdReady) return;

  if (!logFile) {
    markSdError(F("# FOUT: logbestand niet meer beschikbaar."));
    return;
  }

  if (!printCsv(logFile, timestampMs, pm1, pm25, pm10, aqi)) {
    markSdError(F("# FOUT: schrijven naar microSD mislukt."));
    return;
  }

  logFile.flush();
}

bool printCsv(Print &output, unsigned long timestampMs, uint16_t pm1, uint16_t pm25, uint16_t pm10, int aqi) {
  char line[48];
  snprintf(line, sizeof(line), "%lu,%u,%u,%u,%d\n", timestampMs, pm1, pm25, pm10, aqi);
  return output.print(line) == strlen(line);
}

void markSdError(const __FlashStringHelper *message) {
  sdReady = false;
  sdError = true;
  if (logFile) logFile.close();
  Serial.println(message);
  Serial.println(F("# De meting loopt verder via USB, maar wordt niet meer op microSD bewaard."));
}

void updateStatusLed(unsigned long now) {
  if (STATUS_LED_PIN < 0) return;

  unsigned long interval = sdError ? LED_ERROR_BLINK_MS : LED_BLINK_MS;

  if (sdReady && sensorReady && now - sensorReadySinceMs >= SENSOR_WARMUP_MS) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    return;
  }

  if (now - previousLedMs < interval) return;
  previousLedMs = now;
  ledState = !ledState;
  digitalWrite(STATUS_LED_PIN, ledState ? HIGH : LOW);
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
