import { describe, expect, it } from "vitest"
import { buttonVariants } from "@/components/ui/button"
import { tabsListVariants } from "@/components/ui/tabs"

describe("responsive touch targets", () => {
  it.each(["default", "xs", "sm", "lg"] as const)(
    "keeps the %s button at least 40px tall below the desktop shell breakpoint",
    (size) => {
      expect(buttonVariants({ size })).toContain("max-lg:min-h-10")
    },
  )

  it.each(["icon", "icon-xs", "icon-sm", "icon-lg"] as const)(
    "keeps the %s button at least 40px square below the desktop shell breakpoint",
    (size) => {
      expect(buttonVariants({ size })).toContain("max-lg:size-10")
    },
  )

  it("keeps horizontal tab lists at least 40px tall below the desktop shell breakpoint", () => {
    expect(tabsListVariants({ variant: "default" })).toContain(
      "max-lg:group-data-horizontal/tabs:h-10",
    )
  })
})
