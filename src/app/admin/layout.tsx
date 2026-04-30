"use client"

import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import Sidebar from "@/components/layout/sidebar"
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Send,
  Users,
  Package,
  Truck,
  CheckSquare
} from "lucide-react"
import { usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

// Base Admin Navigation
import { getNavItemsForUser } from "@/lib/navigation"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const permissions = useAppStore(state => state.rolePermissions) || {}

  const userKeys = permissions[currentUser?.role || ''] || [];
  const navItems = getNavItemsForUser(userKeys as any);
  const activeTitle = navItems.find(n => n.href === pathname)?.title || "Admin Dashboard"

  const isMinimized = useAppStore(state => state.isSidebarMinimized)

  return (
    <AuthGuard allowedRoles={['admin_po', 'ceo', 'super_admin', 'cmo']}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-x-hidden">
        {/* Sidebar di Kiri */}
        <Sidebar roleName={currentUser?.role?.replace('_', ' ') || 'Admin'} />

        <div className={cn(
          "flex-1 flex flex-col transition-all duration-500 min-w-0 pr-4",
          isMinimized ? "pl-28" : "pl-72"
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
