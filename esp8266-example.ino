/*
  ESP8266 — exemplo de envio de temperatura
  Biblioteca: ESP8266WiFi + ESP8266HTTPClient

  Ajuste WIFI_SSID, WIFI_PASS e API_URL.
  O sensor pode ser um MAX6675/MAX31855, PT100 com módulo,
  ou outro sensor compatível. A função readTemperature() abaixo
  está simulada para facilitar o primeiro teste.
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

const char* WIFI_SSID = "SUA_REDE";
const char* WIFI_PASS = "SUA_SENHA";
const char* API_URL = "https://script.google.com/macros/s/SEU_ID/exec";

float readTemperature() {
  // TODO: substituir pela leitura real do seu sensor.
  return 850.0 + random(-20, 21);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); // somente para protótipo; em produção use certificado.

    HTTPClient http;
    http.begin(client, API_URL);
    http.addHeader("Content-Type", "application/json");

    float temperatura = readTemperature();

    String payload =
      String("{\"id\":\"forno1\",\"nome\":\"Forno 1\",\"temperatura\":") +
      String(temperatura, 1) +
      String(",\"meta\":1300,\"status\":\"Em operação\",\"dispositivo\":\"esp8266-01\"}");

    int code = http.POST(payload);
    Serial.printf("HTTP %d\n", code);
    http.end();
  }

  delay(10000);
}
