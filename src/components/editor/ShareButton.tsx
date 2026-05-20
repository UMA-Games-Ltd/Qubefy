import { useEffect, useRef, useState } from 'react'

interface Props {
  onShare: () => string
}

export function ShareButton({ onShare }: Props) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  async function handleClick() {
    const token = onShare()
    const url = `${window.location.origin}${window.location.pathname}?s=${token}`

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Qubefy scene',
          text: 'Check out this voxel scene I built in Qubefy',
          url,
        })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this share URL:', url)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-[#dd6a4a] px-5 py-2.5 text-sm font-extrabold text-[#fff8ec] shadow-[0_2px_0_#b94f31,0_10px_20px_-10px_rgba(221,106,74,0.55)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:-rotate-[0.6deg] active:translate-y-0.5 active:shadow-[0_1px_0_#b94f31]"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {copied ? 'Copied!' : 'Share'}
    </button>
  )
}
