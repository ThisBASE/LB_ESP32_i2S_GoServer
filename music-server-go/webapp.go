package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"sort"
	"strings"
)

//go:embed webapp
var webappFS embed.FS

type apiClient struct {
	IP    string `json:"ip"`
	Name  string `json:"name"`
	State string `json:"state"`
	File  string `json:"file,omitempty"`
	Type  string `json:"type"`
	Mode  string `json:"mode"`
}

func (a *App) handleWebApp(w http.ResponseWriter, r *http.Request) {
	sub, err := fs.Sub(webappFS, "webapp")
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	http.FileServer(http.FS(sub)).ServeHTTP(w, r)
}

func (a *App) handleAPIClients(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	trackerClients := a.tracker.GetAll()
	wsIPs := a.wsManager.GetIPs()

	result := make([]apiClient, 0)
	seen := make(map[string]bool)

	for _, tc := range trackerClients {
		typ := "http"
		for _, wsip := range wsIPs {
			if wsip == tc.IP {
				typ = "ws"
				break
			}
		}
		seen[tc.IP] = true
		n := a.deviceNames[tc.IP]
		result = append(result, apiClient{
			IP:    tc.IP,
			Name:  n,
			State: string(tc.State),
			File:  tc.File,
			Type:  typ,
			Mode:  a.deviceModes[tc.IP],
		})
	}

	for _, wsip := range wsIPs {
		if !seen[wsip] {
			mode := a.deviceModes[wsip]
			if mode == "" {
				mode = "hybrid"
			}
			result = append(result, apiClient{IP: wsip, Name: a.deviceNames[wsip], State: "connected", Type: "ws", Mode: mode})
		}
	}

	sort.Slice(result, func(i, j int) bool {
		ni, nj := result[i].Name, result[j].Name
		if ni != nj {
			return ni < nj
		}
		return result[i].IP < result[j].IP
	})
	json.NewEncoder(w).Encode(result)
}

func (a *App) handleAPIPlay(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ip := r.FormValue("ip")
	file := r.FormValue("file")
	if ip == "" || file == "" {
		http.Error(w, "Missing ip or file", http.StatusBadRequest)
		return
	}

	err := a.wsManager.SendCommand(ip, "play", file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Write([]byte("ok"))
}

func (a *App) handleAPIStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ip := r.FormValue("ip")
	if ip == "" {
		http.Error(w, "Missing ip", http.StatusBadRequest)
		return
	}

	err := a.wsManager.SendCommand(ip, "stop", "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Write([]byte("ok"))
}

func (a *App) handleAPIFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(a.GetFileList())
}

func (a *App) handleAPILocalIP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write([]byte(a.GetLocalIP()))
}

func (a *App) handleAPIForwardPlay(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	file := r.FormValue("file")
	if file == "" {
		http.Error(w, "Missing file", http.StatusBadRequest)
		return
	}

	url := fmt.Sprintf("http://%s%s/stream/%s", a.GetLocalIP(), strings.TrimPrefix(httpPort, ":"), file)
	a.wsManager.Broadcast("play", url)
	w.Write([]byte("ok"))
}

func (a *App) handleAPINames(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method == "POST" {
		ip := r.FormValue("ip")
		name := r.FormValue("name")
		if ip != "" {
			a.deviceNames[ip] = name
			a.saveDeviceNames()
		}
	}
	json.NewEncoder(w).Encode(a.GetDeviceNames())
}

func (a *App) handleAPINameSet(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ip := r.FormValue("ip")
	name := r.FormValue("name")
	if ip == "" {
		http.Error(w, "Missing ip", http.StatusBadRequest)
		return
	}
	a.deviceNames[ip] = name
	a.saveDeviceNames()
	w.Write([]byte("ok"))
}

func (a *App) handleAPIModes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(a.GetDeviceModes())
}

func (a *App) handleAPIModeSet(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ip := r.FormValue("ip")
	mode := r.FormValue("mode")
	if ip == "" || mode == "" {
		http.Error(w, "Missing ip or mode", http.StatusBadRequest)
		return
	}
	if mode != "hybrid" && mode != "touch" && mode != "websocket" && mode != "touch-play" {
		http.Error(w, "Invalid mode", http.StatusBadRequest)
		return
	}
	result := a.SetDeviceMode(ip, mode)
	w.Write([]byte(result))
}

func (a *App) handleAPIForwardStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	a.wsManager.Broadcast("stop", "")
	w.Write([]byte("ok"))
}
