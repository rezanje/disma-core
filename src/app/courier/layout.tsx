"use client"

import Topbar from "@/components/layout/topbar"

import AuthGuard from "@/components/auth/auth-guard"
import BottomNav from "@/components/layout/bottom-nav"
import { Truck, ClipboardCheck, ReceiptText } from "lucide-react"
import { useAppStore } from "@/lib/store"
import { getNavItemsForUser } from "@/lib/navigation"

export default function CourierLayout({ children }: { children: React.ReactNode }) {
  const currentUser = useAppStore(state => state.currentUser)
  const permissions = useAppStore(state => state.rolePermissions) || {}
  
  const userKeys = permissions[currentUser?.role || ''] || [];
  const navItems = getNavItemsForUser(userKeys as any);
  // Mobile-first layout for Kurir
  return (
    <AuthGuard allowedRoles={['kurir', 'ceo', 'super_admin', 'cmo']}>
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
        <Topbar title="Courier Dashboard" navItems={navItems} />
        
        <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-6xl mx-auto p-4 md:p-8 lg:p-12">
          {children}
        </main>
        
        <BottomNav items={navItems} />
      </div>
    </AuthGuard>
  )
}
