"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { useAppStore } from "@/lib/store"

interface NavItem {
  key: string
  title: string
  href: string
  icon: React.ReactNode
}

interface BottomNavProps {
  items: NavItem[]
}

const MAX_SLOTS = 5

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const navConfigs = useAppStore(state => state.navConfigs) || {}
  const [moreOpen, setMoreOpen] = useState(false)

  const role = currentUser?.role || 'default'
  const config = navConfigs[role]?.mobile

  // If master toggle for mobile is off, don't show BottomNav
  if (config && config.enabled === false) return null

  const customOrder = config?.order
  const hiddenKeys = config?.hidden || []

  // 1. Filter out hidden items
  const visibleNavItems = items.filter(item => !hiddenKeys.includes(item.key))

  // 2. Sort visible items
  const sortedNavItems = [...visibleNavItems].sort((a, b) => {
    if (!customOrder) return 0
    const indexA = customOrder.indexOf(a.title)
    const indexB = customOrder.indexOf(b.title)
    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  const isItemActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  // 3. Split into primary slots + overflow
  // 4 primary slots + 1 "More" = MAX_SLOTS; exactly MAX_SLOTS fills all slots directly
  const needsMore = sortedNavItems.length > MAX_SLOTS
  const primaryItems = needsMore ? sortedNavItems.slice(0, MAX_SLOTS - 1) : sortedNavItems
  const overflowItems = needsMore ? sortedNavItems.slice(MAX_SLOTS - 1) : []
  const overflowActive = overflowItems.some(item => isItemActive(item.href))

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 glass-topbar border-t border-white/20 dark:border-white/5 flex items-stretch justify-around px-2 pb-safe z-50 rounded-t-2xl shadow-2xl">
      {primaryItems.map((item) => {
        const isActive = isItemActive(item.href)
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-16 space-y-1 transition-colors touch-manipulation min-w-0",
              isActive ? "text-primary" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all duration-200", isActive && "bg-primary/20 scale-110 shadow-sm")}>
              {item.icon}
            </div>
            <span className={cn("text-[10px] font-bold leading-none tracking-tight truncate max-w-full px-0.5", isActive ? "text-primary opacity-100" : "opacity-60")}>{item.title}</span>
          </Link>
        )
      })}

      {needsMore && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            type="button"
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-16 space-y-1 transition-colors touch-manipulation min-w-0",
              overflowActive ? "text-primary" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all duration-200", overflowActive && "bg-primary/20 scale-110 shadow-sm")}>
              <MoreHorizontal className="w-5 h-5" />
            </div>
            <span className={cn("text-[10px] font-bold leading-none tracking-tight", overflowActive ? "text-primary opacity-100" : "opacity-60")}>More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-safe px-4 pt-4">
            <SheetTitle className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 mb-4">Menu</SheetTitle>
            <div className="grid grid-cols-3 gap-3 pb-4">
              {overflowItems.map((item) => {
                const isActive = isItemActive(item.href)
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors touch-manipulation",
                      isActive ? "bg-primary/15 text-primary" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    {item.icon}
                    <span className="text-[10px] font-bold leading-none tracking-tight text-center">{item.title}</span>
                  </Link>
                )
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
