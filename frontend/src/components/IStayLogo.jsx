export default function IStayLogo({ variant = 'blue', className = 'h-8' }) {
  const house = variant === 'white' ? 'white' : '#2563EB'
  const inner = variant === 'white' ? '#1e3a5f' : 'white'
  const text  = variant === 'white' ? 'white' : '#2563EB'

  return (
    <svg viewBox="0 0 185 56" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="iStay">
      {/* Roof */}
      <path d="M27 3L52 22H2L27 3Z" fill={house} />
      {/* House body */}
      <rect x="3" y="20" width="48" height="33" rx="5" fill={house} />
      {/* i — circle head */}
      <circle cx="18" cy="28" r="4.5" fill={inner} />
      {/* i — body */}
      <rect x="14.5" y="34" width="7" height="14" rx="3.5" fill={inner} />
      {/* Door frame */}
      <rect x="28" y="32" width="16" height="21" rx="2.5" fill={inner} opacity="0.9" />
      {/* Door swing open */}
      <path d="M28 32 Q34 30 36 38 L36 53 L28 53Z" fill={house} />
      {/* Knob */}
      <circle cx="41" cy="44" r="1.8" fill={house} />
      {/* wordmark */}
      <text
        x="60" y="42"
        fontSize="28" fontWeight="800"
        fontFamily="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
        letterSpacing="-0.5"
        fill={text}
      >iStay</text>
    </svg>
  )
}
