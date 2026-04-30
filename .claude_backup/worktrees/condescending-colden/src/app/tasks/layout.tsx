"use client"

import AuthGuard from "@/components/auth/auth-guard"
import Topbar from "@/components/layout/topbar"
import BottomNav from "@/components/layout/bottom-nav"
import { useAppStore } from "@/lib/store"
import { getNavItemsForUser } from "@/lib/navigation"
import { usePathname } from "next/navigation"

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const rolePermissions = useAppStore(state => state.rolePermissions) || {}
  const role = currentUser?.role || 'default'
  const permissions = rolePermissions[role] || []
  const navItems = getNavItemsForUser(permissions as any)

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24 md:pb-0 flex flex-col items-center pt-4 px-2">
        <div className="w-full max-w-[calc(100vw-2rem)] z-50">
           <Topbar title="Task Tracker" navItems={navItems} displayAllNav />
        </div>
        <main className="w-full max-w-[calc(100vw-2rem)] p-4 md:p-8 mt-4 glass-panel mb-4 overflow-x-hidden">
          {children}
        </main>
        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
