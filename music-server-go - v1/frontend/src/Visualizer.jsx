import {useEffect, useRef} from 'react';

function Visualizer({onClose}) {
    const canvasRef = useRef(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let rafId;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const rings = 72;
        const particles = [];
        const embers = [];

        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * Math.min(cx, cy) * 0.7;
            particles.push({
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                r: 0.5 + Math.random() * 1.5,
                baseAlpha: 0.2 + Math.random() * 0.4,
                phase: Math.random() * Math.PI * 2,
            });
        }

        for (let i = 0; i < 30; i++) {
            embers.push({
                x: cx + (Math.random() - 0.5) * 200,
                y: cy + (Math.random() - 0.5) * 200,
                vy: -(0.2 + Math.random() * 0.6),
                vx: (Math.random() - 0.5) * 0.3,
                r: 0.5 + Math.random() * 2,
                life: 0.5 + Math.random() * 0.5,
                maxLife: 0.5 + Math.random() * 0.5,
            });
        }

        let time = 0;
        let bassBeat = 0;

        function draw() {
            time += 0.015;
            bassBeat = Math.sin(time * 2) * 0.5 + 0.5;

            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;
            const maxR = Math.min(cx, cy) * 0.75;

            ctx.fillStyle = 'rgba(5, 2, 18, 1)';
            ctx.fillRect(0, 0, w, h);

            ctx.save();
            ctx.translate(cx, cy);

            for (let i = 0; i < rings; i++) {
                const angle = (i / rings) * Math.PI * 2;
                const freq = Math.sin(time + i * 0.12) * 0.5 + 0.5;
                const freq2 = Math.sin(time * 1.7 + i * 0.08 + 1.3) * 0.5 + 0.5;
                const freq3 = Math.sin(time * 0.9 + i * 0.15 + 4.7) * 0.5 + 0.5;
                const val = freq * 0.4 + freq2 * 0.35 + freq3 * 0.25;
                const r = val * maxR * (0.6 + bassBeat * 0.4);

                const nx = Math.cos(angle) * r;
                const ny = Math.sin(angle) * r;

                const t = i / rings;
                const hue = 200 + t * 60 + time * 15;
                const alpha = 0.15 + val * 0.5;

                ctx.beginPath();
                ctx.arc(nx, ny, 1.5 + val * 3, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${hue}, 80%, ${55 + val * 25}%, ${alpha})`;
                ctx.fill();

                if (i % 3 === 0) {
                    const nextI = (i + 3) % rings;
                    const nextAngle = (nextI / rings) * Math.PI * 2;
                    const nextFreq = Math.sin(time + nextI * 0.12) * 0.5 + 0.5;
                    const nextFreq2 = Math.sin(time * 1.7 + nextI * 0.08 + 1.3) * 0.5 + 0.5;
                    const nextFreq3 = Math.sin(time * 0.9 + nextI * 0.15 + 4.7) * 0.5 + 0.5;
                    const nextVal = nextFreq * 0.4 + nextFreq2 * 0.35 + nextFreq3 * 0.25;
                    const nextR = nextVal * maxR * (0.6 + bassBeat * 0.4);
                    const nextNx = Math.cos(nextAngle) * nextR;
                    const nextNy = Math.sin(nextAngle) * nextR;

                    ctx.beginPath();
                    ctx.moveTo(nx, ny);
                    ctx.lineTo(nextNx, nextNy);
                    ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${alpha * 0.2})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            ctx.restore();

            for (const p of particles) {
                const dx = p.x - cx;
                const dy = p.y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const targetAngle = Math.atan2(dy, dx);
                const waveRipple = Math.sin(time * 0.5 + dist * 0.01) * 15;
                const targetDist = dist + waveRipple;

                p.x = cx + Math.cos(targetAngle) * targetDist + p.vx;
                p.y = cy + Math.sin(targetAngle) * targetDist + p.vy;

                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;

                const alpha = p.baseAlpha + Math.sin(time + p.phase) * 0.15;
                const hue = 220 + Math.sin(time * 0.3 + p.phase) * 30;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${Math.max(0, alpha)})`;
                ctx.fill();
            }

            for (const e of embers) {
                e.x += e.vx;
                e.y += e.vy;
                e.life -= 0.003;

                if (e.life <= 0) {
                    e.x = cx + (Math.random() - 0.5) * 250;
                    e.y = cy + 50 + (Math.random() - 0.5) * 80;
                    e.vy = -(0.2 + Math.random() * 0.6);
                    e.vx = (Math.random() - 0.5) * 0.3;
                    e.r = 0.5 + Math.random() * 2;
                    e.life = e.maxLife;
                }

                const alpha = Math.max(0, e.life / e.maxLife) * 0.6;
                const hue = 190 + Math.sin(time + e.x * 0.01) * 30;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${alpha})`;
                ctx.fill();

                if (e.r > 1) {
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.r * 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${alpha * 0.15})`;
                    ctx.fill();
                }
            }

            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.35);
            const glowAlpha = 0.06 + bassBeat * 0.04;
            grad.addColorStop(0, `rgba(80, 140, 255, ${glowAlpha * 2})`);
            grad.addColorStop(0.4, `rgba(140, 80, 255, ${glowAlpha})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            rafId = requestAnimationFrame(draw);
        }
        draw();

        function onKey(e) {
            if (e.key === 's' || e.key === 'S') {
                if (onCloseRef.current) onCloseRef.current();
            }
        }
        window.addEventListener('keydown', onKey);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', resize);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 9999,
            }}
        />
    );
}

export default Visualizer;
