import { useEffect, useState } from 'react';
import { Flame, Zap } from 'lucide-react';

const CONFETTI_COLORS = ['#58CC02', '#1CB0F6', '#FFC800', '#FF9600', '#CE82FF', '#FF4B4B'];

export function Confetti({ count = 44 }: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.6 + Math.random() * 1.4,
      size: 7 + Math.random() * 7,
      drift: (Math.random() - 0.5) * 160,
      spin: 360 + Math.random() * 720,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    }))
  );

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{
          left: `${p.left}%`, width: p.size, height: p.size * 0.5, backgroundColor: p.color,
          animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
          ['--drift' as string]: `${p.drift}px`, ['--spin' as string]: `${p.spin}deg`
        }} />
      ))}
    </div>
  );
}

/** Number that eases from `from` to `to` after `delay` ms */
function useCountUp(from: number, to: number, delay = 0, duration = 900) {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (from === to) return;
    let raf = 0;
    const timeout = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(from + (to - from) * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf); };
  }, [from, to, delay, duration]);

  return from === to ? to : value;
}

interface XpBadgeProps {
  total: number;
  /** Points earned this round. When > 0, bits fly into the badge and the number counts up. */
  earned?: number;
  /** ms before the gather animation starts (lets the answer animation play first) */
  delay?: number;
}

export function XpBadge({ total, earned = 0, delay = 0 }: XpBadgeProps) {
  const shown = useCountUp(total - earned, total, delay + 700);
  const bits = Math.min(8, Math.max(3, Math.round(earned / 150)));
  const [spread] = useState(() =>
    Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      const radius = 90 + Math.random() * 70;
      return { sx: Math.cos(angle) * radius, sy: Math.sin(angle) * radius + 60 };
    })
  );
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (earned <= 0) return;
    const t = window.setTimeout(() => setPulsing(true), delay + 700);
    return () => clearTimeout(t);
  }, [earned, delay]);

  return (
    <span className={`stat xp ${pulsing ? 'pulse' : ''}`}>
      <Zap size={22} fill="currentColor" /> {shown}
      {earned > 0 && spread.slice(0, bits).map((b, i) => (
        <Zap key={i} size={16} fill="currentColor" className="xp-bit" style={{
          ['--sx' as string]: `${b.sx}px`, ['--sy' as string]: `${b.sy}px`,
          animationDelay: `${delay + i * 70}ms`
        }} />
      ))}
      {earned > 0 && <span className="xp-float" style={{ animationDelay: `${delay}ms` }}>+{earned}</span>}
    </span>
  );
}

export function StreakBadge({ streak, grow = false }: { streak: number; grow?: boolean }) {
  const hot = streak >= 3;
  return (
    <span className={`stat streak ${hot ? 'hot' : ''}`}>
      <span className={`flame ${hot ? (grow ? 'grow' : 'hot') : ''}`}>
        <Flame size={22} fill={hot ? 'currentColor' : 'none'} />
      </span>
      {streak}
    </span>
  );
}
