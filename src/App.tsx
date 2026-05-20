import { HelloScene } from './components/HelloScene'

function App() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0b0a14] text-white">
      {/* Ambient gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e1b4b_0%,_#0b0a14_55%,_#000_100%)]" />
      <div className="pointer-events-none absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-indigo-500/20 blur-3xl" />

      {/* Three.js canvas behind everything */}
      <div className="absolute inset-0">
        <HelloScene />
      </div>

      {/* Foreground hero text */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-between px-6 py-10">
        <header className="flex w-full max-w-5xl items-center justify-between text-sm font-medium text-white/60">
          <span className="tracking-[0.3em] uppercase">Qubefy</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs backdrop-blur">
            Dev preview · v0.0.0
          </span>
        </header>

        <section className="pointer-events-none flex max-w-3xl flex-col items-center text-center">
          <h1 className="bg-gradient-to-br from-white via-fuchsia-200 to-indigo-300 bg-clip-text text-6xl font-semibold leading-[1.05] tracking-tight text-transparent sm:text-7xl md:text-8xl">
            Qubefy
          </h1>
          <p className="mt-6 text-lg text-white/70 sm:text-xl">
            Snap a photo. Build a voxel world.
          </p>
          <p className="mt-3 max-w-xl text-sm text-white/40">
            Hello, world — React, Tailwind and three.js are wired up and
            humming. Capture flow and voxel synthesis coming next.
          </p>
        </section>

        <footer className="text-xs text-white/30">
          built with vite · react · tailwind · three.js
        </footer>
      </main>
    </div>
  )
}

export default App
