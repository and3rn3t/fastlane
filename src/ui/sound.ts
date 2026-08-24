// Synthesized WebAudio blips — no asset files. Each "sound" is just a short
// sequence of oscillator tones with a quick attack/decay envelope.

const MUTE_KEY = 'fastlane-muted'

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  // iOS Safari suspends the context until a user-gesture resume.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Storage blocked — mute state just won't persist across sessions.
  }
}

interface Tone {
  freq: number
  duration: number
  delay?: number
  type?: OscillatorType
  gain?: number
}

function playTones(tones: Tone[]) {
  if (isMuted()) return
  const audio = getContext()
  if (!audio) return
  const now = audio.currentTime
  for (const t of tones) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = t.type ?? 'sine'
    osc.frequency.value = t.freq
    const start = now + (t.delay ?? 0)
    const peak = t.gain ?? 0.15
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, start + t.duration)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(start)
    osc.stop(start + t.duration + 0.02)
  }
}

export function playMove(): void {
  playTones([{ freq: 320, duration: 0.07, type: 'square', gain: 0.07 }])
}

export function playPurchase(): void {
  playTones([
    { freq: 440, duration: 0.07, type: 'triangle' },
    { freq: 550, duration: 0.09, delay: 0.06, type: 'triangle' },
  ])
}

export function playPayday(): void {
  playTones([
    { freq: 523, duration: 0.09 },
    { freq: 659, duration: 0.09, delay: 0.08 },
    { freq: 784, duration: 0.14, delay: 0.16 },
  ])
}

export function playDisaster(): void {
  playTones([
    { freq: 220, duration: 0.18, type: 'sawtooth', gain: 0.12 },
    { freq: 165, duration: 0.24, delay: 0.12, type: 'sawtooth', gain: 0.12 },
  ])
}

export function playWin(): void {
  playTones([
    { freq: 523, duration: 0.12 },
    { freq: 659, duration: 0.12, delay: 0.11 },
    { freq: 784, duration: 0.12, delay: 0.22 },
    { freq: 1047, duration: 0.32, delay: 0.33 },
  ])
}
