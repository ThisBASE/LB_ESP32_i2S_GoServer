import {useState, useEffect, useCallback} from 'react';
import './App.css';
import {
    GetClients, GetMusicDir, GetPort, GetLocalIP,
    SendPlay, SendStop, GetWSClientIPs, GetFileList,
    GetDeviceNames, SetDeviceName,
    GetDeviceModes, SetDeviceMode
} from "../wailsjs/go/main/App";
import {EventsOn, EventsOff, WindowFullscreen, WindowUnfullscreen} from "../wailsjs/runtime";
import Visualizer from './Visualizer';

function stateLabel(s) {
    switch (s) {
        case 'connected': return 'Đã kết nối';
        case 'playing': return 'Đang phát';
        case 'stopped': return 'Đã ngắt';
        default: return s;
    }
}

function stateColor(s) {
    switch (s) {
        case 'connected': return '#2196F3';
        case 'playing': return '#4CAF50';
        case 'stopped': return '#FF9800';
        default: return '#999';
    }
}

function formatTime(t) {
    if (!t) return '-';
    return new Date(t).toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}

function App() {
    const [clients, setClients] = useState([]);
    const [musicDir, setMusicDir] = useState('');
    const [port, setPort] = useState('');
    const [localIP, setLocalIP] = useState('');
    const [showVisualizer, setShowVisualizer] = useState(false);
    const [wsIPs, setWsIPs] = useState([]);
    const [fileList, setFileList] = useState([]);
    const [selectedFile, setSelectedFile] = useState('');
    const [deviceNames, setDeviceNames] = useState({});
    const [deviceModes, setDeviceModes] = useState({});

    const loadClients = useCallback(() => {
        GetClients().then(setClients).catch(console.error);
    }, []);

    const loadWSInfo = useCallback(() => {
        GetWSClientIPs().then(setWsIPs).catch(console.error);
        GetFileList().then(list => {
            setFileList(list);
            if (!selectedFile && list.length > 0) setSelectedFile(list[0].name);
        }).catch(console.error);
    }, [selectedFile]);

    useEffect(() => {
        GetMusicDir().then(setMusicDir).catch(console.error);
        GetPort().then(setPort).catch(console.error);
        GetLocalIP().then(setLocalIP).catch(() => setLocalIP('127.0.0.1'));

        loadClients();
        loadWSInfo();
        GetDeviceNames().then(setDeviceNames).catch(console.error);
        GetDeviceModes().then(setDeviceModes).catch(console.error);

        EventsOn('client-update', () => loadClients());
        EventsOn('ws-update', () => { loadClients(); loadWSInfo(); GetDeviceModes().then(setDeviceModes).catch(console.error); });

        const interval = setInterval(() => { loadClients(); loadWSInfo(); GetDeviceNames().then(setDeviceNames).catch(console.error); GetDeviceModes().then(setDeviceModes).catch(console.error); }, 2000);

        function onKey(e) {
            if ((e.key === 's' || e.key === 'S') && showVisualizer) {
                setShowVisualizer(false);
            }
        }
        window.addEventListener('keydown', onKey);

        return () => {
            EventsOff('client-update');
            EventsOff('ws-update');
            clearInterval(interval);
            window.removeEventListener('keydown', onKey);
        };
    }, [loadClients, loadWSInfo, showVisualizer]);

    function handlePlay(ip) {
        const file = selectedFile || (fileList.length > 0 ? fileList[0].name : '');
        if (!file) return;
        SendPlay(ip, file).then(console.log).catch(console.error);
    }

    function handleStop(ip) {
        SendStop(ip).then(console.log).catch(console.error);
    }

        function modeLabel(m) {
            switch (m) {
                case 'touch': return '🔵 Chạm';
                case 'websocket': return '🟣 WebSocket';
                case 'hybrid': return '🟢 Cả hai';
                case 'touch-play': return '🔵 Chạm (k0 tự tắt)';
                default: return '🟢 Cả hai';
            }
        }

    function handleSetMode(ip, mode) {
        SetDeviceMode(ip, mode).then(() => GetDeviceModes().then(setDeviceModes));
    }

    function handleSetName(ip) {
        const name = window.prompt('Đặt tên cho thiết bị ' + ip, deviceNames[ip] || '');
        if (name !== null) {
            SetDeviceName(ip, name).then(() => GetDeviceNames().then(setDeviceNames));
        }
    }

    function displayName(ip) {
        return deviceNames[ip] || ip;
    }

    return (
        <div id="App">
            <header>
                <div className="header-top">
                    <h1>🎵 Music Stream Server</h1>
                    <button className="viz-btn" onClick={() => { setShowVisualizer(true); WindowFullscreen(); }}>
                        🎨 Visualize
                    </button>
                </div>
                <div className="server-info">
                    <span>🌐 http://{localIP}{port}</span>
                    <span>📁 {musicDir}</span>
                </div>
            </header>

            <div className="main-grid">
                <div className="col-left">
                    <section className="stats">
                        <div className="stat-box">
                            <span className="stat-number">{clients.length}</span>
                            <span className="stat-label">Tổng clients</span>
                        </div>
                        <div className="stat-box playing">
                            <span className="stat-number">{clients.filter(c => c.state === 'playing').length}</span>
                            <span className="stat-label">Đang phát</span>
                        </div>
                        <div className="stat-box connected">
                            <span className="stat-number">{clients.filter(c => c.state === 'connected').length}</span>
                            <span className="stat-label">Đã kết nối</span>
                        </div>
                    </section>

                    <section className="client-list">
                        <h2>HTTP Clients</h2>
                        {clients.length === 0 ? (
                            <p className="empty">Chưa có client nào</p>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>IP</th>
                                        <th>Trạng thái</th>
                                        <th>File</th>
                                        <th>Bắt đầu</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map(c => (
                                        <tr key={c.ip}>
                                            <td>
                                                <span className="dev-name" onClick={() => handleSetName(c.ip)} title="Click để đặt tên">{displayName(c.ip)}</span>
                                                {deviceNames[c.ip] && <span className="dev-ip-small">{c.ip}</span>}
                                            </td>
                                            <td>
                                                <span className="state-badge" style={{backgroundColor: stateColor(c.state)}}>
                                                    {stateLabel(c.state)}
                                                </span>
                                            </td>
                                            <td className="file-cell">{c.file || '-'}</td>
                                            <td>{formatTime(c.startTime)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>
                </div>

                <div className="col-right">
                    <section className="remote-panel">
                        <h2>📡 Điều khiển từ xa (WebSocket)</h2>

                        <div className="playlist-bar">
                            <select value={selectedFile} onChange={e => setSelectedFile(e.target.value)}>
                                {fileList.map(f => (
                                    <option key={f.name} value={f.name}>{f.name}</option>
                                ))}
                            </select>
                        </div>

                        {wsIPs.length === 0 ? (
                            <p className="empty">Chưa có thiết bị WebSocket nào kết nối</p>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Thiết bị</th>
                                        <th>Chế độ</th>
                                        <th>Điều khiển</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wsIPs.map(ip => {
                                        const ci = clients.find(c => c.ip === ip);
                                        const mode = deviceModes[ip] || 'hybrid';
                                        return (
                                            <tr key={ip}>
                                                <td>
                                                    <span className="dev-name" onClick={() => handleSetName(ip)} title="Click để đặt tên">{displayName(ip)}</span>
                                                    {deviceNames[ip] && <span className="dev-ip-small">{ip}</span>}
                                                    {ci && (
                                                        <span className="state-badge" style={{backgroundColor: stateColor(ci.state), marginLeft: 8}}>
                                                            {stateLabel(ci.state)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <select className="mode-select" value={mode} onChange={e => handleSetMode(ip, e.target.value)}>
                                                        <option value="hybrid">Cả hai</option>
                                                        <option value="touch">Chạm</option>
                                                        <option value="touch-play">Chạm (k0 tự tắt)</option>
                                                        <option value="websocket">WebSocket</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <button className="ctrl-btn play-btn" onClick={() => handlePlay(ip)} disabled={ci?.state === 'playing'}>
                                                        ▶ Play
                                                    </button>
                                                    <button className="ctrl-btn stop-btn" onClick={() => handleStop(ip)} disabled={!ci || ci.state !== 'playing'}>
                                                        ⏹ Stop
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                        <p className="ws-hint">
                            ESP32 kết nối qua: <code>ws://{localIP}{port}/ws</code>
                        </p>
                    </section>
                </div>
            </div>

            {showVisualizer && (
                <Visualizer onClose={() => { setShowVisualizer(false); WindowUnfullscreen(); }}/>
            )}
        </div>
    );
}

export default App
