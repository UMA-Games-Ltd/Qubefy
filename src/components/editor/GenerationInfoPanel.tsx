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

function shortModel(model: string): string {
  const slash = model.lastIndexOf('/')
  return slash >= 0 ? model.slice(slash + 1) : model
}

export function GenerationInfoPanel({ info, onDismiss }: Props) {
  const { promptTokens, completionTokens, totalTokens, cost, model, effort } = info

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 flex -translate-x-1/2 -rotate-[0.4deg] items-center gap-3 rounded-full border border-[#1f1814]/10 bg-[#fffaf0]/95 px-4 py-2 text-xs font-bold text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge),0_10px_22px_-14px_rgba(31,24,20,0.3)] backdrop-blur-sm">
      <span className="font-display text-sm tracking-wide text-[#dd6a4a]">
        {formatCost(cost)}
      </span>
      <span className="hidden h-3 w-px bg-[#1f1814]/15 sm:block" />
      <span className="hidden truncate text-[#7a6755] sm:inline">
        {shortModel(model)} · {effort}
      </span>
      <span className="hidden h-3 w-px bg-[#1f1814]/15 md:block" />
      <span
        className="hidden font-mono text-[#7a6755] md:inline"
        title={`${promptTokens} prompt + ${completionTokens} completion = ${totalTokens} tokens`}
      >
        {promptTokens}→{completionTokens}
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
