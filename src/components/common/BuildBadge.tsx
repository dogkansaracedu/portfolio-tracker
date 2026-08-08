import { BUILD_LABEL, BUILD_TOOLTIP } from "@/lib/constants/build-info"

/** Version + commit of the deployed bundle. Sits at the foot of the desktop
 *  side nav so a glance confirms which build is live. */
export default function BuildBadge() {
  return (
    <span
      title={BUILD_TOOLTIP}
      className="block cursor-default select-all font-mono text-[10px] leading-none tabular-nums text-muted-foreground/70"
    >
      {BUILD_LABEL}
    </span>
  )
}
