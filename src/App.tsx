import { useCallback, useState } from 'react'
import { HelloScene } from './components/HelloScene'
import { VoxelEditorScene } from './scenes/voxelEditor/VoxelEditorScene'
import { decodeScene } from './scenes/voxelEditor/share'
import type { Voxel } from './scenes/voxelEditor/coords'
import { GenerateScene, type GenerationStatus } from './capture/GenerateScene'
import { PhotoCaptureButtons } from './capture/PhotoCaptureButtons'
import type { CapturedImage } from './capture/types'

type View = 'hero' | 'generate' | 'editor'

function readSharedScene(): Voxel[] | null {
  if (typeof window === 'undefined') return null
  const token = new URLSearchParams(window.location.search).get('s')
  return token ? decodeScene(token) : null
}

function App() {
  const [sharedVoxels] = useState<Voxel[] | null>(readSharedScene)
  const [view, setView] = useState<View>(sharedVoxels ? 'editor' : 'hero')
  const [captured, setCaptured] = useState<CapturedImage | null>(null)
  const [generatedVoxels, setGeneratedVoxels] = useState<Voxel[] | null>(null)
  const [genStatus, setGenStatus] = useState<GenerationStatus>({
    generating: false,
    progress: 0,
    error: null,
  })
  const isEditor = view === 'editor'
  const isGenerate = view === 'generate'
  const isBusy = genStatus.generating
  const hasGenFailure = !genStatus.generating && genStatus.error !== null

  const handleStatusChange = useCallback((s: GenerationStatus) => {
    setGenStatus(s)
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f6efe0] text-[#1f1814]">
      <div
        className="flex h-full w-[200vw] will-change-transform transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          transform: isEditor ? 'translateX(0)' : 'translateX(-100vw)',
        }}
      >
        {/* Editor slot — sits to the left so it slides in from the left edge */}
        <div
          className={`relative h-full w-screen shrink-0 ${
            isEditor ? '' : 'pointer-events-none'
          }`}
          aria-hidden={!isEditor}
        >
          <VoxelEditorScene
            active={isEditor}
            onBack={() => setView('hero')}
            initialVoxels={generatedVoxels ?? sharedVoxels ?? undefined}
          />
        </div>

        {/* Hero + Generate slot — nested vertical track */}
        <div
          className={`relative h-full w-screen shrink-0 overflow-hidden ${
            isEditor ? 'pointer-events-none' : ''
          }`}
          aria-hidden={isEditor}
        >
          <div
            className="flex h-[200vh] w-full flex-col will-change-transform transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: isGenerate ? 'translateY(-100vh)' : 'translateY(0)',
            }}
          >
            {/* Hero pane */}
            <div
              className={`relative h-screen w-full shrink-0 overflow-hidden ${
                isGenerate || isEditor ? 'pointer-events-none' : ''
              }`}
              aria-hidden={isGenerate || isEditor}
            >
              <div className="absolute inset-0">
                <HelloScene active={view === 'hero'} />
              </div>

              {/* sparkles */}
              <Spark className="absolute top-[18%] left-[12%] h-8 w-8 rotate-12 text-[#f3c44a]" />
              <Spark className="absolute top-[14%] right-[22%] h-5 w-5 -rotate-6 text-[#dd6a4a]" />
              <Spark className="absolute bottom-[24%] left-[28%] h-6 w-6 -rotate-12 text-[#4d8fd6]" />

              <main className="relative z-10 flex h-full flex-col items-center justify-between px-6 py-8">
                <header className="flex w-full max-w-5xl items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 -rotate-6 place-items-center rounded-xl bg-[#1f1814] text-[#fffaf0] shadow-[0_6px_0_-2px_var(--color-terracotta),0_18px_30px_-18px_rgba(31,24,20,0.18)]">
                      <CubeIcon />
                    </div>
                    <span className="font-display text-3xl leading-none tracking-wide text-[#1f1814]">
                      Qubefy
                    </span>
                  </div>
                  <span className="rounded-full border border-[#1f1814]/10 bg-[#fffaf0] px-3 py-1 text-xs font-bold text-[#7a6755] shadow-[0_2px_0_var(--color-paper-edge)]">
                    Dev preview · v0.0.0
                  </span>
                </header>

                <section className="pointer-events-none flex max-w-3xl flex-col items-center text-center">
                  <span className="pointer-events-auto mb-2 inline-flex -rotate-2 items-center gap-2.5 font-hand text-xl font-bold text-[#b94f31]">
                    <span className="h-0.5 w-5 -rotate-3 rounded bg-current" />
                    Paper-to-pixel magic
                  </span>
                  <h1 className="font-display text-6xl leading-[0.95] tracking-wide text-[#1f1814] sm:text-7xl md:text-8xl">
                    <span className="block">Snap a photo.</span>
                    <span className="block pl-8 sm:pl-12">
                      Build a <Scribble>voxel world</Scribble>.
                    </span>
                  </h1>
                  <p className="mt-6 max-w-xl text-lg font-semibold text-[#3d2f25] sm:text-xl">
                    Capture anything in the world and watch it become a tiny
                    3D scene you can shape, paint, and share.
                  </p>

                  <PhotoCaptureButtons
                    onImage={(img) => {
                      setCaptured(img)
                      setView('generate')
                    }}
                    disabled={isBusy}
                  />
                </section>

                <footer className="font-hand text-base text-[#7a6755]">
                  built with vite · react · tailwind · three.js
                </footer>
              </main>

              {(isBusy || hasGenFailure) && (
                <GenerationChip
                  status={genStatus}
                  onClick={() => setView('generate')}
                />
              )}
            </div>

            {/* Generate pane */}
            <div
              className={`relative h-screen w-full shrink-0 overflow-hidden ${
                !isGenerate ? 'pointer-events-none' : ''
              }`}
              aria-hidden={!isGenerate}
            >
              <GenerateScene
                image={captured}
                active={isGenerate}
                onBack={() => {
                  setView('hero')
                  // Keep the captured image around if a generation is still
                  // running so the chip can return to the same scene.
                  if (!isBusy) setCaptured(null)
                }}
                onComplete={(voxels) => {
                  setGeneratedVoxels(voxels)
                  setCaptured(null)
                  setView('editor')
                }}
                onStatusChange={handleStatusChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CubeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5" />
      <path d="M12 12L4 7.5" />
      <path d="M12 12v9" />
    </svg>
  )
}

function Scribble({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap text-[#dd6a4a]">
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 320 20"
        preserveAspectRatio="none"
        className="absolute -bottom-[0.18em] left-[-4%] h-[0.28em] w-[108%] overflow-visible"
      >
        <path
          d="M4 14 Q 40 2 80 12 T 160 11 T 240 13 T 316 9"
          fill="none"
          stroke="#dd6a4a"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function GenerationChip({
  status,
  onClick,
}: {
  status: GenerationStatus
  onClick: () => void
}) {
  const failed = !status.generating && status.error !== null
  const pct = Math.max(0, Math.min(100, Math.round(status.progress * 100)))

  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto absolute bottom-6 left-1/2 z-20 flex w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 -rotate-[0.5deg] flex-col gap-2 rounded-2xl border border-[#1f1814]/10 bg-[#fffaf0] px-4 py-3 text-left shadow-[0_3px_0_var(--color-paper-edge),0_22px_36px_-22px_rgba(31,24,20,0.4)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:rotate-0 active:translate-y-0"
      aria-label={failed ? 'Generation failed — tap to retry' : 'Generation in progress — tap to view'}
    >
      <div className="flex items-center gap-3">
        {failed ? (
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#b94f31] text-[#fff8ec]"
          >
            !
          </span>
        ) : (
          <ChipSpinner />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-base leading-tight text-[#1f1814]">
            {failed ? 'Generation failed' : 'Generating scene…'}
          </span>
          <span className="truncate font-hand text-sm text-[#7a6755]">
            {failed ? 'Tap to retry' : `${pct}% · tap to view`}
          </span>
        </div>
      </div>

      {!failed && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1f1814]/10">
          <div
            className="h-full rounded-full bg-[#dd6a4a] transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </button>
  )
}

function ChipSpinner() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#dd6a4a"
      strokeWidth="3"
      strokeLinecap="round"
      className="shrink-0 animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  )
}

function Spark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2 L13.8 9 L21 10 L13.8 11.5 L12 22 L10.2 11.5 L3 10 L10.2 9 Z" />
    </svg>
  )
}

export default App
