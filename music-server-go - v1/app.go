package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const httpPort = ":8080"

type ClientState string

const (
	StateConnected ClientState = "connected"
	StatePlaying   ClientState = "playing"
	StateStopped   ClientState = "stopped"
)

type ClientInfo struct {
	IP        string      `json:"ip"`
	State     ClientState `json:"state"`
	File      string      `json:"file,omitempty"`
	StartTime string      `json:"startTime"`
	LastSeen  string      `json:"lastSeen"`
}

type fileInfo struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SizeKB int64  `json:"sizeKB"`
}

type listResponse struct {
	Count int        `json:"count"`
	Files []fileInfo `json:"files"`
}

type ClientTracker struct {
	mu      sync.RWMutex
	clients map[string]*ClientInfo
	eventFn func(string, ...interface{})
}

func NewClientTracker(eventFn func(string, ...interface{})) *ClientTracker {
	return &ClientTracker{
		clients: make(map[string]*ClientInfo),
		eventFn: eventFn,
	}
}

func extractIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

func (ct *ClientTracker) SetConnected(ip string) {
	ct.mu.Lock()
	info, exists := ct.clients[ip]
	if !exists {
		info = &ClientInfo{IP: ip}
		ct.clients[ip] = info
	}
	info.State = StateConnected
	info.StartTime = nowRFC()
	info.LastSeen = nowRFC()
	info.File = ""
	ct.mu.Unlock()
	ct.emitUpdate(ip)
}

func (ct *ClientTracker) SetPlaying(ip, file string) {
	ct.mu.Lock()
	info, exists := ct.clients[ip]
	if !exists {
		info = &ClientInfo{IP: ip}
		ct.clients[ip] = info
	}
	info.State = StatePlaying
	info.File = file
	info.StartTime = nowRFC()
	info.LastSeen = nowRFC()
	ct.mu.Unlock()
	ct.emitUpdate(ip)
}

func (ct *ClientTracker) SetStopped(ip string) {
	ct.mu.Lock()
	info, exists := ct.clients[ip]
	if !exists {
		ct.mu.Unlock()
		return
	}
	info.State = StateStopped
	info.LastSeen = nowRFC()
	ct.mu.Unlock()
	ct.emitUpdate(ip)
}

func nowRFC() string {
	return time.Now().Format(time.RFC3339)
}

func (ct *ClientTracker) emitUpdate(ip string) {
	ct.mu.RLock()
	info := ct.clients[ip]
	ct.mu.RUnlock()
	if ct.eventFn != nil && info != nil {
		ct.eventFn("client-update", info)
	}
}

func (ct *ClientTracker) GetAll() []ClientInfo {
	ct.mu.RLock()
	defer ct.mu.RUnlock()
	result := make([]ClientInfo, 0, len(ct.clients))
	for _, info := range ct.clients {
		result = append(result, *info)
	}
	return result
}

type App struct {
	ctx     context.Context
	tracker *ClientTracker
	server  *http.Server
	musicDir string
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.tracker = NewClientTracker(func(event string, data ...interface{}) {
		runtime.EventsEmit(ctx, event, data...)
	})
	a.initMusicDir()
	a.startHTTPServer()
}

func (a *App) shutdown(ctx context.Context) {
	if a.server != nil {
		a.server.Shutdown(ctx)
	}
}

func (a *App) initMusicDir() {
	exe, err := os.Executable()
	if err == nil {
		a.musicDir = filepath.Join(filepath.Dir(exe), "music")
	} else {
		a.musicDir = filepath.Join(".", "music")
	}
	if _, err := os.Stat(a.musicDir); os.IsNotExist(err) {
		os.MkdirAll(a.musicDir, 0755)
	}
}

func (a *App) startHTTPServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/list", a.handleList)
	mux.HandleFunc("/stream/", a.handleStream)

	a.server = &http.Server{
		Addr:    httpPort,
		Handler: mux,
	}

	go func() {
		fmt.Printf("[Music Server] Listening on %s\n", httpPort)
		fmt.Printf("[Music Server] Music dir: %s\n", a.musicDir)
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("[Music Server] Error: %v\n", err)
		}
	}()
}

func (a *App) handleList(w http.ResponseWriter, r *http.Request) {
	clientIP := extractIP(r.RemoteAddr)
	a.tracker.SetConnected(clientIP)

	entries, err := os.ReadDir(a.musicDir)
	if err != nil {
		http.Error(w, `{"error":"Lỗi đọc thư mục"}`, http.StatusInternalServerError)
		return
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(listResponse{Count: len(files), Files: files})
}

func (a *App) handleStream(w http.ResponseWriter, r *http.Request) {
	clientIP := extractIP(r.RemoteAddr)
	filename := strings.TrimPrefix(r.URL.Path, "/stream/")

	if filename == "" || strings.Contains(filename, "..") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	filePath := filepath.Join(a.musicDir, filepath.Clean(filename))

	absMusic, _ := filepath.Abs(a.musicDir)
	absFile, _ := filepath.Abs(filePath)
	if !strings.HasPrefix(absFile, absMusic) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	fmt.Printf("[Stream] %s requested: %s\n", clientIP, filename)
	a.tracker.SetPlaying(clientIP, filename)

	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeFile(w, r, filePath)

	fmt.Printf("[Stream] %s done: %s\n", clientIP, filename)
	a.tracker.SetStopped(clientIP)
}

func (a *App) GetClients() []ClientInfo {
	if a.tracker == nil {
		return nil
	}
	return a.tracker.GetAll()
}

func (a *App) GetMusicDir() string {
	return a.musicDir
}

func (a *App) GetPort() string {
	return httpPort
}

func (a *App) GetLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		fmt.Println("[GetLocalIP] Error:", err)
		return "127.0.0.1"
	}
	fmt.Printf("[GetLocalIP] Found %d addresses\n", len(addrs))
	var privateIP, fallback string
	for _, addr := range addrs {
		ipnet, ok := addr.(*net.IPNet)
		if !ok {
			continue
		}
		ipv4 := ipnet.IP.To4()
		if ipv4 == nil || ipv4.IsLoopback() {
			continue
		}
		s := ipv4.String()
		fmt.Printf("[GetLocalIP]  candidate: %s\n", s)
		if fallback == "" {
			fallback = s
		}
		if ipv4[0] == 10 ||
			(ipv4[0] == 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
			(ipv4[0] == 192 && ipv4[1] == 168) {
			privateIP = s
			fmt.Printf("[GetLocalIP]  ✓ selected private: %s\n", s)
			break
		}
	}
	if privateIP != "" {
		return privateIP
	}
	if fallback != "" {
		fmt.Printf("[GetLocalIP] fallback to: %s\n", fallback)
		return fallback
	}
	fmt.Println("[GetLocalIP] no IPv4 found, returning 127.0.0.1")
	return "127.0.0.1"
}
