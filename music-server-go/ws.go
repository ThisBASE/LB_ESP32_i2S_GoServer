package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSCommand struct {
	Type   string `json:"type"`
	Action string `json:"action,omitempty"`
	File   string `json:"file,omitempty"`
	State  string `json:"state,omitempty"`
	Value  string `json:"value,omitempty"`
}

type WSClient struct {
	conn *websocket.Conn
	ip   string
	mu   sync.Mutex
}

func (c *WSClient) SendJSON(v interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.WriteJSON(v)
}

func (c *WSClient) Close() {
	c.conn.Close()
}

type WSManager struct {
	mu             sync.Mutex
	clients        map[string]*WSClient
	onStatusChange func(ip, state, file string)
}

func NewWSManager() *WSManager {
	return &WSManager{
		clients: make(map[string]*WSClient),
	}
}

func (m *WSManager) Add(ip string, c *WSClient) {
	m.mu.Lock()
	old, exists := m.clients[ip]
	if exists {
		old.Close()
	}
	m.clients[ip] = c
	m.mu.Unlock()
	if m.onStatusChange != nil {
		m.onStatusChange(ip, "connected", "")
	}
}

func (m *WSManager) Remove(ip string) {
	m.mu.Lock()
	delete(m.clients, ip)
	m.mu.Unlock()
	if m.onStatusChange != nil {
		m.onStatusChange(ip, "disconnected", "")
	}
}

func (m *WSManager) SendCommand(ip, action, file string) error {
	m.mu.Lock()
	c, ok := m.clients[ip]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("client %s not connected", ip)
	}
	return c.SendJSON(WSCommand{Type: "cmd", Action: action, File: file})
}

func (m *WSManager) SendCommandWithValue(ip, action, value string) error {
	m.mu.Lock()
	c, ok := m.clients[ip]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("client %s not connected", ip)
	}
	return c.SendJSON(WSCommand{Type: "cmd", Action: action, Value: value})
}

func (m *WSManager) Broadcast(action, file string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	msg := WSCommand{Type: "cmd", Action: action, File: file}
	for _, c := range m.clients {
		c.SendJSON(msg)
	}
}

func (m *WSManager) GetIPs() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	ips := make([]string, 0, len(m.clients))
	for ip := range m.clients {
		ips = append(ips, ip)
	}
	return ips
}

func (m *WSManager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.clients)
}

func (a *App) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("[WS] Upgrade error: %v\n", err)
		return
	}

	ip := extractIP(r.RemoteAddr)
	fmt.Printf("[WS] Client connected: %s\n", ip)

	client := &WSClient{conn: conn, ip: ip}
	a.wsManager.Add(ip, client)

	defer func() {
		client.Close()
		a.wsManager.Remove(ip)
		fmt.Printf("[WS] Client disconnected: %s\n", ip)
	}()

	for {
		var msg map[string]interface{}
		err := conn.ReadJSON(&msg)
		if err != nil {
			break
		}

		typeVal, _ := msg["type"].(string)
		if typeVal != "status" {
			continue
		}
		state, _ := msg["state"].(string)
		fileVal, _ := msg["file"].(string)

		fmt.Printf("[WS] Status from %s: %s %s\n", ip, state, fileVal)

		if modeVal, ok := msg["mode"].(string); ok && modeVal != "" {
			a.deviceModes[ip] = modeVal
		}

		switch state {
		case "playing":
			a.tracker.SetPlaying(ip, fileVal)
		case "stopped":
			a.tracker.SetStopped(ip)
		}
		if a.wsManager.onStatusChange != nil {
			a.wsManager.onStatusChange(ip, state, fileVal)
		}
	}
}

// SendPlay sends a play command to a WebSocket client
func (a *App) SendPlay(ip, file string) string {
	err := a.wsManager.SendCommand(ip, "play", file)
	if err != nil {
		return err.Error()
	}
	return "ok"
}

// SendStop sends a stop command to a WebSocket client
func (a *App) SendStop(ip string) string {
	err := a.wsManager.SendCommand(ip, "stop", "")
	if err != nil {
		return err.Error()
	}
	return "ok"
}

// GetWSClientIPs returns list of connected WebSocket client IPs
func (a *App) GetWSClientIPs() []string {
	return a.wsManager.GetIPs()
}

// GetFileList returns the list of MP3 files (for frontend UI)
func (a *App) GetFileList() []fileInfo {
	entries, err := os.ReadDir(a.musicDir)
	if err != nil {
		return nil
	}
	var files []fileInfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".mp3") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, fileInfo{
			Name:   e.Name(),
			Size:   info.Size(),
			SizeKB: info.Size() / 1024,
		})
	}
	return files
}
