import type { GenerationInfo } from '../../capture/generateVoxelScene'

interface Props {
  info: GenerationInfo
  onDismiss?: () => void
}

function formatCost(cost: number | undefined): string {
  if (typeof cost !== 'number') return 'cost n/a'
  if (cost === 0) return 'free'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

function formatDuration(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s - m * 60)
  return `${m}m ${rem}s`
}

export function GenerationInfoPanel({ info, onDismiss }: Props) {
  const { totalTokens, cost, durationMs } = info

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 flex -translate-x-1/2 -rotate-[0.4deg] items-center gap-3 rounded-full border border-[#1f1814]/10 bg-[#fffaf0]/95 px-4 py-2 text-xs font-bold text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge),0_10px_22px_-14px_rgba(31,24,20,0.3)] backdrop-blur-sm">
      <span className="font-display text-sm tracking-wide text-[#dd6a4a]">
        {formatCost(cost)}
      </span>
      <span className="h-3 w-px bg-[#1f1814]/15" />
      <span className="text-[#7a6755]">{formatDuration(durationMs)}</span>
      <span className="h-3 w-px bg-[#1f1814]/15" />
      <span className="font-mono text-[#7a6755]">
        {totalTokens.toLocaleString()} tokens
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss generation info"
          className="ml-1 grid h-5 w-5 place-items-center rounded-full text-[#7a6755] transition-colors hover:bg-[#1f1814]/10 hover:text-[#1f1814]"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
