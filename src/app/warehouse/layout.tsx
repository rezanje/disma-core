"use client"

import Sidebar from "@/components/layout/sidebar"
import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import { PackageOpen, ArrowRightLeft, ShieldCheck, Search } from "lucide-react"
import { usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

import { getNavItemsForUser } from "@/lib/navigation"

export default function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const permissions = useAppStore(state => state.rolePermissions) || {}
  
  const userKeys = permissions[currentUser?.role || ''] || [];
  const navItems = getNavItemsForUser(userKeys as any, currentUser?.role);

  const isMinimized = useAppStore(state => state.isSidebarMinimized)

  return (
    <AuthGuard allowedRoles={['gudang', 'ceo', 'super_admin', 'cmo', 'admin_po']}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-x-hidden">
        {/* Sidebar di Kiri */}
        <Sidebar roleName={currentUser?.role?.replace('_', ' ') || 'Warehouse'} />

        <div className={cn(
          "flex-1 flex flex-col transition-all duration-150 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6",
          isMinimized ? "md:pl-[60px]" : "md:pl-[212px]"
        )}>
          {/* Main Content Area */}
          <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8 pt-6 pb-6">
            {children}
          </main>
        </div>

        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
