import { useState } from 'react'
import { HelloScene } from './components/HelloScene'
import { VoxelEditorScene } from './scenes/voxelEditor/VoxelEditorScene'
import { decodeScene } from './scenes/voxelEditor/share'
import type { Voxel } from './scenes/voxelEditor/coords'

type View = 'hero' | 'editor'

function readSharedScene(): Voxel[] | null {
  if (typeof window === 'undefined') return null
  const token = new URLSearchParams(window.location.search).get('s')
  return token ? decodeScene(token) : null
}

function App() {
  const [sharedVoxels] = useState<Voxel[] | null>(readSharedScene)
  const [view, setView] = useState<View>(sharedVoxels ? 'editor' : 'hero')
  const isEditor = view === 'editor'

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
            initialVoxels={sharedVoxels ?? undefined}
          />
        </div>

        {/* Hero slot */}
        <div
          className={`relative h-full w-screen shrink-0 overflow-hidden ${
            isEditor ? 'pointer-events-none' : ''
          }`}
          aria-hidden={isEditor}
        >
          <div className="absolute inset-0">
            <HelloScene active={!isEditor} />
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
              <span
                className="pointer-events-auto mb-2 inline-flex -rotate-2 items-center gap-2.5 font-hand text-xl font-bold text-[#b94f31]"
              >
                <span className="h-0.5 w-5 -rotate-3 rounded bg-current" />
                Paper-to-pixel magic
              </span>
              <h1 className="font-display text-6xl leading-[0.95] tracking-wide text-[#1f1814] sm:text-7xl md:text-8xl">
                <span className="block">Snap a photo.</span>
                <span className="block pl-8 sm:pl-12">
                  Build a{' '}
                  <Scribble>voxel world</Scribble>.
                </span>
              </h1>
              <p className="mt-8 max-w-xl text-lg font-semibold text-[#3d2f25] sm:text-xl">
                Capture anything in the world and watch it become a tiny
                3D scene you can shape, paint, and share.
              </p>

              {/* Sticker CTA card with decorative tape */}
              <div className="pointer-events-auto relative mt-10 -rotate-1">
                <span
                  aria-hidden="true"
                  className="absolute -top-3 left-8 h-5 w-20 -rotate-[5deg] border-l border-r border-dashed border-[#1f1814]/20 bg-[#f3c44a]/60 shadow-[0_4px_10px_-6px_rgba(31,24,20,0.25)]"
                />
                <div className="rounded-[26px] border border-[#1f1814]/10 bg-[#fffaf0] px-6 py-5 shadow-[0_2px_0_var(--color-paper-edge),0_28px_44px_-28px_rgba(31,24,20,0.34)]">
                  <p className="font-display text-2xl leading-tight text-[#1f1814] sm:text-3xl">
                    Try the voxel editor right now!
                  </p>
                  <button
                    type="button"
                    onClick={() => setView('editor')}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#dd6a4a] px-7 py-3.5 text-base font-extrabold text-[#fff8ec] shadow-[0_2px_0_#b94f31,0_14px_22px_-10px_rgba(221,106,74,0.55)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:-rotate-1 hover:shadow-[0_4px_0_#b94f31,0_22px_28px_-12px_rgba(221,106,74,0.55)] active:translate-y-0.5 active:shadow-[0_1px_0_#b94f31]"
                  >
                    Open editor
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </section>

            <footer className="font-hand text-base text-[#7a6755]">
              built with vite · react · tailwind · three.js
            </footer>
          </main>
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
