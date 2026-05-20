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
├── netlify.toml               # Netlify build + dev + functions config
├── package.json
├── tsconfig*.json
├── netlify/
│   └── functions/             # server-side Netlify Functions (hold secrets)
│       └── chat.ts            # proxies OpenRouter chat completions; served at /api/chat
└── src/
    ├── main.tsx               # React root
    ├── App.tsx                # top-level layout
    ├── index.css              # Tailwind import + small body globals
    ├── components/            # presentational React components (HelloScene, editor/ overlay UI)
    ├── scenes/                # three.js scene composition + rendering
    │   └── voxelEditor/       # 20×20×20 voxel editor (R3F canvas + reducer state)
    ├── capture/               # camera/photo capture flow (planned)
    └── lib/                   # client-side utilities
        └── openrouter.ts      # typed wrapper around /api/chat
```

`capture/` is still a placeholder kept via `.gitkeep`. Promote it to a real
module as the capture flow lands — and update this file when you do.

## Voxel editor

`src/scenes/voxelEditor/` is the interactive editor surface. The app shell
(`src/App.tsx`) mounts two views — hero and editor — side-by-side inside a
200vw track and translates between them for a seamless slide transition.
Both Canvases stay mounted; the inactive one switches to
`frameloop="demand"` to idle the renderer.

- `VoxelEditorScene.tsx` — Canvas, lights, OrbitControls, scene composition.
- `BasePlane.tsx` — faint gray 20×20 plane + line-segments grid overlay.
- `Voxels.tsx` — drei `<Instances>` (limit 8000) with per-face add and
  per-instance remove via raycast normals.
- `useVoxelEditor.ts` — `useReducer` hook holding voxel map, undo history
  (capped at 100), current color, current tool. No external state library.
- `coords.ts` — grid constants, palette, `cellKey`, `inBounds`,
  `cellToWorld`, `worldToCell`.

Overlay UI lives in `src/components/editor/` (`ColorBar`, `Toolbar`,
`BackButton`) — plain DOM, positioned absolutely outside the Canvas for
cleaner pointer handling than `<Html>`.

## Backend / Netlify Functions

All secrets stay server-side. The client never sees API keys; it calls a
Netlify Function which holds the key and proxies upstream.

- **`netlify/functions/chat.ts`** — POST `/api/chat`. Whitelists OpenAI-style
  body fields (`model`, `messages`, `response_format`, `temperature`,
  `max_tokens`, `top_p`, `seed`, `stop`), then calls OpenRouter using
  `process.env.OPENROUTER_API_KEY`. Returns the upstream JSON untouched.
  No streaming yet.
- **Env vars** — `OPENROUTER_API_KEY` lives in Netlify's project settings
  (scope: Builds, Functions, Runtime). Locally, `netlify link --name
  uma-qubefy` pairs the working dir with the cloud project; after that
  `netlify dev` injects env vars at runtime — no `.env` file needed. The
  linking state is stored in `.netlify/` (gitignored). `.env` is supported
  only as a fallback for contributors without team access.
- **Client helper** — `src/lib/openrouter.ts` exports `chat(req)` plus types.
  Always call through this; never `fetch('/api/chat')` directly.

When adding a new server-side capability, create a sibling function in
`netlify/functions/` and a typed client helper in `src/lib/`. Add a row to
the table below.

| Function | Path | Purpose |
|---|---|---|
| `chat` | `/api/chat` | OpenRouter chat completions (structured outputs supported) |

## Deployment

Hosted on Netlify. `netlify.toml` pins `command = "npm run build"`,
`publish = "dist"`, and `functions = "netlify/functions"`. The dev block
proxies `localhost:8888` → Vite on `5173` so `/api/*` works in dev with the
same URL as production.

## Dev commands

```
npm install              # first-time setup
npm run dev              # Vite dev server only (UI work, no functions)
npm run dev:netlify      # netlify dev → Vite + functions on :8888 (use when calling /api/*)
npm run build            # type-check + production build
npm run preview          # serve the production build locally
npm run lint             # ESLint
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
