#pragma once
#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <mbedtls/md.h>
#include <time.h>

// ============================================================
// Cliente HTTPS del protocolo de dispositivo (docs/device-protocol.md).
// El ESP32 SIEMPRE inicia las conexiones; el backend nunca nos llama.
// Autenticación: HMAC-SHA256 con secret POR DISPOSITIVO.
//   firma = hex( HMAC_SHA256(secret, "{deviceId}.{ts}.{METHOD}.{path}.{sha256(body)}") )
//   ts    = epoch en MILISEGUNDOS (requiere NTP sincronizado en setup()).
// ============================================================

// NTP mínimo: rechazamos requests hasta tener una hora creíble.
#define MIN_VALID_EPOCH_SECONDS 1700000000ULL

// Cadena de certificados raíz. Default: ISRG Root X1 (Let's Encrypt).
// IMPORTANTE: si el dominio queda detrás de Cloudflare, la cadena la firma
// Cloudflare y hay que pasar ESA raíz por build flag:
//   build_flags = -DTLS_ROOT_CA='"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"'
#ifndef TLS_ROOT_CA
static const char ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";
#else
static const char ROOT_CA[] PROGMEM = TLS_ROOT_CA;
#endif

struct ApiResult {
  int httpCode = 0;
  String body;
  bool ok() const { return httpCode >= 200 && httpCode < 300; }
};

class ApiClient {
 public:
  /**
   * baseUrl: SOLO host (sin "https://" ni barra final), ej. "dominio.com".
   * Si por error llega con esquema, se normaliza acá mismo.
   */
  void begin(const char* baseUrl, const char* deviceId, const char* secret) {
    host_ = String(baseUrl);
    host_.replace("https://", "");
    host_.replace("http://", "");
    host_.trim();
    while (host_.endsWith("/")) host_.remove(host_.length() - 1);
    deviceId_ = deviceId;
    secret_ = secret;
    client_.setCACert(ROOT_CA);
    client_.setTimeout(HTTP_TIMEOUT_MS);
  }

  bool timeValid() const { return (uint64_t)time(nullptr) >= MIN_VALID_EPOCH_SECONDS; }

  ApiResult get(const char* path) { return request("GET", path, ""); }
  ApiResult post(const char* path, const String& jsonBody) { return request("POST", path, jsonBody); }

 private:
  static String sha256Hex(const String& data) {
    uint8_t hash[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
    mbedtls_md_starts(&ctx);
    mbedtls_md_update(&ctx, (const unsigned char*)data.c_str(), data.length());
    mbedtls_md_finish(&ctx, hash);
    mbedtls_md_free(&ctx);
    String hex;
    for (int i = 0; i < 32; i++) {
      char buf[3];
      snprintf(buf, sizeof(buf), "%02x", hash[i]);
      hex += buf;
    }
    return hex;
  }

  static String hmacSha256Hex(const String& key, const String& payload) {
    uint8_t out[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
    mbedtls_md_hmac_update(&ctx, (const unsigned char*)payload.c_str(), payload.length());
    mbedtls_md_hmac_finish(&ctx, out);
    mbedtls_md_free(&ctx);
    String hex;
    for (int i = 0; i < 32; i++) {
      char buf[3];
      snprintf(buf, sizeof(buf), "%02x", out[i]);
      hex += buf;
    }
    return hex;
  }

  ApiResult request(const char* method, const char* path, const String& body) {
    ApiResult res;
    // Sin hora NTP válida NO emitimos requests: la firma HMAC viajaría con un
    // timestamp de uptime y el backend la rechazaría (ventana ±5 min sobre epoch ms).
    if (!timeValid()) {
      Serial.println("[api] hora NTP aún no válida; request descartado");
      return res;
    }
    if (!client_.connect(host_.c_str(), HIDRO_API_PORT)) {
      return res;  // httpCode 0 = sin conexión
    }

    // epoch en MILISEGUNDOS (lo que espera el backend)
    const String ts = String((uint64_t)time(nullptr) * 1000ULL);
    const String payload = String(deviceId_) + "." + ts + "." + String(method) + "." + String(path) + "." + sha256Hex(body);
    const String signature = hmacSha256Hex(secret_, payload);

    HTTPClient http;
    http.begin(client_, String("https://") + host_ + String(path));
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-id", deviceId_);
    http.addHeader("x-device-ts", ts);
    http.addHeader("x-device-sig", signature);
    http.setTimeout(HTTP_TIMEOUT_MS);

    if (String(method) == "GET") {
      res.httpCode = http.GET();
    } else {
      res.httpCode = http.POST(body);
    }
    res.body = http.getString();
    http.end();
    return res;
  }

  WiFiClientSecure client_;
  String host_;
  String deviceId_;
  String secret_;
};
