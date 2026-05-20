# Qubefy

Qubefy is a React + Tailwind web app that turns a phone/camera photo into a
voxel scene rendered with three.js. The user captures an image in the browser,
Qubefy analyses it, and produces an interactive 3D voxel reconstruction.

> **Maintenance rule**
> Update this `CLAUDE.md` at a **high level** whenever distinct modules,
> styles, or systems change — new top-level folders, swapped libraries, added
> build steps, or shifted architectural patterns. Keep it scannable: it is
> meant as a map for future Claude (and human) sessions, not exhaustive
> documentation.

## Tech stack

| Layer | Choice |
|---|---|
| Build / dev server | Vite 8 |
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` — no `tailwind.config.js`) |
| 3D | three.js + `@react-three/fiber` + `@react-three/drei` |
| Lint | ESLint (Vite default config) |

Camera capture will be done via the native browser APIs
(`navigator.mediaDevices.getUserMedia` and/or
`<input type="file" accept="image/*" capture>`); no extra dependency is
needed.

## Project layout

```
Qubefy/
├── index.html                 # Vite entry HTML
├── vite.config.ts             # registers React + Tailwind v4 plugins
├── package.json
├── tsconfig*.json
└── src/
    ├── main.tsx               # React root
    ├── App.tsx                # top-level layout
    ├── index.css              # Tailwind import + small body globals
    ├── components/            # presentational React components (e.g. HelloScene)
    ├── scenes/                # three.js voxel scene composition + rendering (planned)
    ├── capture/               # camera/photo capture flow (planned)
    └── lib/                   # image → voxel conversion utilities (planned)
```

`scenes/`, `capture/`, and `lib/` are placeholder folders kept via `.gitkeep`
so the intended module boundaries are visible from day one. Promote them to
real modules as the corresponding systems land — and update this file when
you do.

## Dev commands

```
npm install         # first-time setup
npm run dev         # start Vite dev server (HMR)
npm run build       # type-check + production build
npm run preview     # serve the production build locally
npm run lint        # ESLint
```

## Conventions

- Styling: Tailwind utility classes in JSX. Use `@theme` in `src/index.css`
  for shared design tokens; reach for component CSS only when utilities get
  unwieldy.
- 3D: prefer R3F JSX (`<mesh>`, `<group>`, ...) over manual `THREE` scene
  graphs. Drop to raw three.js only for code that can't be expressed
  declaratively.
- TypeScript: strict mode (Vite default). No untyped escape hatches without a
  reason.
