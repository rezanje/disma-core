"use client"

import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import Sidebar from "@/components/layout/sidebar"
import Topbar from "@/components/layout/topbar"
import { LineChart, ArrowRightLeft, ScrollText, PieChart, RefreshCw, Landmark, ShieldCheck, Banknote, ShoppingBag, Wallet, Package } from "lucide-react"
import { usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

import { getNavItemsForUser } from "@/lib/navigation"

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentUser = useAppStore(state => state.currentUser)
  const permissions = useAppStore(state => state.rolePermissions) || {}
  
  const userKeys = permissions[currentUser?.role || ''] || [];
  
  const navItems = getNavItemsForUser(userKeys as any);

  const activeTitle = navItems.find(n => n.href === pathname)?.title || "Finance Dashboard"

  return (
    <AuthGuard allowedRoles={['finance', 'ceo', 'super_admin', 'cmo']}>
      <div className="flex flex-col min-h-screen relative pb-16 md:pb-0 font-bold overflow-x-hidden">
        <div className="flex-1 flex flex-col min-h-screen transition-all duration-300 items-center pt-4">
          <div className="w-full max-w-[calc(100vw-2rem)] px-2 z-50">
             <Topbar title={activeTitle} navItems={navItems} displayAllNav />
          </div>
          <main className="flex-1 p-4 md:p-6 bg-slate-50 dark:bg-slate-900 w-full max-w-[calc(100vw-2rem)] mt-4 glass-panel mb-4 overflow-x-hidden">
            {children}
          </main>
        </div>
        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
