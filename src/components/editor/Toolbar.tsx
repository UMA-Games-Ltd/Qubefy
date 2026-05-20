import type { ReactNode } from 'react'
import type { Tool } from '../../scenes/voxelEditor/useVoxelEditor'

interface Props {
  tool: Tool
  canUndo: boolean
  onTool: (tool: Tool) => void
  onUndo: () => void
}

export function Toolbar({ tool, canUndo, onTool, onUndo }: Props) {
  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[#1f1814]/10 bg-[#fffaf0] p-1.5 shadow-[0_2px_0_var(--color-paper-edge),0_18px_30px_-18px_rgba(31,24,20,0.18)]">
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
      <div className="mx-1 h-6 w-px bg-white/10" />
      <ToolbarButton onClick={onUndo} disabled={!canUndo} label="Undo">
        <UndoIcon />
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
