"use client"

import Topbar from "@/components/layout/topbar"

import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import { ClipboardList, Wallet, LogOut } from "lucide-react"

import { useAppStore } from "@/lib/store"
import { getNavItemsForUser } from "@/lib/navigation"

export default function SourcingLayout({ children }: { children: React.ReactNode }) {
  const currentUser = useAppStore(state => state.currentUser)
  const permissions = useAppStore(state => state.rolePermissions) || {}
  
  const userKeys = permissions[currentUser?.role || ''] || [];
  const navItems = getNavItemsForUser(userKeys as any);
  // Mobile-first layout for Tim Sourcing
  return (
    <AuthGuard allowedRoles={['sourcing', 'ceo', 'super_admin', 'cmo', 'admin_po']}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-16 md:pb-0 flex flex-col items-center">
        <div className="w-full max-w-[calc(100vw-2rem)] px-4 pt-4 z-50">
           <Topbar title="Sourcing Dashboard" navItems={navItems} />
        </div>
        
        <main className="w-full max-w-[calc(100vw-2rem)] p-4 md:p-8 lg:p-12 glass-panel mt-4 mb-4">
          {children}
        </main>
        
        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
