/**
 * Tiny procedural sound engine — every effect is generated with WebAudio
 * oscillators, so the game ships zero audio assets.
 *
 * The AudioContext is created lazily on the first sound: browsers only allow
 * audio after a user gesture (a key press or click), and by then the player
 * has already interacted with the game.
 */

const VOLUME = 0.15;

let audioContext: AudioContext | null = null;
let muted = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioContext) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }

  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

/** One enveloped oscillator note, optionally sliding to `endFrequency`. */
function tone(
  frequency: number,
  durationMs: number,
  type: OscillatorType,
  endFrequency: number = frequency,
): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = durationMs / 1000;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(1, endFrequency),
    now + duration,
  );
  gain.gain.setValueAtTime(VOLUME, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export const sfx = {
  /** Catch pop: the pitch rises with the combo multiplier. */
  catch(multiplier: number): void {
    const base = 440 * Math.pow(1.12, Math.min(multiplier, 5));
    tone(base, 120, "square", base * 1.5);
  },

  star(): void {
    tone(880, 90, "triangle", 1320);
    window.setTimeout(() => tone(1320, 140, "triangle", 1760), 90);
  },

  powerUp(): void {
    tone(523, 100, "sine", 784);
    window.setTimeout(() => tone(784, 140, "sine", 1047), 100);
  },

  damage(): void {
    tone(160, 220, "sawtooth", 55);
  },

  comboLost(): void {
    tone(330, 180, "square", 165);
  },

  phaseUp(): void {
    tone(262, 150, "square", 392);
    window.setTimeout(() => tone(392, 150, "square", 523), 150);
    window.setTimeout(() => tone(523, 250, "square", 784), 300);
  },

  gameOver(): void {
    tone(392, 200, "sawtooth", 196);
    window.setTimeout(() => tone(196, 400, "sawtooth", 98), 200);
  },

  toggleMute(): boolean {
    muted = !muted;
    return muted;
  },
};
