import {useState, useEffect, useCallback} from 'react';
import './App.css';
import {GetClients, GetMusicDir, GetPort, GetLocalIP} from "../wailsjs/go/main/App";
import {EventsOn, EventsOff, WindowFullscreen, WindowUnfullscreen} from "../wailsjs/runtime";
import Visualizer from './Visualizer';

function stateLabel(state) {
    switch (state) {
        case 'connected':
            return 'Đã kết nối';
        case 'playing':
            return 'Đang phát';
        case 'stopped':
            return 'Đã ngắt';
        default:
            return state;
    }
}

function stateColor(state) {
    switch (state) {
        case 'connected':
            return '#2196F3';
        case 'playing':
            return '#4CAF50';
        case 'stopped':
            return '#FF9800';
        default:
            return '#999';
    }
}

function formatTime(t) {
    if (!t) return '-';
    const d = new Date(t);
    return d.toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}

function App() {
    const [clients, setClients] = useState([]);
    const [musicDir, setMusicDir] = useState('');
    const [port, setPort] = useState('');
    const [localIP, setLocalIP] = useState('');
    const [showVisualizer, setShowVisualizer] = useState(false);

    const loadClients = useCallback(() => {
        GetClients().then(list => {
            console.log('[UI] Clients updated:', list.length);
            setClients(list);
        }).catch(err => {
            console.error('[UI] GetClients error:', err);
        });
    }, []);

    useEffect(() => {
        GetMusicDir().then(setMusicDir).catch(console.error);
        GetPort().then(setPort).catch(console.error);
        GetLocalIP().then(setLocalIP).catch(() => setLocalIP('127.0.0.1'));

        loadClients();

        EventsOn('client-update', () => {
            console.log('[UI] client-update event received');
            loadClients();
        });

        const interval = setInterval(loadClients, 1000);

        function onKey(e) {
            if ((e.key === 's' || e.key === 'S') && showVisualizer) {
                setShowVisualizer(false);
            }
        }
        window.addEventListener('keydown', onKey);

        return () => {
            EventsOff('client-update');
            clearInterval(interval);
            window.removeEventListener('keydown', onKey);
        };
    }, [loadClients, showVisualizer]);

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

            <main>
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
                    <h2>Clients</h2>
                    {clients.length === 0 ? (
                        <p className="empty">Chưa có client nào kết nối</p>
                    ) : (
                        <table>
                            <thead>
                            <tr>
                                <th>IP</th>
                                <th>Trạng thái</th>
                                <th>File</th>
                                <th>Bắt đầu</th>
                                <th>Gần nhất</th>
                            </tr>
                            </thead>
                            <tbody>
                            {clients.map(c => (
                                <tr key={c.ip}>
                                    <td>{c.ip}</td>
                                    <td>
                                        <span className="state-badge"
                                              style={{backgroundColor: stateColor(c.state)}}>
                                            {stateLabel(c.state)}
                                        </span>
                                    </td>
                                    <td className="file-cell">{c.file || '-'}</td>
                                    <td>{formatTime(c.startTime)}</td>
                                    <td>{formatTime(c.lastSeen)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </section>
            </main>

            {showVisualizer && (
                <Visualizer onClose={() => { setShowVisualizer(false); WindowUnfullscreen(); }}/>
            )}
        </div>
    );
}

export default App
