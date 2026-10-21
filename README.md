# Lens Studio

On-device AI image studio. Runs Hugging Face transformer models **entirely in your browser** via
`@huggingface/transformers` (transformers.js v3) on **WebGPU**, with a WASM/CPU fallback. No servers,
no API keys, and your images never leave your device.

## Features

- **Remove background** — subject cut-out onto transparency using `briaai/RMBG-1.4`.
- **Depth map** — per-pixel depth estimation using `onnx-community/depth-anything-v2-small`.
- **Describe** — image captioning using `Xenova/vit-gpt2-image-captioning`.
- Drag-and-drop (or click) to load an image; before/after compare slider for image results.
- One-click PNG download of the result (transparent cut-out / depth map).
- Model-download progress, a live device badge (GPU vs CPU), and framer-motion polish.
- Each model is **lazy-loaded on first use** and cached for the session.

## Tech stack

- **React 18 + TypeScript + Vite**
- **Tailwind CSS** for styling, **framer-motion** for animation
- **@huggingface/transformers** (transformers.js v3) running inside a **Web Worker**
- WebGPU execution provider with automatic WASM fallback

## How it works

```
UI (App.tsx)  ──postMessage──▶  Web Worker (model.worker.ts)  ──▶  transformers.js models
      ▲                                    │
      └────────── typed responses ─────────┘  (protocol.ts)
```

- The worker keeps all inference off the main thread, so the UI stays at 60fps.
- `src/worker/protocol.ts` defines a typed message protocol (`load` / `process` →
  `ready` / `download` / `status` / `result` / `error`), with `Mode = cutout | depth | describe`
  and a discriminated `result` of `kind: 'image' | 'text'`.
- For background removal, the RMBG mask is written into the alpha channel of the source image and
  the resulting RGBA buffer is transferred back to the main thread as an `ImageData`.
- Captioning is pinned to the WASM backend because text-generation is more reliable there across
  browsers; image models prefer WebGPU.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run preview    # preview the production build
```

The first time you use each mode, the corresponding model is downloaded from the Hugging Face Hub
(needs network); afterwards it is cached by the browser.

## Project structure

```
src/
  App.tsx                     # UI: mode switcher, dropzone, results
  main.tsx
  index.css
  components/
    Dropzone.tsx              # drag-and-drop image input
    CompareSlider.tsx         # before/after slider + PNG download
  hooks/
    useLensModel.ts           # owns the worker; run(mode, blob) -> image | text
  worker/
    protocol.ts               # typed message protocol
    model.worker.ts           # lazy-loads models, runs inference
  lib/
    cn.ts
```

## Notes

- All processing is local; nothing is uploaded.
- WebGPU requires a recent browser; the app automatically falls back to CPU (WASM) when unavailable.
- The production build emits a large ONNX-runtime WASM asset — expected for on-device inference.
