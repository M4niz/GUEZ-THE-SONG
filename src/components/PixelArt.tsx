import { useMemo } from 'react';

// Original 8-bit sprites drawn as character grids ('.' = transparent).
export type SpriteName = 'vinyl' | 'cd' | 'note';

const PALETTE: Record<string, string> = {
  K: '#15181c', // outline
  O: '#f2b96b', // orange fur
  C: '#f8e8d0', // cream
  P: '#f49ac1', // pink
  R: '#e0474c', // red
  D: '#6e0f1c', // dark red
  G: '#5b6c77', // groove / cup gray
  W: '#ffffff',
  L: '#d9dde0', // light gray
  M: '#9aa2a9', // mid gray
  Z: '#c9303a', // vinyl label
  Y: '#8e1b24'  // vinyl label shadow
};

/** Build a round sprite from a per-pixel function of (dx, dy, distance) from the centre */
function disc(size: number, radius: number, pixel: (dx: number, dy: number, d: number) => string): string[] {
  const c = size / 2;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      return d > radius ? '.' : pixel(dx, dy, d);
    }).join('')
  );
}

const VINYL = disc(18, 8.6, (dx, dy, d) => {
  if (d <= 0.9) return 'W';
  if (d <= 3.1) return dx + dy < -1 ? 'Z' : 'Y';
  if (d >= 7.7) return 'K';
  const groove = (d >= 4.4 && d <= 5.2) || (d >= 6.1 && d <= 6.9);
  return groove && dx * dy > 0.6 ? 'G' : 'K';
});

const BEAMED_NOTE = [
  '....KKKKKKKK',
  '....KKKKKKKK',
  '....KK....KK',
  '....KK....KK',
  '....KK....KK',
  '....KK....KK',
  '..KKKK..KKKK',
  '.KKKKK.KKKKK',
  '.KKKKK.KKKKK',
  '..KKK...KKK.'
];

const NOTE = [
  '..KKKKK',
  '..KK..K',
  '..K...K',
  '..K...K',
  'KKK.KKK',
  'KKK.KKK'
];

const CD = (() => {
  const grid = disc(20, 8.2, (dx, dy, d) => {
    if (d >= 7.3) return 'K';
    if (d <= 2.3) return 'W';
    if (d <= 3.3) return 'K';
    const band = Math.abs(dx + dy);
    if (band <= 2) return 'W';
    return dx + dy < 0 ? 'L' : 'M';
  }).map(r => r.split(''));
  // Shift the disc to the lower right and draw a note in the top-left corner
  const shifted = Array.from({ length: 20 }, (_, y) =>
    Array.from({ length: 20 }, (_, x) => grid[y - 1]?.[x - 1] ?? '.')
  );
  NOTE.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch !== '.') shifted[y][x] = ch; }));
  return shifted.map(r => r.join(''));
})();

const SPRITES: Record<SpriteName, string[]> = { vinyl: VINYL, cd: CD, note: BEAMED_NOTE };

export function PixelSprite({ name, size = 64, className = '', style }: {
  name: SpriteName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const rects = useMemo(() => {
    const out: { x: number; y: number; w: number; fill: string }[] = [];
    SPRITES[name].forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let w = 1;
        while (x + w < row.length && row[x + w] === ch) w++;
        if (ch !== '.' && PALETTE[ch]) out.push({ x, y, w, fill: PALETTE[ch] });
        x += w;
      }
    });
    return out;
  }, [name]);

  const rows = SPRITES[name];
  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;

  return (
    <svg
      className={`px ${className}`}
      style={style}
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1.02} fill={r.fill} />)}
    </svg>
  );
}

const FLOATERS: { sprite: SpriteName; left: number; top: number; size: number; anim: string; delay: number }[] = [
  { sprite: 'note', left: 6, top: 14, size: 64, anim: 'px-hop', delay: 0 },
  { sprite: 'vinyl', left: 82, top: 8, size: 84, anim: 'px-spin', delay: 0.4 },
  { sprite: 'cd', left: 8, top: 64, size: 76, anim: 'px-spin slow', delay: 0.8 },
  { sprite: 'note', left: 82, top: 60, size: 56, anim: 'px-bob', delay: 0.2 },
  { sprite: 'vinyl', left: 44, top: 3, size: 44, anim: 'px-bob', delay: 1.1 },
  { sprite: 'cd', left: 28, top: 84, size: 46, anim: 'px-bob', delay: 0.6 },
  { sprite: 'note', left: 66, top: 86, size: 40, anim: 'px-hop', delay: 1.4 },
  { sprite: 'cd', left: 90, top: 36, size: 40, anim: 'px-spin', delay: 0.9 }
];

/** Decorative drifting 8-bit sprites behind the home screen */
export function PixelBackdrop() {
  return (
    <div className="px-backdrop" aria-hidden="true">
      {FLOATERS.map((f, i) => (
        <PixelSprite
          key={i}
          name={f.sprite}
          size={f.size}
          className={`px-floater ${f.anim}`}
          style={{ left: `${f.left}%`, top: `${f.top}%`, animationDelay: `${f.delay}s` }}
        />
      ))}
    </div>
  );
}
