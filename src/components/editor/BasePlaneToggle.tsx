interface Props {
  visible: boolean
  onToggle: () => void
}

export function BasePlaneToggle({ visible, onToggle }: Props) {
  const label = visible ? 'Hide base plane' : 'Show base plane'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={!visible}
      title={label}
      className="absolute left-28 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-[#1f1814]/10 bg-[#fffaf0] text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge),0_10px_20px_-12px_rgba(31,24,20,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:rotate-[0.6deg]"
    >
      {visible ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  )
}

function EyeIcon() {
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
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
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
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.31" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.77 19.77 0 0 1-3.17 4.19" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M1 1l22 22" />
    </svg>
  )
}
