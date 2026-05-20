import { useRef, useState } from 'react'
import { CameraModal } from './CameraModal'
import type { CapturedImage } from './types'

interface Props {
  onImage: (image: CapturedImage) => void
  disabled?: boolean
}

export function PhotoCaptureButtons({ onImage, disabled = false }: Props) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    readFileAsImage(file).then(onImage).catch(() => {
      window.alert("That image couldn't be read. Try another file.")
    })
  }

  return (
    <>
      <div className="pointer-events-auto relative mt-10 flex w-full max-w-2xl items-stretch gap-3">
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={disabled}
          className="group relative flex flex-[2] -rotate-1 items-center justify-center gap-3 rounded-[26px] bg-[#dd6a4a] px-6 py-6 text-left font-display text-3xl text-[#fff8ec] shadow-[0_3px_0_#b94f31,0_22px_36px_-18px_rgba(221,106,74,0.6)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] enabled:hover:-translate-y-0.5 enabled:hover:-rotate-[1.5deg] enabled:active:translate-y-0.5 enabled:active:shadow-[0_1px_0_#b94f31] disabled:cursor-not-allowed disabled:opacity-50 sm:text-4xl"
        >
          <CameraIcon className="h-9 w-9 shrink-0" />
          <span>Take photo</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="group relative flex flex-[1] rotate-1 flex-col items-center justify-center gap-1 rounded-[22px] border border-[#1f1814]/10 bg-[#fffaf0] px-4 py-5 font-display text-xl text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge),0_18px_28px_-18px_rgba(31,24,20,0.3)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] enabled:hover:-translate-y-0.5 enabled:hover:rotate-[1.6deg] enabled:active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UploadIcon className="h-6 w-6" />
          <span>Upload</span>
          <span className="font-hand text-base font-bold text-[#7a6755]">
            from disk
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileChange}
          disabled={disabled}
        />
      </div>

      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onCapture={(image) => {
            setCameraOpen(false)
            onImage(image)
          }}
        />
      )}
    </>
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

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 4v12" />
      <path d="M6 10l6-6 6 6" />
      <path d="M4 20h16" />
    </svg>
  )
}
