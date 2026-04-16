import { cn } from '@/lib/styles'

interface CharCounterProps {
  used: number
  max: number
  className?: string
}

export function CharCounter({ used, max, className }: CharCounterProps) {
  const atLimit = used >= max
  const nearLimit = !atLimit && used >= Math.floor(max * 0.9)
  return (
    <span
      aria-live="polite"
      className={cn(
        'text-[11px] leading-none tabular-nums select-none',
        atLimit ? 'text-red-500' : nearLimit ? 'text-amber-500' : 'text-gray-400',
        className,
      )}
    >
      {used}/{max}
    </span>
  )
}
