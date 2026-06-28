"use client"

import { Sheet } from "@/components/ui/sheet"
import { useRouter, useSearchParams } from "next/navigation"
import { ReactNode, useState, Suspense } from "react"

export function ClientSheet({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ClientSheetContent>{children}</ClientSheetContent>
    </Suspense>
  )
}

function ClientSheetContent({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (open) return

        setIsOpen(false)
        router.push(`/?${searchParams.toString()}`)
      }}
      modal
    >
      {children}
    </Sheet>
  )
}
