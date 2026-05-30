"use client"

import Sidebar from "@/components/layout/sidebar"
import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import { useAppStore } from "@/lib/store"
import { getNavItemsForUser } from "@/lib/navigation"
import { cn } from "@/lib/utils"

export default function SourcingLayout({ children }: { children: React.ReactNode }) {
  const currentUser = useAppStore(state => state.currentUser)
  const permissions = useAppStore(state => state.rolePermissions) || {}
  const isMinimized = useAppStore(state => state.isSidebarMinimized)
  
  const userKeys = permissions[currentUser?.role || ''] || [];
  const navItems = getNavItemsForUser(userKeys as any);

  return (
    <AuthGuard allowedRoles={['sourcing', 'ceo', 'super_admin', 'cmo', 'admin_po']}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-x-hidden">
        {/* Sidebar di Kiri */}
        <Sidebar roleName={currentUser?.role?.replace('_', ' ') || 'Sourcing'} />

        <div className={cn(
          "flex-1 flex flex-col transition-all duration-500 min-w-0 px-4 md:px-0 md:pr-4 pb-20 md:pb-6",
          isMinimized ? "md:pl-28" : "md:pl-72"
        )}>
          {/* Main Content Area */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 mt-6 glass-panel mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </main>
        </div>

        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
