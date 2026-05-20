let ctx: AudioContext | null = null

function ensureCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    ctx = new Ctor!()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface BlipSpec {
  freq: number
  freqEnd: number
  dur: number
  type: OscillatorType
  gain: number
}

function blip({ freq, freqEnd, dur, type, gain }: BlipSpec) {
  const c = ensureCtx()
  const t0 = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const playAdd = () =>
  blip({ freq: 520, freqEnd: 880, dur: 0.09, type: 'triangle', gain: 0.18 })

export const playRemove = () =>
  blip({ freq: 320, freqEnd: 110, dur: 0.12, type: 'sine', gain: 0.16 })
