import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dropzone } from '@/components/Dropzone'
import { CompareSlider } from '@/components/CompareSlider'
import { useLensModel, type RunResult } from '@/hooks/useLensModel'
import type { Mode } from '@/worker/protocol'
import { cn } from '@/lib/cn'

interface ModeMeta {
  id: Mode
  label: string
  blurb: string
  rightLabel: string
}

const MODES: ModeMeta[] = [
  { id: 'cutout', label: 'Remove BG', blurb: 'Cut the subject out onto transparency.', rightLabel: 'Cut-out' },
  { id: 'depth', label: 'Depth map', blurb: 'Estimate a per-pixel depth map.', rightLabel: 'Depth' },
  { id: 'describe', label: 'Describe', blurb: 'Generate a caption for the image.', rightLabel: 'Caption' },
]

interface Job {
  file: File
  originalUrl: string
  mode: Mode
  result: RunResult | null
}

export default function App() {
  const { state, run } = useLensModel()
  const [mode, setMode] = useState<Mode>('cutout')
  const [job, setJob] = useState<Job | null>(null)
  const fileRef = useRef<File | null>(null)
  const prevUrlRef = useRef<string | null>(null)

  const busy = state.phase === 'loading' || state.phase === 'processing'
  const activeMeta = MODES.find((m) => m.id === mode)!

  const process = useCallback(
    async (file: File, forMode: Mode, originalUrl: string) => {
      try {
        const result = await run(forMode, file)
        setJob((j) => (j && j.file === file ? { ...j, mode: forMode, result } : j))
      } catch {
        setJob(null)
      }
      return originalUrl
    },
    [run],
  )

  const handleFile = useCallback(
    (file: File) => {
      fileRef.current = file
      const originalUrl = URL.createObjectURL(file)
      setJob({ file, originalUrl, mode, result: null })
      void process(file, mode, originalUrl)
    },
    [mode, process],
  )

  const selectMode = useCallback(
    (next: Mode) => {
      setMode(next)
      const file = fileRef.current
      if (!file || busy) return
      setJob((j) => (j ? { ...j, mode: next, result: null } : j))
      if (job) void process(file, next, job.originalUrl)
    },
    [busy, job, process],
  )

  // Revoke the previous object URL only when the URL genuinely changes, so
  // switching modes (which reuses the same originalUrl) keeps the preview alive.
  useEffect(() => {
    const url = job?.originalUrl ?? null
    const prev = prevUrlRef.current
    if (prev && prev !== url) URL.revokeObjectURL(prev)
    prevUrlRef.current = url
  }, [job?.originalUrl])

  // Revoke the final URL on unmount.
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    }
  }, [])

  const avgDownload = state.downloads.length
    ? Math.round(state.downloads.reduce((sum, d) => sum + d.progress, 0) / state.downloads.length)
    : 0

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-14">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">
            Lens Studio
          </span>
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
          AI image tools that run
          <br />
          <span className="text-accent">entirely in your browser.</span>
        </h1>
        <p className="mt-4 max-w-xl text-zinc-400">
          Cut out backgrounds, estimate depth, and caption images — every model runs on your
          device. Your images never leave your computer, and there's no server or sign-up.
        </p>
      </header>

      <ModeSwitcher mode={mode} onSelect={selectMode} disabled={busy} />

      <div className="mt-4">
        <StatusBar
          phase={state.phase}
          status={state.status}
          device={state.device}
          progress={avgDownload}
          showProgress={state.downloads.length > 0}
        />
      </div>

      <main className="mt-6 flex-1">
        <AnimatePresence mode="wait">
          {!job ? (
            <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Dropzone onFile={handleFile} disabled={state.phase === 'error'} />
            </motion.div>
          ) : (
            <motion.div
              key="work"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {!job.result ? (
                <ProcessingView url={job.originalUrl} label={activeMeta.blurb} />
              ) : job.result.kind === 'image' ? (
                <CompareSlider
                  original={job.originalUrl}
                  result={job.result.imageData}
                  fileName={job.file.name}
                  rightLabel={activeMeta.rightLabel}
                  downloadSuffix={job.mode}
                />
              ) : (
                <CaptionView url={job.originalUrl} text={job.result.text} />
              )}
              <button
                type="button"
                onClick={() => {
                  fileRef.current = null
                  setJob(null)
                }}
                disabled={busy}
                className={cn(
                  'font-mono text-xs uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300',
                  busy && 'cursor-not-allowed opacity-40',
                )}
              >
                ← Try another image
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {state.phase === 'error' && (
          <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 font-mono text-sm text-red-300">
            {state.error}
          </p>
        )}
      </main>

      <footer className="mt-12 font-mono text-[11px] text-zinc-600">
        RMBG-1.4 · Depth-Anything V2 · ViT-GPT2 · transformers.js · WebGPU with CPU fallback
      </footer>
    </div>
  )
}

function ModeSwitcher({
  mode,
  onSelect,
  disabled,
}: {
  mode: Mode
  onSelect: (m: Mode) => void
  disabled: boolean
}) {
  return (
    <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/40 p-1">
      {MODES.map((m) => {
        const active = m.id === mode
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(m.id)}
            className={cn(
              'relative rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              disabled && !active && 'cursor-not-allowed opacity-50',
              active ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-lg bg-accent"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function StatusBar({
  phase,
  status,
  device,
  progress,
  showProgress,
}: {
  phase: string
  status: string
  device: string | null
  progress: number
  showProgress: boolean
}) {
  const dot =
    phase === 'error' ? 'bg-red-500' : phase === 'ready' ? 'bg-accent' : 'bg-amber-400 animate-pulse'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
      <span className="font-mono text-xs text-zinc-400">{status}</span>
      {device && phase === 'ready' && (
        <span className="ml-auto rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {device}
        </span>
      )}
      {showProgress && (
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1 w-28 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="font-mono text-[10px] text-zinc-500">{progress}%</span>
        </div>
      )}
    </div>
  )
}

function ProcessingView({ url, label }: { url: string; label: string }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-800">
      <img src={url} alt="Processing" className="h-full w-full object-contain opacity-40" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span className="shimmer-text font-mono text-sm uppercase tracking-[0.3em]">Working…</span>
        <span className="font-mono text-[11px] text-zinc-500">{label}</span>
      </div>
    </div>
  )
}

function CaptionView({ url, text }: { url: string; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-zinc-800"
    >
      <img src={url} alt="Captioned" className="max-h-[60vh] w-full bg-zinc-900 object-contain" />
      <div className="border-t border-zinc-800 bg-zinc-900/60 p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Description</p>
        <p className="mt-2 text-lg text-zinc-100">{text}</p>
      </div>
    </motion.div>
  )
}
