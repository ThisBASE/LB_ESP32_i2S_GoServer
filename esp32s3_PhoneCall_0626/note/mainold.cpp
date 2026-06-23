#include "Audio.h" // Thư viện ESP32-audioI2S
#include <Arduino.h>
#include <WiFi.h>

// ================================================================
//  CONFIG
// ================================================================
#define WIFI_SSID "TTBH"
#define WIFI_PASS "motdenchin"

// Đổi IP này thành IP máy chủ Node.js của bạn và tên file mp3 tương ứng
#define STREAM_URL "http://192.168.0.100:8080/stream/0002.mp3"

#define I2S_LRC 4 // Chính là chân WS
#define I2S_BCLK 5
#define I2S_DOUT 6
// Phím bấm ở chân GPIO 0 (Thường là nút BOOT có sẵn trên mạch ESP32)
#define BUTTON_PIN 0

Audio audio;

// ================================================================
//  QUẢN LÝ TRẠNG THÁI (STATE MACHINE)
// ================================================================
volatile bool is_playing = false; // Cờ khóa hệ thống khi đang hát
bool button_is_pressing = false;  // Trạng thái đang giữ nút
uint32_t button_press_start = 0;  // Mốc thời gian bắt đầu nhấn

#define TOUCH_PIN 2
bool touchActive = false;
unsigned long touchStartTime = 0;
const unsigned long TOUCH_HOLD_TIME = 1000; // 1 giây giữ chạm
bool touchPlayed = false;
// ================================================================
//  SETUP & LOOP
// ================================================================
void setup() {
  Serial.begin(115200);

  // Cấu hình phím bấm (Sử dụng điện trở kéo lên, nhấn xuống là LOW)
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  // Khởi tạo chân cảm biến chạm
  pinMode(TOUCH_PIN, INPUT);
  // 1. Kết nối WiFi
  Serial.printf("\n[WiFi] Đang kết nối tới %s...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Đã kết nối! IP: %s\n", WiFi.localIP().toString().c_str());

  // 2. Cấu hình I2S
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(20);

  Serial.println("\n[System] Sẵn sàng! Hãy NHẤN GIỮ phím BOOT (Pin 0) trong 1 giây để phát nhạc.");
}

void loop() {
  // BẮT BUỘC: Hàm này duy trì việc tải luồng mạng và giải mã âm thanh
  audio.loop();

  // Chỉ quét nút nhấn nếu KHÔNG có nhạc đang phát
  if (!is_playing) {

    // Nút được nhấn (Mức LOW)
    if (digitalRead(BUTTON_PIN) == LOW || digitalRead(TOUCH_PIN) == HIGH) {
      if (!button_is_pressing) {
        // Mới bắt đầu nhấn -> Ghi nhận thời gian
        button_is_pressing = true;
        button_press_start = millis();
        Serial.println("[Button] Đang nhấn giữ...");
      } else {
        // Đang giữ nút -> Kiểm tra xem đã đủ 1000ms (1 giây) chưa
        if (millis() - button_press_start >= 1000) {
          Serial.println("[Button] Đã giữ đủ 1 giây -> Bắt đầu phát nhạc!");

          is_playing = true;          // Khóa không cho nhấn lại
          button_is_pressing = false; // Reset trạng thái nút

          audio.connecttohost(STREAM_URL); // Yêu cầu Server tải nhạc
        }
      }
    }
    // Nút được thả ra (Mức HIGH)
    else {
      if (button_is_pressing) {
        Serial.println("[Button] Đã thả nút (Chưa đủ 1 giây -> Hủy lệnh).");
        button_is_pressing = false; // Xóa trạng thái, bắt đầu tính lại từ đầu
      }
    }
  }
}

// ================================================================
//  HÀM CALLBACK TỰ ĐỘNG CỦA THƯ VIỆN AUDIO
// ================================================================

// Hàm này tự động chạy khi ESP32 nhận được cờ kết thúc file (End Of File) từ Server
void audio_eof_mp3(const char *info) {
  Serial.print("[Audio] Phát xong file: ");
  Serial.println(info);

  Serial.println("[System] Trở lại chu trình chờ nút nhấn.\n");

  // Mở khóa cờ, cho phép đọc nút nhấn lại từ đầu
  is_playing = false;
}

// (Tùy chọn) Bắt lỗi nếu link web bị chết hoặc rớt mạng giữa chừng
void audio_info(const char *info) {
  Serial.print("[Audio Info] ");
  Serial.println(info);
}
// ================================================================
// HÀM XỬ LÝ KHI KẾT THÚC LUỒNG MẠNG (WEB STREAM)
// ================================================================
void audio_eof_stream(const char *info) {
  Serial.print("[Audio] Đã phát xong luồng stream: ");
  Serial.println(info);

  // Ép đóng kết nối HTTP, dọn dẹp bộ đệm
  audio.stopSong();

  Serial.println("[System] Trở lại chu trình chờ nút nhấn.\n");

  // Mở khóa cờ, cho phép đọc nút nhấn lại từ đầu
  is_playing = false;
}