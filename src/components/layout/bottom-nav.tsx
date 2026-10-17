"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { getActiveNavigation } from "@/lib/navigation-tabs"
import { LogOut, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { useAppStore } from "@/lib/store"
import { GuideButton } from "@/components/onboarding/onboarding"
import { Button } from "@/components/ui/button"
import { logoutSession } from "@/lib/client-session"
import { toast } from "sonner"

interface NavItem {
  key: string
  title: string
  href: string
  icon: React.ReactNode
  children?: {key: string; title: string; href: string}[]
}

interface BottomNavProps {
  items: NavItem[]
}

const MAX_SLOTS = 5

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentUser = useAppStore(state => state.currentUser)
  const navConfigs = useAppStore(state => state.navConfigs) || {}
  const [moreOpen, setMoreOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const setCurrentUser = useAppStore(state => state.setCurrentUser)

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logoutSession()
      setCurrentUser(null)
      setMoreOpen(false)
      router.replace('/login')
    } catch {
      toast.error('Gagal keluar. Coba lagi.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const role = currentUser?.role || 'default'
  const config = navConfigs[role]?.mobile

  const logoutButton = (
    <Button
      type="button"
      variant="outline"
      disabled={isLoggingOut}
      onClick={handleLogout}
      className="w-full justify-start border-rose-200 text-rose-600 hover:bg-rose-50"
    >
      <LogOut className="h-4 w-4" />
      {isLoggingOut ? 'Sedang keluar…' : 'Keluar / Logout'}
    </Button>
  )

  // Hiding navigation links must not remove the only phone logout control.
  if (config?.enabled === false) {
    return (
      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 md:hidden">
        {logoutButton}
      </div>
    )
  }

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

  const activeNavigation = getActiveNavigation(sortedNavItems, pathname, searchParams.toString())
  const isItemActive = (href: string) => activeNavigation?.href === href

  // 3. Split into primary slots + overflow
  // Slot "More" selalu ada — selain menampung kelebihan menu, di situlah tombol
  // Panduan tinggal (sidebar tidak tampil di layar HP). Jadi 4 slot utama + More.
  const primaryItems = sortedNavItems.slice(0, MAX_SLOTS - 1)
  // Every child remains reachable on mobile, including children of primary slots.
  const overflowItems = [...sortedNavItems.slice(MAX_SLOTS - 1),
    ...sortedNavItems.flatMap(parent => (parent.children || []).map(child => ({
      ...child, key: `${parent.key}-${child.key}`, title: `${parent.title}: ${child.title}`, icon: parent.icon,
    })))].filter((item,index,all)=>all.findIndex(other=>other.href===item.href)===index)
  const overflowActive = overflowItems.some(item => isItemActive(item.href))

  return (
    <nav aria-label="Navigasi utama" className="md:hidden fixed bottom-0 left-0 right-0 glass-topbar flex items-stretch justify-around px-2 pb-safe z-50">
      {primaryItems.map((item) => {
        const isActive = activeNavigation?.groupKey === item.key
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-16 space-y-1 transition-colors touch-manipulation min-w-0",
              isActive ? "text-primary" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <div className={cn("transition-colors duration-150", isActive ? "text-primary" : "text-slate-500")}>
              {item.icon}
            </div>
            <span className={cn("max-w-full truncate px-0.5 text-[11.5px] leading-none", isActive ? "font-medium text-primary" : "text-slate-500")}>{item.title}</span>
          </Link>
        )
      })}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            type="button"
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-16 space-y-1 transition-colors touch-manipulation min-w-0",
              overflowActive ? "text-primary" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            )}
          >
            <div className={cn("transition-colors duration-150", overflowActive ? "text-primary" : "text-slate-500")}>
              <MoreHorizontal className="h-5 w-5" />
            </div>
            <span className={cn("text-[11.5px] leading-none", overflowActive ? "font-medium text-primary" : "text-slate-500")}>More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-safe px-4 pt-4 max-h-[85dvh] overflow-y-auto">
            <SheetTitle className="text-sm font-bold  text-slate-800 dark:text-slate-200 mb-4">Menu</SheetTitle>
            {logoutButton}
            <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3">
              {overflowItems.map((item) => {
                const isActive = isItemActive(item.href)
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors touch-manipulation",
                      isActive ? "bg-primary/15 text-primary" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    {item.icon}
                    <span className="text-[11px] font-bold leading-snug tracking-tight text-center break-words">{item.title}</span>
                  </Link>
                )
              })}

              {/* Akses panduan di layar HP — di desktop tombolnya ada di sidebar. */}
              <GuideButton
                showLabel
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation outline-none w-full"
              />
            </div>
          </SheetContent>
      </Sheet>
    </nav>
  )
}
