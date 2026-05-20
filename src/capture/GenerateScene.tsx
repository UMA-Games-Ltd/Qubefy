import { useEffect, useRef, useState } from 'react'
import { BackButton } from '../components/editor/BackButton'
import { GENERATE_MODELS } from './models'
import { generateVoxelScene, type GenerationInfo } from './generateVoxelScene'
import { SCHEMES, type GenerateScheme } from './schemes'
import type { CapturedImage, EffortPreset } from './types'
import type { Voxel } from '../scenes/voxelEditor/coords'

export interface GenerationStatus {
  generating: boolean
  progress: number
  error: string | null
}

interface Props {
  image: CapturedImage | null
  active: boolean
  onBack: () => void
  onComplete: (voxels: Voxel[], info: GenerationInfo | null) => void
  onStatusChange?: (status: GenerationStatus) => void
}

const EFFORTS: { id: EffortPreset; label: string; hint: string }[] = [
  { id: 'weak', label: 'Weak', hint: 'rough sketch' },
  { id: 'medium', label: 'Medium', hint: 'balanced' },
  { id: 'strong', label: 'Strong', hint: 'detailed' },
]

// Visual progress creeps toward this ceiling while the request is in flight,
// then snaps to 100% on success. Keeps the bar honest — it never claims to be
// done before the network is.
const PROGRESS_CEILING = 0.9
// Time constant for the asymptotic creep (ms). Tuned so the bar reaches the
// ceiling smoothly within ~20s — long enough for a strong-effort call.
const PROGRESS_TAU_MS = 6000

export function GenerateScene({
  image,
  active,
  onBack,
  onComplete,
  onStatusChange,
}: Props) {
  const [modelId, setModelId] = useState<string>(GENERATE_MODELS[0].id)
  const [scheme, setScheme] = useState<GenerateScheme>('points')
  const [effort, setEffort] = useState<EffortPreset>('medium')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const tickerRafRef = useRef<number | null>(null)
  const lastPushRef = useRef(0)
  const tickerScrollRef = useRef<HTMLDivElement | null>(null)
  const tickerTextRef = useRef<HTMLSpanElement | null>(null)
  // Full accumulated reasoning text (newlines collapsed to spaces).
  const reasoningBufferRef = useRef('')
  // How many chars of `reasoningBufferRef.current` have been revealed to the
  // DOM so far. The RAF loop closes the gap toward `length` at a steady rate
  // so the ticker scrolls smoothly regardless of upstream burstiness.
  const displayedCharsRef = useRef(0)

  // Hold the latest values in refs so the generation effect can depend only on
  // `generating` — re-running it on every prop change (e.g. parent re-renders
  // mutating `onComplete`) would spawn a new fetch each time and exhaust the
  // browser's resource budget with multi-MB image payloads.
  const imageRef = useRef(image)
  const modelIdRef = useRef(modelId)
  const schemeRef = useRef(scheme)
  const effortRef = useRef(effort)
  const onCompleteRef = useRef(onComplete)
  const onStatusChangeRef = useRef(onStatusChange)
  imageRef.current = image
  modelIdRef.current = modelId
  schemeRef.current = scheme
  effortRef.current = effort
  onCompleteRef.current = onComplete
  onStatusChangeRef.current = onStatusChange

  // Push status changes directly from the callsite that produces them — not
  // via a useEffect on [generating, progress, error]. The effect form re-fired
  // on every RAF tick (~60 Hz), and each call setState'd the parent, which
  // re-rendered the whole App tree (including the editor's R3F canvas) at
  // 60 Hz. That cascade tripped React's nested-update limit.
  const pushStatus = (status: GenerationStatus) => {
    lastPushRef.current = performance.now()
    onStatusChangeRef.current?.(status)
  }
  // Progress updates fire from RAF; throttle the parent push so the chip
  // refreshes smoothly without forcing a 60 Hz re-render across the App.
  const pushProgress = (value: number) => {
    const now = performance.now()
    if (now - lastPushRef.current < 100) return
    lastPushRef.current = now
    onStatusChangeRef.current?.({ generating: true, progress: value, error: null })
  }

  useEffect(() => {
    if (!generating) return
    const img = imageRef.current
    if (!img) return

    // Intentionally no AbortController — React StrictMode's dev-only
    // mount→unmount→remount would abort our only in-flight request and
    // surface as a fake error. Use a `cancelled` flag to ignore stale
    // results instead; in production StrictMode is off and only one fetch
    // ever fires.
    let cancelled = false
    let receivedFirstChunk = false
    const startedAt = performance.now()

    // Reset ticker between generations.
    reasoningBufferRef.current = ''
    displayedCharsRef.current = 0
    if (tickerTextRef.current) tickerTextRef.current.textContent = ''
    if (tickerScrollRef.current) tickerScrollRef.current.scrollLeft = 0

    // Smooth ticker — runs while generating. Each frame closes part of the
    // gap between `displayedCharsRef.current` and the full buffered length,
    // so the visible text grows at a steady cadence even when the network
    // delivers reasoning in bursts.
    const TICKER_TAIL_CHARS = 400
    // Min chars revealed per frame so the ticker keeps moving even with a
    // small buffer gap.
    const MIN_CHARS_PER_FRAME = 0.4
    // Fraction of the gap to drain each frame — higher = catches up faster
    // when the model produces a burst; lower = smoother.
    const DRAIN_FRACTION = 0.06

    const tickerFrame = () => {
      const buffered = reasoningBufferRef.current.length
      const displayed = displayedCharsRef.current
      const gap = buffered - displayed
      if (gap > 0) {
        const step = Math.max(MIN_CHARS_PER_FRAME, gap * DRAIN_FRACTION)
        const next = Math.min(buffered, displayed + step)
        displayedCharsRef.current = next
        const intNext = Math.floor(next)
        const start = Math.max(0, intNext - TICKER_TAIL_CHARS)
        const text = tickerTextRef.current
        const scroller = tickerScrollRef.current
        if (text) {
          text.textContent = reasoningBufferRef.current.slice(start, intNext)
        }
        if (scroller) scroller.scrollLeft = scroller.scrollWidth
      }
      tickerRafRef.current = requestAnimationFrame(tickerFrame)
    }
    tickerRafRef.current = requestAnimationFrame(tickerFrame)

    // RAF easing covers TTFB — the period before any tokens have arrived.
    // Once the first content delta lands, we switch to chunk-driven progress
    // and stop the RAF.
    const tick = (now: number) => {
      const eased = PROGRESS_CEILING * (1 - Math.exp(-(now - startedAt) / PROGRESS_TAU_MS))
      setProgress(eased)
      pushProgress(eased)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    generateVoxelScene(img, modelIdRef.current, effortRef.current, schemeRef.current, {
      onProgress: ({ chars, maxTokens }) => {
        if (cancelled) return
        if (!receivedFirstChunk) {
          receivedFirstChunk = true
          if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
          }
        }
        // Rough chars-per-token ≈ 4. Clamp at the ceiling until parseToVoxels
        // resolves, then we snap to 1.0 below.
        const fraction = chars / (maxTokens * 4)
        const value = Math.min(PROGRESS_CEILING, fraction)
        setProgress(value)
        pushProgress(value)
      },
      onReasoningDelta: (delta) => {
        if (cancelled) return
        // Append to the buffer; the RAF loop reveals it at a steady rate.
        // Newlines are collapsed so the ticker stays single-line.
        reasoningBufferRef.current += delta.replace(/\s+/g, ' ')
      },
    })
      .then(({ voxels, info }) => {
        if (cancelled) return
        setProgress(1)
        pushStatus({ generating: true, progress: 1, error: null })
        window.setTimeout(() => {
          if (cancelled) return
          setGenerating(false)
          pushStatus({ generating: false, progress: 1, error: null })
          onCompleteRef.current(voxels, info)
        }, 250)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('generateVoxelScene failed', err)
        const message =
          err instanceof Error ? err.message : 'Generation failed'
        setError(message)
        setGenerating(false)
        setProgress(0)
        pushStatus({ generating: false, progress: 0, error: message })
      })

    return () => {
      cancelled = true
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (tickerRafRef.current != null) cancelAnimationFrame(tickerRafRef.current)
      tickerRafRef.current = null
    }
  }, [generating])

  const handleBack = () => {
    // Allow leaving even while generating — the request keeps running in the
    // background and a chip on the hero lets the user return here.
    onBack()
  }

  const handleGenerate = () => {
    setError(null)
    setProgress(0)
    setGenerating(true)
    pushStatus({ generating: true, progress: 0, error: null })
  }

  const pct = Math.round(progress * 100)

  return (
    <div
      className="relative h-full w-full overflow-y-auto bg-[#f6efe0]"
      aria-hidden={!active}
    >
      <div className="pointer-events-none absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-[#dd6a4a]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-[#f3c44a]/15 blur-3xl" />

      <BackButton onClick={handleBack} />

      <main className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col items-center px-6 pt-20 pb-12">
        <span className="mb-2 inline-flex -rotate-2 items-center gap-2.5 font-hand text-xl font-bold text-[#b94f31]">
          <span className="h-0.5 w-5 -rotate-3 rounded bg-current" />
          Looking good
        </span>
        <h2 className="font-display text-5xl leading-[0.95] tracking-wide text-[#1f1814] sm:text-6xl">
          Generate scene
        </h2>
        <p className="mt-4 max-w-xl text-center text-base font-semibold text-[#3d2f25] sm:text-lg">
          Pick a model, a scheme, and how hard it should think.
        </p>

        <div className="mt-8 grid w-full gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Image preview */}
          <div className="relative -rotate-1">
            <span
              aria-hidden="true"
              className="absolute -top-3 left-10 h-5 w-24 -rotate-[5deg] border-l border-r border-dashed border-[#1f1814]/20 bg-[#f3c44a]/60 shadow-[0_4px_10px_-6px_rgba(31,24,20,0.25)]"
            />
            <div className="overflow-hidden rounded-[26px] border border-[#1f1814]/10 bg-[#fffaf0] p-3 shadow-[0_2px_0_var(--color-paper-edge),0_28px_44px_-28px_rgba(31,24,20,0.34)]">
              <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-[18px] bg-[#1f1814]/5">
                {image ? (
                  <img
                    src={image.dataUrl}
                    alt="Captured"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="font-hand text-lg text-[#7a6755]">
                    (no image yet)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="font-display text-2xl text-[#1f1814]">Model</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {GENERATE_MODELS.map((m) => {
                  const selected = m.id === modelId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModelId(m.id)}
                      disabled={generating}
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                        selected
                          ? 'bg-[#dd6a4a] text-[#fff8ec] shadow-[0_2px_0_#b94f31] hover:-translate-y-0.5'
                          : 'border border-[#1f1814]/10 bg-[#fffaf0] text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge)] hover:-translate-y-0.5',
                        generating ? 'pointer-events-none opacity-60' : '',
                      ].join(' ')}
                    >
                      {m.label}
                      {m.tag && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            selected
                              ? 'bg-[#fff8ec]/25 text-[#fff8ec]'
                              : 'bg-[#1f1814]/8 text-[#7a6755]'
                          }`}
                        >
                          {m.tag}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <h3 className="font-display text-2xl text-[#1f1814]">Scheme</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {SCHEMES.map((s) => {
                  const selected = s.id === scheme
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setScheme(s.id)}
                      disabled={generating}
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                        selected
                          ? 'bg-[#dd6a4a] text-[#fff8ec] shadow-[0_2px_0_#b94f31] hover:-translate-y-0.5'
                          : 'border border-[#1f1814]/10 bg-[#fffaf0] text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge)] hover:-translate-y-0.5',
                        generating ? 'pointer-events-none opacity-60' : '',
                      ].join(' ')}
                    >
                      {s.label}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          selected
                            ? 'bg-[#fff8ec]/25 text-[#fff8ec]'
                            : 'bg-[#1f1814]/8 text-[#7a6755]'
                        }`}
                      >
                        {s.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <h3 className="font-display text-2xl text-[#1f1814]">Effort</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {EFFORTS.map((e) => {
                  const selected = e.id === effort
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEffort(e.id)}
                      disabled={generating}
                      className={[
                        'flex flex-col items-center gap-0.5 rounded-2xl px-3 py-3 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                        selected
                          ? 'bg-[#1f1814] text-[#fffaf0] shadow-[0_2px_0_#000] hover:-translate-y-0.5'
                          : 'border border-[#1f1814]/10 bg-[#fffaf0] text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge)] hover:-translate-y-0.5',
                        generating ? 'pointer-events-none opacity-60' : '',
                      ].join(' ')}
                    >
                      <span className="font-display text-xl">{e.label}</span>
                      <span
                        className={`font-hand text-sm ${
                          selected ? 'text-[#f3c44a]' : 'text-[#7a6755]'
                        }`}
                      >
                        {e.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="mt-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !image}
                className="group relative inline-flex w-full -rotate-[0.5deg] items-center justify-center gap-3 rounded-[26px] bg-[#dd6a4a] px-6 py-5 font-display text-3xl text-[#fff8ec] shadow-[0_3px_0_#b94f31,0_22px_36px_-18px_rgba(221,106,74,0.6)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] enabled:hover:-translate-y-0.5 enabled:hover:-rotate-[1deg] enabled:active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <Spinner />
                    {pct < 100 ? `Generating… ${pct}%` : 'Finishing up…'}
                  </>
                ) : (
                  <>
                    <SparkIcon className="h-8 w-8" />
                    {error ? 'Try again' : 'Generate'}
                  </>
                )}
              </button>

              <div className="relative mt-4 h-7 w-full overflow-hidden rounded-full border border-[#1f1814]/10 bg-[#fffaf0] shadow-[inset_0_2px_0_var(--color-paper-edge)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#dd6a4a]/40 transition-[width] duration-150 ease-out"
                  style={{ width: `${pct}%` }}
                />
                <div
                  ref={tickerScrollRef}
                  className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-3 font-mono text-[11px] text-[#1f1814]/65"
                  aria-hidden="true"
                >
                  <span ref={tickerTextRef} />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-3 rounded-2xl border border-[#b94f31]/40 bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#7a2a1b] shadow-[0_2px_0_var(--color-paper-edge)]"
                >
                  {error}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2 L13.8 9 L21 10 L13.8 11.5 L12 22 L10.2 11.5 L3 10 L10.2 9 Z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  )
}
