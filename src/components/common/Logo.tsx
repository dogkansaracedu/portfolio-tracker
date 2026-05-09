interface Props {
  className?: string
  size?: number
}

export default function Logo({ className, size = 24 }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Portfolio Tracker"
    >
      <defs>
        <linearGradient id="pt-logo-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#pt-logo-bg)" />
      <path
        d="M14 46 C 24 46, 28 28, 50 16"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="16" r="4.5" fill="#ffffff" />
    </svg>
  )
}
