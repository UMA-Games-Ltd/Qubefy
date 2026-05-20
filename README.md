# Qubefy

Turn a photo from your phone or camera into an interactive voxel scene in the
browser.

Snap a picture, and Qubefy reconstructs it as a 3D voxel world you can spin,
explore, and (eventually) edit — all client-side, powered by React, Tailwind,
and three.js.

> **Status:** very early. The hello-world screen is up; capture and voxel
> synthesis are not implemented yet.

## Tech stack

- **Vite 8** — dev server and bundler
- **React 19** + **TypeScript**
- **Tailwind CSS v4** — utility-first styling
- **three.js** with **@react-three/fiber** and **@react-three/drei** — 3D
  rendering

## Quick start

Requires Node 20+ (tested on Node 24).

```bash
npm install
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`) — open it in
your browser to see the hello-world scene.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## Project structure

```
src/
├── main.tsx          # React entry point
├── App.tsx           # top-level layout
├── index.css         # Tailwind import + globals
├── components/       # React components
├── scenes/           # three.js scene composition (planned)
├── capture/          # camera / photo capture (planned)
└── lib/              # image → voxel utilities (planned)
```

A higher-level architecture map for AI/agent collaborators lives in
[`CLAUDE.md`](./CLAUDE.md).
