/// <reference lib="webworker" />
import {
  AutoModel,
  AutoProcessor,
  RawImage,
  pipeline,
  env,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers'
import type { Device, Mode, WorkerRequest, WorkerResponse } from './protocol'

// Models are fetched from the Hugging Face hub, not bundled locally.
env.allowLocalModels = false

const RMBG_ID = 'briaai/RMBG-1.4'
const DEPTH_ID = 'onnx-community/depth-anything-v2-small'
const CAPTION_ID = 'Xenova/vit-gpt2-image-captioning'

let device: Device = 'wasm'

// transformers.js' pipeline() union type is too broad to name; use a callable shape.
type RunnablePipeline = (input: string, options?: Record<string, unknown>) => Promise<unknown>

// Each capability lazily loads its own model on first use, then is cached.
let rmbg: { model: PreTrainedModel; processor: Processor } | null = null
let depthPipe: RunnablePipeline | null = null
let captionPipe: RunnablePipeline | null = null

function post(message: WorkerResponse, transfer?: Transferable[]) {
  ;(self as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? [])
}

type ProgressEvent = { status: string; file?: string; progress?: number }

function onProgress(event: ProgressEvent) {
  if (event.status === 'progress' && event.file) {
    post({ type: 'download', file: event.file, progress: event.progress ?? 0 })
  }
}

async function loadRmbg() {
  if (rmbg) return rmbg
  post({ type: 'status', message: 'Loading cut-out model…' })
  const model = await AutoModel.from_pretrained(RMBG_ID, {
    // RMBG-1.4 uses a custom architecture not in the standard registry.
    config: { model_type: 'custom' } as never,
    device,
    progress_callback: onProgress,
  })
  const processor = await AutoProcessor.from_pretrained(RMBG_ID, {
    progress_callback: onProgress,
  })
  rmbg = { model, processor }
  return rmbg
}

async function runCutout(image: RawImage): Promise<Uint8ClampedArray> {
  const { model, processor } = await loadRmbg()
  const { pixel_values } = await processor(image)
  const { output } = await model({ input: pixel_values })
  const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(
    image.width,
    image.height,
  )
  const rgba = image.rgba()
  for (let i = 0; i < mask.data.length; i++) {
    rgba.data[i * 4 + 3] = mask.data[i]
  }
  return new Uint8ClampedArray(rgba.data)
}

async function runDepth(url: string): Promise<{ data: Uint8ClampedArray; w: number; h: number }> {
  if (!depthPipe) {
    post({ type: 'status', message: 'Loading depth model…' })
    depthPipe = (await pipeline('depth-estimation', DEPTH_ID, {
      device,
      progress_callback: onProgress,
    })) as unknown as RunnablePipeline
  }
  const { depth } = (await depthPipe(url)) as { depth: RawImage }
  const rgba = depth.rgba()
  return { data: new Uint8ClampedArray(rgba.data), w: depth.width, h: depth.height }
}

async function runCaption(url: string): Promise<string> {
  if (!captionPipe) {
    post({ type: 'status', message: 'Loading caption model…' })
    // Text generation is more reliable on CPU than WebGPU across browsers.
    captionPipe = (await pipeline('image-to-text', CAPTION_ID, {
      device: 'wasm',
      progress_callback: onProgress,
    })) as unknown as RunnablePipeline
  }
  const out = (await captionPipe(url)) as Array<{ generated_text: string }>
  return out[0]?.generated_text?.trim() || 'No description produced.'
}

async function detectDevice() {
  // Probe WebGPU by loading the default (cut-out) model on it; fall back to WASM.
  post({ type: 'status', message: 'Loading model…' })
  try {
    device = 'webgpu'
    await loadRmbg()
  } catch {
    post({ type: 'status', message: 'WebGPU unavailable — using CPU (WASM).' })
    rmbg = null
    device = 'wasm'
    await loadRmbg()
  }
  post({ type: 'ready', device })
}

async function process(id: number, mode: Mode, blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    if (mode === 'describe') {
      const text = await runCaption(url)
      post({ type: 'result', id, kind: 'text', text })
      return
    }
    if (mode === 'depth') {
      const { data, w, h } = await runDepth(url)
      const buffer = data.buffer as ArrayBuffer
      post({ type: 'result', id, kind: 'image', buffer, width: w, height: h }, [buffer])
      return
    }
    const image = await RawImage.fromURL(url)
    const out = await runCutout(image)
    const buffer = out.buffer as ArrayBuffer
    post(
      { type: 'result', id, kind: 'image', buffer, width: image.width, height: image.height },
      [buffer],
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type === 'load') {
    detectDevice().catch((err) => post({ type: 'error', message: String(err?.message ?? err) }))
  } else if (msg.type === 'process') {
    process(msg.id, msg.mode, msg.blob).catch((err) =>
      post({ type: 'error', id: msg.id, message: String(err?.message ?? err) }),
    )
  }
})
