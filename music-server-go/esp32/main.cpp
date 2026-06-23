#include "Audio.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

#define WIFI_SSID "TTBH"
#define WIFI_PASS "motdenchin"

#define STREAM_URL "http://192.168.0.123:8080/stream/0002.mp3"

#define SERVER_IP "192.168.0.123"
#define SERVER_PORT 8080

#define I2S_LRC 4
#define I2S_BCLK 5
#define I2S_DOUT 6
#define BUTTON_PIN 0

#define MODE_HYBRID "hybrid"
#define MODE_TOUCH "touch"
#define MODE_WS "websocket"
#define MODE_TOUCH_PLAY "touch-play"

Audio audio;
WebSocketsClient webSocket;
bool wsConnected = false;
String deviceMode = MODE_HYBRID;

volatile bool is_playing = false;
bool button_is_pressing = false;
uint32_t button_press_start = 0;

#define TOUCH_PIN 2
bool touchActive = false;
unsigned long touchStartTime = 0;
const unsigned long TOUCH_HOLD_TIME = 1000;
bool touchPlayed = false;

uint32_t playback_end_time = 0;
const uint32_t COOLDOWN_TIME = 2000;

uint32_t last_touch_time = 0;
const uint32_t TOUCH_TIMEOUT = 3000;

void sendWSCmd(const char* type, const char* state, const char* file) {
	if (!wsConnected) return;
	StaticJsonDocument<196> doc;
	doc["type"] = type;
	doc["state"] = state;
	if (strlen(file) > 0) doc["file"] = file;
	doc["mode"] = deviceMode;
	String msg;
	serializeJson(doc, msg);
	webSocket.sendTXT(msg);
}

void startPlayback(const char* url) {
	if (is_playing) audio.stopSong();
	is_playing = true;
	button_is_pressing = false;
	touchPlayed = false;
	last_touch_time = millis();
	audio.connecttohost(url);
}

void stopPlayback() {
	if (!is_playing) return;
	audio.stopSong();
	is_playing = false;
	playback_end_time = millis();
	sendWSCmd("status", "stopped", "");
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
	switch (type) {
		case WStype_DISCONNECTED:
			Serial.println("[WS] Ngắt kết nối");
			wsConnected = false;
			break;

		case WStype_CONNECTED:
			Serial.printf("[WS] Đã kết nối: %s\n", payload);
			wsConnected = true;
			sendWSCmd("status", "connected", "");
			break;

		case WStype_TEXT: {
			String msg = String((char*)payload).substring(0, length);
			Serial.printf("[WS] Nhận: %s\n", msg.c_str());

			StaticJsonDocument<256> doc;
			DeserializationError err = deserializeJson(doc, msg);
			if (err) { Serial.println("[WS] Lỗi JSON"); break; }

			String typeVal = doc["type"] | "";
			String action = doc["action"] | "";
			String file = doc["file"] | "";
			String value = doc["value"] | "";

			if (typeVal == "cmd" && action == "mode" && value.length() > 0) {
				deviceMode = value;
				Serial.printf("[WS] Chuyển chế độ: %s\n", deviceMode.c_str());
				sendWSCmd("status", "mode", deviceMode.c_str());
				if (is_playing) stopPlayback();
			}
			else if (typeVal == "cmd" && action == "play" && file.length() > 0) {
				if (deviceMode == MODE_TOUCH || deviceMode == MODE_TOUCH_PLAY) {
					Serial.printf("[WS] Chế độ %s, bỏ qua lệnh play từ WebSocket\n", deviceMode.c_str());
					break;
				}
				String url = "http://" + String(SERVER_IP) + ":" + SERVER_PORT + "/stream/" + file;
				Serial.printf("[WS] Lệnh play: %s\n", url.c_str());
				startPlayback(url.c_str());
				sendWSCmd("status", "playing", file.c_str());
			}
			else if (typeVal == "cmd" && action == "stop") {
				if (deviceMode == MODE_TOUCH) {
					Serial.println("[WS] Đang ở chế độ TOUCH, bỏ qua lệnh từ WebSocket");
					break;
				}
				Serial.println("[WS] Lệnh stop");
				stopPlayback();
			}
			break;
		}
		case WStype_ERROR:
			Serial.println("[WS] Lỗi");
			break;
	}
}

void setup() {
	Serial.begin(115200);

	pinMode(BUTTON_PIN, INPUT_PULLUP);
	pinMode(TOUCH_PIN, INPUT);

	Serial.printf("\n[WiFi] Đang kết nối tới %s...", WIFI_SSID);
	WiFi.mode(WIFI_STA);
	WiFi.begin(WIFI_SSID, WIFI_PASS);
	while (WiFi.status() != WL_CONNECTED) {
		delay(500);
		Serial.print(".");
	}
	Serial.printf("\n[WiFi] Đã kết nối! IP: %s\n", WiFi.localIP().toString().c_str());

	audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
	audio.setVolume(21);

	webSocket.begin(SERVER_IP, SERVER_PORT, "/ws");
	webSocket.onEvent(webSocketEvent);
	webSocket.setReconnectInterval(3000);

	Serial.printf("[WS] Đang kết nối ws://%s:%d/ws\n", SERVER_IP, SERVER_PORT);
	Serial.printf("[System] Chế độ mặc định: %s\n", deviceMode.c_str());
}

void loop() {
	webSocket.loop();
	audio.loop();

	bool enableTouch = (deviceMode == MODE_HYBRID || deviceMode == MODE_TOUCH || deviceMode == MODE_TOUCH_PLAY);
	bool useAutoStop = (deviceMode == MODE_HYBRID || deviceMode == MODE_TOUCH);
	bool current_touch_state = enableTouch ? digitalRead(TOUCH_PIN) : LOW;

	if (is_playing) {
		if (useAutoStop) {
			if (current_touch_state == HIGH) {
				last_touch_time = millis();
			} else if (millis() - last_touch_time >= TOUCH_TIMEOUT) {
				Serial.println("\n[System] Không phát hiện chạm quá 3 giây -> DỪNG NHẠC!");
				stopPlayback();
			}
		}
		touchPlayed = false;
	} else if (millis() - playback_end_time < COOLDOWN_TIME) {
		touchPlayed = false;
	} else {
		if (enableTouch && millis() > 10000) {
			touchPlayed = current_touch_state;
		} else {
			touchPlayed = false;
		}
	}

	if (!is_playing && enableTouch) {
		if (digitalRead(BUTTON_PIN) == LOW || touchPlayed == HIGH) {
			if (!button_is_pressing) {
				button_is_pressing = true;
				button_press_start = millis();
				Serial.println("[Button/Touch] Đang nhấn giữ...");
			} else {
				if (millis() - button_press_start >= 1000) {
					Serial.println("[Button/Touch] Đã giữ đủ 1 giây -> Bắt đầu phát nhạc!");
					startPlayback(STREAM_URL);
				}
			}
		} else {
			if (button_is_pressing) {
				Serial.println("[Button/Touch] Đã thả (Chưa đủ 1 giây -> Hủy lệnh).");
				button_is_pressing = false;
			}
		}
	}
}

void audio_eof_mp3(const char *info) {
	Serial.print("[Audio] Phát xong file: ");
	Serial.println(info);
	is_playing = false;
	playback_end_time = millis();
	sendWSCmd("status", "stopped", "");
}

void audio_info(const char *info) {
	Serial.print("[Audio Info] ");
	Serial.println(info);
}

void audio_eof_stream(const char *info) {
	Serial.print("[Audio] Đã phát xong luồng stream: ");
	Serial.println(info);
	audio.stopSong();
	is_playing = false;
	playback_end_time = millis();
	sendWSCmd("status", "stopped", "");
}
