interface Props {
  palette: readonly string[]
  active: string
  onPick: (color: string) => void
}

export function ColorBar({ palette, active, onPick }: Props) {
  return (
    <div
      className="absolute left-4 top-1/2 flex -translate-y-1/2 flex-col items-center overflow-y-auto rounded-2xl border border-[#1f1814]/10 bg-[#fffaf0] shadow-[0_2px_0_var(--color-paper-edge),0_18px_30px_-18px_rgba(31,24,20,0.18)] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#1f1814]/20"
      style={{
        maxHeight: 'calc(100vh - 9rem)',
        padding: 'clamp(0.25rem, 1vh, 0.5rem)',
        gap: 'clamp(0.25rem, 1vh, 0.5rem)',
      }}
    >
      {palette.map((c) => {
        const isActive = active === c
        return (
          <button
            key={c}
            type="button"
            aria-label={`Pick color ${c}`}
            aria-pressed={isActive}
            onClick={() => onPick(c)}
            className={`shrink-0 rounded-full transition ${
              isActive
                ? 'ring-2 ring-[#1f1814]/85 ring-offset-2 ring-offset-[#fffaf0]'
                : 'hover:scale-110'
            }`}
            style={{
              backgroundColor: c,
              width: 'clamp(1.25rem, 3.4vh, 1.75rem)',
              height: 'clamp(1.25rem, 3.4vh, 1.75rem)',
            }}
          />
        )
      })}
    </div>
  )
}
