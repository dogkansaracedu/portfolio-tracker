interface Props {
  color: string
  size?: "sm" | "md"
  className?: string
}

const SIZE_CLASS = {
  sm: "size-2.5",
  md: "size-3",
} as const

export function PlatformDot({ color, size = "sm", className }: Props) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${SIZE_CLASS[size]}${className ? ` ${className}` : ""}`}
      style={{ backgroundColor: color }}
    />
  )
}
