import type { ReactNode } from 'react'
import type { Tool } from '../../scenes/voxelEditor/useVoxelEditor'

interface Props {
  tool: Tool
  canUndo: boolean
  canClear: boolean
  onTool: (tool: Tool) => void
  onUndo: () => void
  onClear: () => void
}

export function Toolbar({
  tool,
  canUndo,
  canClear,
  onTool,
  onUndo,
  onClear,
}: Props) {
  return (
    <div className="absolute bottom-[max(1.5rem,calc(0.5rem+env(safe-area-inset-bottom)))] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[#1f1814]/10 bg-[#fffaf0] p-1.5 shadow-[0_2px_0_var(--color-paper-edge),0_18px_30px_-18px_rgba(31,24,20,0.18)]">
      <ToolbarButton
        active={tool === 'add'}
        onClick={() => onTool('add')}
        label="Add"
      >
        <PlusIcon />
      </ToolbarButton>
      <ToolbarButton
        active={tool === 'remove'}
        onClick={() => onTool('remove')}
        label="Remove"
      >
        <MinusIcon />
      </ToolbarButton>
      <div className="mx-1 h-6 w-px bg-[#1f1814]/10" />
      <ToolbarButton onClick={onUndo} disabled={!canUndo} label="Undo">
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton onClick={onClear} disabled={!canClear} label="Clear">
        <TrashIcon />
      </ToolbarButton>
    </div>
  )
}

interface ToolbarButtonProps {
  children: ReactNode
  active?: boolean
  onClick: () => void
  disabled?: boolean
  label: string
}

function ToolbarButton({
  children,
  active,
  onClick,
  disabled,
  label,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
        active
          ? 'bg-[#dd6a4a] text-[#fff8ec] shadow-[0_2px_0_#b94f31]'
          : 'text-[#1f1814]/70 hover:bg-[#1f1814]/10 hover:text-[#1f1814]'
      } disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  )
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M5 12h14" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
