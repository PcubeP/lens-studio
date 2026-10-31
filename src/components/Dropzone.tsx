import { useCallback, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'

interface DropzoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export function Dropzone({ onFile, disabled }: DropzoneProps) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file && file.type.startsWith('image/')) onFile(file)
    },
    [onFile],
  )

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) pick(e.dataTransfer.files)
      }}
      whileHover={disabled ? undefined : { scale: 1.005 }}
      whileTap={disabled ? undefined : { scale: 0.995 }}
      className={cn(
        'group relative flex w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-20 text-center transition-colors',
        disabled && 'cursor-not-allowed opacity-50',
        over ? 'border-accent bg-accent/5' : 'border-zinc-700 hover:border-zinc-500',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full border transition-colors',
          over ? 'border-accent text-accent' : 'border-zinc-600 text-zinc-400',
        )}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-lg font-medium text-zinc-100">Drop an image, or click to browse</p>
        <p className="mt-1 font-mono text-xs text-zinc-500">
          PNG · JPG · WEBP — processed entirely on your device
        </p>
      </div>
    </motion.button>
  )
}
