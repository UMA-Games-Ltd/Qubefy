import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  palette: readonly string[]
  active: string
  onPick: (color: string) => void
}

const TAP_TRAVEL_PX = 6
const SWATCH_STAGGER_MS = 22
const SWATCH_DURATION_MS = 360
const OVERSHOOT_EASE = 'cubic-bezier(0.34, 1.8, 0.64, 1)'

export function ColorPicker({ palette, active, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [latched, setLatched] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const downAtRef = useRef<{ x: number; y: number; id: number } | null>(null)
  const hoveredRef = useRef<string | null>(null)

  const updateHovered = useCallback((color: string | null) => {
    if (hoveredRef.current !== color) {
      hoveredRef.current = color
      setHovered(color)
    }
  }, [])

  const closeAll = useCallback(() => {
    setOpen(false)
    setLatched(false)
    updateHovered(null)
  }, [updateHovered])

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    downAtRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Some browsers throw when capture is unavailable; picker still works.
    }
    setOpen(true)
    setLatched(false)
    updateHovered(null)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!downAtRef.current || downAtRef.current.id !== e.pointerId) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const color = el?.closest<HTMLElement>('[data-color]')?.dataset.color ?? null
    updateHovered(color)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = downAtRef.current
    if (!start || start.id !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const travel = Math.hypot(dx, dy)
    const pickColor = hoveredRef.current

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore — already released
    }
    downAtRef.current = null

    if (travel < TAP_TRAVEL_PX) {
      setLatched(true)
      updateHovered(null)
      return
    }
    if (pickColor) {
      onPick(pickColor)
    }
    closeAll()
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    downAtRef.current = null
    closeAll()
  }

  useEffect(() => {
    if (!latched) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeAll()
    }
    const onDocPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      closeAll()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDocPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDocPointerDown)
    }
  }, [latched, closeAll])

  const columns = 5
  const swatchSize = '3.25rem'
  const swatchGap = '0.75rem'
  const totalSwatchDelay = (palette.length - 1) * SWATCH_STAGGER_MS

  return (
    <div className="absolute bottom-[max(1.5rem,calc(0.5rem+env(safe-area-inset-bottom)))] left-4">
      <div
        ref={panelRef}
        aria-hidden={!open}
        className={`absolute bottom-full left-0 mb-3 origin-bottom-left transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          open
            ? 'scale-100 opacity-100'
            : 'pointer-events-none scale-75 opacity-0'
        }`}
      >
        <div
          className="rounded-3xl rounded-bl-md border border-[#1f1814]/10 bg-[#fffaf0] shadow-[0_2px_0_var(--color-paper-edge),0_24px_40px_-20px_rgba(31,24,20,0.28)]"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, ${swatchSize})`,
            gridAutoRows: swatchSize,
            gap: swatchGap,
            padding: '1.125rem',
            boxSizing: 'content-box',
          }}
        >
          {palette.map((c, i) => {
            const isHovered = hovered === c
            const isActive = active === c
            // While opening: stagger entrance.
            // While closing or for in-place state changes: 0ms (instant).
            const entranceDelay = open ? i * SWATCH_STAGGER_MS : 0
            return (
              <div
                key={c}
                style={{
                  width: swatchSize,
                  height: swatchSize,
                  transform: open ? 'scale(1)' : 'scale(0)',
                  opacity: open ? 1 : 0,
                  transitionProperty: 'transform, opacity',
                  transitionDuration: `${SWATCH_DURATION_MS}ms`,
                  transitionTimingFunction: OVERSHOOT_EASE,
                  transitionDelay: `${entranceDelay}ms`,
                }}
              >
                <button
                  type="button"
                  data-color={c}
                  aria-label={`Pick color ${c}`}
                  aria-pressed={isActive}
                  onClick={() => {
                    if (latched) {
                      onPick(c)
                      closeAll()
                    }
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    backgroundColor: c,
                    touchAction: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                  }}
                  className={`h-full w-full rounded-full transition-transform duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    isHovered
                      ? 'scale-125 ring-2 ring-[#1f1814]/85 ring-offset-2 ring-offset-[#fffaf0]'
                      : isActive
                        ? 'ring-2 ring-[#1f1814]/40 ring-offset-2 ring-offset-[#fffaf0]'
                        : 'hover:scale-110'
                  }`}
                />
              </div>
            )
          })}
        </div>
        <div
          aria-hidden
          className="absolute -bottom-1.5 left-2 h-3 w-3 rotate-45 border-r border-b border-[#1f1814]/10 bg-[#fffaf0]"
          style={{
            opacity: open ? 1 : 0,
            transition: `opacity 150ms ease-out`,
            transitionDelay: open ? `${totalSwatchDelay}ms` : '0ms',
          }}
        />
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-label="Open color picker"
        aria-expanded={open}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          backgroundColor: active,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        className="h-14 w-14 rounded-full border border-[#1f1814]/15 shadow-[0_2px_0_var(--color-paper-edge),0_18px_30px_-18px_rgba(31,24,20,0.18)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95"
      />
    </div>
  )
}
