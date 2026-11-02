const MUTE_KEY = 'guess-the-song:muted';
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
})();
const muteListeners = new Set<() => void>();

export const isMuted = () => muted;
export function setMuted(value: boolean) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
  muteListeners.forEach(l => l());
}
export function subscribeMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => { muteListeners.delete(listener); };
}

// Singleton AudioContext to prevent exceeding browser limits
let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Short silent MP3, played once inside a user gesture to unlock <audio> playback (iOS/Safari autoplay rules)
const SILENT_MP3 = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

/**
 * Call from a click/tap handler. Unlocks the shared AudioContext (used for ding/buzz)
 * and returns an <audio> element that is allowed to play later without a gesture.
 */
export function unlockAudio(): HTMLAudioElement {
  try {
    getAudioContext();
  } catch (e) {
    console.warn('[Audio] AudioContext unlock failed', e);
  }
  const audio = new Audio(SILENT_MP3);
  audio.play().then(() => audio.pause()).catch(e => console.warn('[Audio] element unlock failed', e));
  return audio;
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export function playCorrectTone() {
  if (muted) return;
  try {
    const ctx = getAudioContext();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';

    // Rising ding
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.1); // C6

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {
    console.error("Audio playback error:", e);
  }
}

export function playWrongTone() {
  if (muted) return;
  try {
    const ctx = getAudioContext();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';

    // Buzz
    osc.frequency.setValueAtTime(150, ctx.currentTime);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {
    console.error("Audio playback error:", e);
  }
}

/** Quick rising arpeggio for the "points gathered" moment */
export function playCoinTone(count = 3) {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880 * Math.pow(1.122, i * 2), t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}

/** Short click for the last seconds of a round */
export function playTickTone() {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}
