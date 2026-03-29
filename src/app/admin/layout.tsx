"use client"

import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import Sidebar from "@/components/layout/sidebar"
import Topbar from "@/components/layout/topbar"
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

  return (
    <AuthGuard allowedRoles={['admin_po', 'ceo', 'super_admin', 'cmo']}>
      <div className="min-h-screen relative flex flex-col items-center pt-6 pb-20 md:pb-10 px-4">
        {/* Floating Top Navigation */}
        <div className="fixed top-4 z-50 w-full max-w-[calc(100vw-2rem)] px-4">
          <Topbar title={activeTitle} navItems={navItems} displayAllNav />
        </div>

        {/* Main Content Area - Central Glass Panel */}
        <div className="w-full max-w-[calc(100vw-2rem)] mt-24 flex-1 flex flex-col relative z-10 glass-panel animate-in fade-in zoom-in-95 duration-1000">
          <main className="flex-1 p-6 md:p-10 lg:p-12 overflow-x-hidden overflow-y-auto max-h-[calc(100vh-12rem)] scrollbar-hide">
            {children}
          </main>
        </div>

        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
