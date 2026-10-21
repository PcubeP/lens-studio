// Typed message protocol between the UI and the model web worker.

export type Device = 'webgpu' | 'wasm'

/** The AI capabilities Lens Studio exposes; each maps to its own model. */
export type Mode = 'cutout' | 'depth' | 'describe'

/** Messages sent from the main thread to the worker. */
export type WorkerRequest =
  | { type: 'load' }
  | { type: 'process'; id: number; mode: Mode; blob: Blob }

/** Messages sent from the worker back to the main thread. */
export type WorkerResponse =
  | { type: 'ready'; device: Device }
  | { type: 'download'; file: string; progress: number }
  | { type: 'status'; message: string }
  | {
      type: 'result'
      id: number
      kind: 'image'
      buffer: ArrayBuffer
      width: number
      height: number
    }
  | { type: 'result'; id: number; kind: 'text'; text: string }
  | { type: 'error'; id?: number; message: string }
