"use client"

import Sidebar from "@/components/layout/sidebar"
import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import { useAppStore } from "@/lib/store"
import { getNavItemsForUser } from "@/lib/navigation"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const rolePermissions = useAppStore(state => state.rolePermissions) || {}
  const role = currentUser?.role || 'default'
  const permissions = rolePermissions[role] || []
  const navItems = getNavItemsForUser(permissions as any)
  const isMinimized = useAppStore(state => state.isSidebarMinimized)

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-x-hidden">
        {/* Sidebar di Kiri */}
        <Sidebar roleName={currentUser?.role?.replace('_', ' ') || 'Tasks'} />

        <div className={cn(
          "flex-1 flex flex-col transition-all duration-500 min-w-0 pr-4",
          isMinimized ? "pl-28" : "pl-72"
        )}>
          <main className="flex-1 p-4 md:p-6 lg:p-8 mt-6 glass-panel mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </main>
        </div>

        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
