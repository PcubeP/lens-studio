import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface CompareSliderProps {
  original: string
  result: ImageData
  fileName: string
  rightLabel?: string
  downloadSuffix?: string
}

function imageDataToUrl(data: ImageData): string {
  const canvas = document.createElement('canvas')
  canvas.width = data.width
  canvas.height = data.height
  canvas.getContext('2d')!.putImageData(data, 0, 0)
  return canvas.toDataURL('image/png')
}

export function CompareSlider({
  original,
  result,
  fileName,
  rightLabel = 'Cut-out',
  downloadSuffix = 'cutout',
}: CompareSliderProps) {
  const [pos, setPos] = useState(50)
  const [resultUrl, setResultUrl] = useState<string>('')
  const frameRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    setResultUrl(imageDataToUrl(result))
  }, [result])

  useEffect(() => {
    const move = (clientX: number) => {
      const frame = frameRef.current
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      const pct = ((clientX - rect.left) / rect.width) * 100
      setPos(Math.min(100, Math.max(0, pct)))
    }
    const onMouse = (e: MouseEvent) => dragging.current && move(e.clientX)
    const onTouch = (e: TouchEvent) => dragging.current && move(e.touches[0].clientX)
    const stop = () => (dragging.current = false)
    window.addEventListener('mousemove', onMouse)
    window.addEventListener('touchmove', onTouch)
    window.addEventListener('mouseup', stop)
    window.addEventListener('touchend', stop)
    return () => {
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('touchend', stop)
    }
  }, [])

  const download = () => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = fileName.replace(/\.[^.]+$/, '') + '-' + downloadSuffix + '.png'
    a.click()
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div
        ref={frameRef}
        className="checkerboard relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl border border-zinc-800"
      >
        {resultUrl && (
          <img
            src={resultUrl}
            alt="Background removed"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        )}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <img
            src={original}
            alt="Original"
            className="pointer-events-none absolute inset-0 h-full w-full bg-zinc-900 object-contain"
          />
        </div>

        <div
          className="absolute inset-y-0 w-0.5 cursor-ew-resize bg-accent"
          style={{ left: `${pos}%` }}
          onMouseDown={() => (dragging.current = true)}
          onTouchStart={() => (dragging.current = true)}
        >
          <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-zinc-900 shadow-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 7 4 12l5 5M15 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300">
          Original
        </span>
        <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300">
          {rightLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={download}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-medium text-zinc-900 transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 4v12m0 0 5-5m-5 5-5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20h16" strokeLinecap="round" />
        </svg>
        Download PNG
      </button>
    </motion.div>
  )
}
