"use client"

import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import Sidebar from "@/components/layout/sidebar"
import Topbar from "@/components/layout/topbar"
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
  const navItems = getNavItemsForUser(userKeys as any);

  const activeTitle = navItems.find(n => n.href === pathname)?.title || "Gudang Dashboard"

  return (
    <AuthGuard allowedRoles={['gudang', 'ceo', 'super_admin', 'cmo', 'admin_po']}>
      <div className="flex flex-col min-h-screen relative pb-16 md:pb-0">
        <div className="flex-1 flex flex-col min-h-screen transition-all duration-300 items-center pt-4 px-2">
          <div className="w-full max-w-[calc(100vw-2rem)] z-50">
             <Topbar title={activeTitle} navItems={navItems} />
          </div>
          <main className="flex-1 p-4 md:p-6 bg-slate-50 dark:bg-slate-900 w-full max-w-[calc(100vw-2rem)] mt-4 shadow-2xl glass-panel mb-4 overflow-x-hidden">
            {children}
          </main>
        </div>
        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
