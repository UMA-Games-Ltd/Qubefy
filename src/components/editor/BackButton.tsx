interface Props {
  onClick: () => void
}

export function BackButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      title="Back"
      className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-[#1f1814]/10 bg-[#fffaf0] text-[#1f1814] shadow-[0_2px_0_var(--color-paper-edge),0_10px_20px_-12px_rgba(31,24,20,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:rotate-[0.6deg]"
    >
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
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
