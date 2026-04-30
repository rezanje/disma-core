"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, Settings as SettingsIcon, Bell, Shield, ChevronRight, LayoutGrid, Target, Cog } from "lucide-react"
import { cn } from "@/lib/utils"
import Sidebar from "@/components/layout/sidebar"
import AuthGuard from "@/components/auth/auth-guard"
import { useAppStore } from "@/lib/store"
import { getNavItemsForUser } from "@/lib/navigation"

interface SettingsLayoutProps {
  children: ReactNode
}

const SETTINGS_NAV = [
  {
    title: "Account Profile",
    description: "Manage your personal information",
    href: "/settings/profile",
    icon: <User className="w-4 h-4" />
  },
  {
    title: "Preferences",
    description: "UI and application behavior",
    href: "/settings/preferences",
    icon: <SettingsIcon className="w-4 h-4" />
  },
  {
    title: "Navigation",
    description: "Re-arrange your navbar items",
    href: "/settings/navigation",
    icon: <LayoutGrid className="w-4 h-4" />
  },
  {
    title: "My KPI",
    description: "Lihat target & performa kamu",
    href: "/settings/kpi",
    icon: <Target className="w-4 h-4" />
  },
  {
    title: "Notifications",
    description: "How you receive alerts",
    href: "/settings/notifications",
    icon: <Bell className="w-4 h-4" />
  },
  {
    title: "Security",
    description: "Password and access control",
    href: "/settings/security",
    icon: <Shield className="w-4 h-4" />
  },
  {
    title: "System & Maintenance",
    description: "Database and Admin Tools",
    href: "/admin/settings",
    icon: <Cog className="w-4 h-4" />,
    adminOnly: true
  }
]

export default function SettingsLayout({ children }: SettingsLayoutProps) {
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
        <Sidebar roleName={currentUser?.role?.replace('_', ' ') || 'Settings'} />

        <div className={cn(
          "flex-1 flex flex-col transition-all duration-500 min-w-0 pr-4",
          isMinimized ? "pl-28" : "pl-72"
        )}>
          <div className="w-full space-y-6 pt-10 pb-20 px-4 flex-1">
            <div className="mb-8">
              <h2 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">Settings</h2>
              <p className="text-sm text-slate-500 font-medium">Manage your account and application preferences.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
              {/* Sidebar Nav */}
              <aside className="w-full md:w-64 shrink-0 space-y-1">
                {SETTINGS_NAV.filter(item => {
                  if ((item as any).adminOnly) {
                    return currentUser?.role === 'super_admin' || currentUser?.role === 'ceo'
                  }
                  return true
                }).map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link 
                      key={item.href} 
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-2xl transition-all duration-200 group",
                        isActive 
                          ? "bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700" 
                          : "hover:bg-white/50 dark:hover:bg-slate-800/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                          isActive ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-700 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        )}>
                          {item.icon}
                        </div>
                        <div>
                          <p className={cn(
                            "text-xs font-black",
                            isActive ? "text-slate-800 dark:text-slate-200" : "text-slate-500"
                          )}>{item.title}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter leading-none mt-0.5">{item.description}</p>
                        </div>
                      </div>
                      <ChevronRight className={cn(
                        "w-3 h-3 transition-transform",
                        isActive ? "text-emerald-500 translate-x-0" : "text-slate-300 -translate-x-1 group-hover:translate-x-0"
                      )} />
                    </Link>
                  )
                })}
              </aside>

              {/* Content Area */}
              <main className="flex-1 min-w-0">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-8 glass-panel animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
