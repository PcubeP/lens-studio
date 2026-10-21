import { useCallback, useEffect, useRef, useState } from 'react'
import type { Device, Mode, WorkerResponse } from '@/worker/protocol'

export type Phase = 'idle' | 'loading' | 'ready' | 'processing' | 'error'

export interface DownloadState {
  file: string
  progress: number
}

export interface ModelState {
  phase: Phase
  device: Device | null
  status: string
  downloads: DownloadState[]
  error: string | null
}

export type RunResult =
  | { kind: 'image'; imageData: ImageData }
  | { kind: 'text'; text: string }

const initialState: ModelState = {
  phase: 'loading',
  device: null,
  status: 'Starting…',
  downloads: [],
  error: null,
}

export function useLensModel() {
  const workerRef = useRef<Worker | null>(null)
  const jobId = useRef(0)
  const resolvers = useRef<Map<number, (result: RunResult) => void>>(new Map())
  const rejecters = useRef<Map<number, (reason: Error) => void>>(new Map())
  const [state, setState] = useState<ModelState>(initialState)

  useEffect(() => {
    const worker = new Worker(new URL('../worker/model.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      switch (msg.type) {
        case 'status':
          setState((s) => ({ ...s, status: msg.message, downloads: [] }))
          break
        case 'download':
          setState((s) => {
            const downloads = [...s.downloads]
            const idx = downloads.findIndex((d) => d.file === msg.file)
            const entry = { file: msg.file, progress: msg.progress }
            if (idx === -1) downloads.push(entry)
            else downloads[idx] = entry
            return { ...s, downloads }
          })
          break
        case 'ready':
          setState((s) => ({
            ...s,
            phase: 'ready',
            device: msg.device,
            status: msg.device === 'webgpu' ? 'Ready · GPU accelerated' : 'Ready · CPU (WASM)',
            downloads: [],
          }))
          break
        case 'result': {
          const resolve = resolvers.current.get(msg.id)
          resolvers.current.delete(msg.id)
          rejecters.current.delete(msg.id)
          if (resolve) {
            if (msg.kind === 'image') {
              resolve({
                kind: 'image',
                imageData: new ImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height),
              })
            } else {
              resolve({ kind: 'text', text: msg.text })
            }
          }
          setState((s) => ({ ...s, phase: 'ready', downloads: [] }))
          break
        }
        case 'error': {
          if (msg.id !== undefined) {
            const reject = rejecters.current.get(msg.id)
            resolvers.current.delete(msg.id)
            rejecters.current.delete(msg.id)
            reject?.(new Error(msg.message))
            setState((s) => ({ ...s, phase: 'ready' }))
          } else {
            setState((s) => ({ ...s, phase: 'error', error: msg.message }))
          }
          break
        }
      }
    }

    worker.postMessage({ type: 'load' })
    return () => worker.terminate()
  }, [])

  const run = useCallback((mode: Mode, blob: Blob) => {
    const worker = workerRef.current
    if (!worker) return Promise.reject(new Error('Worker not initialized'))
    const id = ++jobId.current
    setState((s) => ({ ...s, phase: 'processing' }))
    return new Promise<RunResult>((resolve, reject) => {
      resolvers.current.set(id, resolve)
      rejecters.current.set(id, reject)
      worker.postMessage({ type: 'process', id, mode, blob })
    })
  }, [])

  return { state, run }
}
