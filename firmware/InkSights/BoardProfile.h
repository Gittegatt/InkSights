// Board profiles of InkSights: board ID, WiFi, SPI pins, default and allowed control pins.
// The PlatformIO environment selects exactly one board with a INKSIGHTS_BOARD_... macro. In the
// Arduino IDE the board is detected from the board selection; generic ESP32-S3 / ESP32-C3
// devkit selections are taken as the Super Mini.
//
// Pins are the board's pin numbers: D numbers on the XIAO SAMD21, GPIO numbers on the ESP32
// boards. The same table is in server/web/inksights-ui.js (pin choices on the settings
// page); change both together.
#pragma once

#if !defined(INKSIGHTS_BOARD_XIAO_SAMD21) && !defined(INKSIGHTS_BOARD_SEEED_XIAO_ESP32_C3) && \
    !defined(INKSIGHTS_BOARD_SEEED_XIAO_ESP32_S3) && !defined(INKSIGHTS_BOARD_ESP32_S3_SUPERMINI) && \
    !defined(INKSIGHTS_BOARD_ESP32_S3_ZERO) && !defined(INKSIGHTS_BOARD_ESP32_C3_SUPERMINI) && \
    !defined(INKSIGHTS_BOARD_ESP32_C3_ZERO) && !defined(INKSIGHTS_BOARD_ADAFRUIT_QTPY_ESP32_S3_N4R2) && \
    !defined(INKSIGHTS_BOARD_ADAFRUIT_QTPY_ESP32_S3_NOPSRAM)
  // Arduino IDE: guess from the selected board
  #if defined(ARDUINO_ARCH_SAMD)
    #define INKSIGHTS_BOARD_XIAO_SAMD21
  #elif defined(ARDUINO_XIAO_ESP32C3)
    #define INKSIGHTS_BOARD_SEEED_XIAO_ESP32_C3
  #elif defined(ARDUINO_XIAO_ESP32S3)
    #define INKSIGHTS_BOARD_SEEED_XIAO_ESP32_S3
  #elif defined(ARDUINO_ADAFRUIT_QTPY_ESP32S3_N4R2)
    #define INKSIGHTS_BOARD_ADAFRUIT_QTPY_ESP32_S3_N4R2
  #elif defined(ARDUINO_ADAFRUIT_QTPY_ESP32S3_NOPSRAM)
    #define INKSIGHTS_BOARD_ADAFRUIT_QTPY_ESP32_S3_NOPSRAM
  #elif defined(CONFIG_IDF_TARGET_ESP32S3)
    #define INKSIGHTS_BOARD_ESP32_S3_SUPERMINI
  #elif defined(CONFIG_IDF_TARGET_ESP32C3)
    #define INKSIGHTS_BOARD_ESP32_C3_SUPERMINI
  #else
    #error "Board not supported: see BoardProfile.h"
  #endif
#endif

#if defined(INKSIGHTS_BOARD_XIAO_SAMD21)
  #define BOARD_ID   "xiao-samd21"
  #define BOARD_NAME "Seeed XIAO SAMD21"
  #define HAS_WIFI   0
  const int8_t PIN_SCK = 8, PIN_MOSI = 10;                      // D8, D10
  const int8_t DEF_CS = 7, DEF_DC = 9, DEF_RST = 6, DEF_BUSY = 5;   // D7, D9, D6, D5
  const int8_t ALLOWED_PINS[] = { 0, 1, 2, 3, 4, 5, 6, 7, 9 };

#elif defined(INKSIGHTS_BOARD_SEEED_XIAO_ESP32_C3)
  #define BOARD_ID   "seeed-xiao-esp32-c3"
  #define BOARD_NAME "Seeed XIAO ESP32-C3"
  #define HAS_WIFI   1
  const int8_t PIN_SCK = 8, PIN_MOSI = 10;                        // D8, D10
  const int8_t DEF_CS = 20, DEF_DC = 9, DEF_RST = 21, DEF_BUSY = 7;   // D7, D9, D6, D5
  const int8_t ALLOWED_PINS[] = { 3, 4, 5, 6, 7, 9, 20, 21 };     // D1-D7, D9 (GPIO 2 and 8 are boot pins)

#elif defined(INKSIGHTS_BOARD_SEEED_XIAO_ESP32_S3)
  #define BOARD_ID   "seeed-xiao-esp32-s3"
  #define BOARD_NAME "Seeed XIAO ESP32-S3"
  #define HAS_WIFI   1
  const int8_t PIN_SCK = 7, PIN_MOSI = 9;                         // D8, D10
  const int8_t DEF_CS = 44, DEF_DC = 8, DEF_RST = 43, DEF_BUSY = 6;   // D7, D9, D6, D5
  const int8_t ALLOWED_PINS[] = { 1, 2, 4, 5, 6, 8, 43, 44 };     // D0, D1, D3-D7, D9 (GPIO 3 is a boot pin)

#elif defined(INKSIGHTS_BOARD_ESP32_S3_SUPERMINI)
  #define BOARD_ID   "esp32-s3-supermini"
  #define BOARD_NAME "ESP32-S3 Super Mini"
  #define HAS_WIFI   1
  const int8_t PIN_SCK = 12, PIN_MOSI = 11;
  const int8_t DEF_CS = 10, DEF_DC = 9, DEF_RST = 8, DEF_BUSY = 7;
  const int8_t ALLOWED_PINS[] = { 1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 21 };

#elif defined(INKSIGHTS_BOARD_ESP32_S3_ZERO)
  #define BOARD_ID   "esp32-s3-zero"
  #define BOARD_NAME "Waveshare ESP32-S3-Zero"
  #define HAS_WIFI   1
  const int8_t PIN_SCK = 12, PIN_MOSI = 11;
  const int8_t DEF_CS = 10, DEF_DC = 9, DEF_RST = 8, DEF_BUSY = 7;
  const int8_t ALLOWED_PINS[] = { 1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 43, 44 };   // GPIO 21: RGB LED

#elif defined(INKSIGHTS_BOARD_ESP32_C3_SUPERMINI)
  #define BOARD_ID   "esp32-c3-supermini"
  #define BOARD_NAME "ESP32-C3 Super Mini"
  #define HAS_WIFI   1
  const int8_t PIN_SCK = 4, PIN_MOSI = 6;
  const int8_t DEF_CS = 7, DEF_DC = 5, DEF_RST = 3, DEF_BUSY = 10;
  const int8_t ALLOWED_PINS[] = { 0, 1, 3, 5, 7, 10, 20, 21 };    // GPIO 2, 8, 9: boot pins

#elif defined(INKSIGHTS_BOARD_ESP32_C3_ZERO)
  #define BOARD_ID   "esp32-c3-zero"
  #define BOARD_NAME "Waveshare ESP32-C3-Zero"
  #define HAS_WIFI   1
  const int8_t PIN_SCK = 4, PIN_MOSI = 6;
  const int8_t DEF_CS = 7, DEF_DC = 5, DEF_RST = 3, DEF_BUSY = 1;
  const int8_t ALLOWED_PINS[] = { 0, 1, 3, 5, 7, 20, 21 };        // GPIO 10: RGB LED; 2, 8, 9: boot pins

#elif defined(INKSIGHTS_BOARD_ADAFRUIT_QTPY_ESP32_S3_N4R2) || defined(INKSIGHTS_BOARD_ADAFRUIT_QTPY_ESP32_S3_NOPSRAM)
  #if defined(INKSIGHTS_BOARD_ADAFRUIT_QTPY_ESP32_S3_N4R2)
    #define BOARD_ID   "adafruit-qtpy-esp32-s3-n4r2"
    #define BOARD_NAME "Adafruit QT Py ESP32-S3 N4R2"
  #else
    #define BOARD_ID   "adafruit-qtpy-esp32-s3-nopsram"
    #define BOARD_NAME "Adafruit QT Py ESP32-S3 No PSRAM"
  #endif
  #define HAS_WIFI   1
  const int8_t PIN_SCK = 36, PIN_MOSI = 35;                       // SCK, MO
  const int8_t DEF_CS = 9, DEF_DC = 8, DEF_RST = 18, DEF_BUSY = 17;   // A2, A3, A0, A1
  const int8_t ALLOWED_PINS[] = { 5, 6, 7, 8, 9, 16, 17, 18, 37, 40, 41, 42 };   // GPIO 38/39: NeoPixel
#endif

// Pin line on the start screen: D numbers on the SAMD21, GPIO numbers elsewhere
#if defined(INKSIGHTS_BOARD_XIAO_SAMD21)
  #define PIN_TITLE "Pins D"
#else
  #define PIN_TITLE "GPIO"
#endif
