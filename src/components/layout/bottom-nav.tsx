"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

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

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const navConfigs = useAppStore(state => state.navConfigs) || {}
  
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

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 glass-topbar border-t border-white/20 dark:border-white/5 flex items-center justify-around px-2 pb-safe z-50 rounded-t-2xl shadow-2xl">
      {sortedNavItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors touch-manipulation",
              isActive ? "text-primary" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all duration-200", isActive && "bg-primary/20 scale-110 shadow-sm")}>
              {item.icon}
            </div>
            <span className={cn("text-[10px] font-bold leading-none tracking-tight", isActive ? "text-primary opacity-100" : "opacity-60")}>{item.title}</span>
          </Link>
        )
      })}
    </div>
  )
}
