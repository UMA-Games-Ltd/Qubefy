import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CapturedImage } from './types'

interface Props {
  onClose: () => void
  onCapture: (image: CapturedImage) => void
}

type Status = 'requesting' | 'streaming' | 'error'

const SUPPORTS_CAMERA =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === 'function'

export function CameraModal({ onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [status, setStatus] = useState<Status>(
    SUPPORTS_CAMERA ? 'requesting' : 'error',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(
    SUPPORTS_CAMERA ? null : 'Camera not supported in this browser.',
  )
  const [mirror, setMirror] = useState(false)

  useEffect(() => {
    if (!SUPPORTS_CAMERA) return

    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        // Mirror when not using the rear camera (desktop webcam or front-facing).
        const track = stream.getVideoTracks()[0]
        const facing = track?.getSettings().facingMode
        setMirror(facing !== 'environment')
        setStatus('streaming')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setErrorMsg('Camera permission denied.')
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setErrorMsg('No camera available.')
        } else {
          setErrorMsg('Could not start the camera.')
        }
        setStatus('error')
      })

    const video = videoRef.current
    return () => {
      cancelled = true
      const stream = streamRef.current
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (video) video.srcObject = null
    }
  }, [])

  const handleSnap = () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (mirror) {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    onCapture({ dataUrl, width, height })
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    readFileAsImage(file)
      .then(onCapture)
      .catch(() => setErrorMsg('Could not read that image.'))
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#0d0a08]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${
          status === 'streaming' ? '' : 'hidden'
        } ${mirror ? '[transform:scaleX(-1)]' : ''}`}
      />

      {status === 'requesting' && (
        <div className="absolute inset-0 grid place-items-center text-[#fffaf0]">
          <span className="font-hand text-xl">starting camera…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-[#fffaf0]">
          <span className="font-display text-2xl">
            {errorMsg ?? 'Camera unavailable.'}
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-[#dd6a4a] px-6 py-3 text-base font-extrabold text-[#fff8ec] shadow-[0_2px_0_#b94f31] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:-rotate-1"
          >
            Pick a file instead
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handleFile}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-10 grid h-11 w-11 place-items-center rounded-full bg-[#fffaf0]/90 text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge),0_18px_28px_-12px_rgba(0,0,0,0.6)] backdrop-blur transition-transform duration-200 hover:rotate-90"
        aria-label="Close camera"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {status === 'streaming' && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-8">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0d0a08]/85 to-transparent" />
          <button
            type="button"
            onClick={handleSnap}
            aria-label="Snap photo"
            className="group relative grid h-20 w-20 place-items-center rounded-full bg-[#fffaf0] shadow-[0_4px_0_#b94f31,0_18px_28px_-12px_rgba(0,0,0,0.6)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 active:translate-y-0.5"
          >
            <span className="h-14 w-14 rounded-full bg-[#dd6a4a] transition-transform duration-150 group-active:scale-90" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

function readFileAsImage(file: File): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        reject(new Error('empty result'))
        return
      }
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () =>
        resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
