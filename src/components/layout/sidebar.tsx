"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  LogOut, PieChart, LineChart, RefreshCw, ScrollText, ArrowRightLeft,
  ShoppingCart, FileText, Package, Users, Truck, Send, Target, Shield, LayoutDashboard, Briefcase,
  ChevronLeft, ChevronRight, Menu, CheckSquare, Bell, Search, User as UserIcon, Settings, ChevronDown
} from "lucide-react"
import { useAppStore } from "@/lib/store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

import { getNavItemsForUser } from "@/lib/navigation"
import type { AccessKey } from "@/types"

interface NavItem {
  key: string
  title: string
  href: string
  icon: React.ReactNode
}

interface SidebarProps {
  items?: NavItem[]
  roleName: string
}

export default function Sidebar({ roleName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const currentPathWithQuery = searchParams.toString() 
    ? `${pathname}?${searchParams.toString()}` 
    : pathname
  const setCurrentUser = useAppStore(state => state.setCurrentUser)
  const currentUser = useAppStore(state => state.currentUser)
  const rolePermissions = useAppStore(state => state.rolePermissions) || {}
  const isMinimized = useAppStore(state => state.isSidebarMinimized)
  const toggleSidebar = useAppStore(state => state.toggleSidebar)
  const notifications = useAppStore(state => state.notifications)

  const handleLogout = () => {
    setCurrentUser(null)
    toast.success("Logged out successfully")
    router.push("/login")
  }

  const permissions: AccessKey[] = currentUser?.role ? rolePermissions[currentUser.role] || [] : []
  const initialItems = getNavItemsForUser(permissions)
  const navConfigs = useAppStore(state => state.navConfigs) || {}
  const roleConfig = navConfigs[currentUser?.role || 'default']?.desktop || { order: [], hidden: [] }
  
  // 1. Filter out hidden items
  const visibleItems = initialItems.filter(item => !roleConfig.hidden?.includes(item.key))

  // 2. Sort items based on custom order (by title)
  const allItems = [...visibleItems].sort((a, b) => {
    const order = roleConfig.order || []
    if (order.length === 0) return 0
    const idxA = order.indexOf(a.title)
    const idxB = order.indexOf(b.title)
    if (idxA === -1 && idxB === -1) return 0
    if (idxA === -1) return 1
    if (idxB === -1) return -1
    return idxA - idxB
  })

  // Sub-menu state
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})

  const toggleSubMenu = (e: React.MouseEvent, key: string) => {
    e.preventDefault()
    setExpandedMenus(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Group items by category
  const categories: Record<string, typeof allItems> = {}
  allItems.forEach(item => {
    const cat = item.category || 'Global'
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(item)
  })

  // Sort categories (Admin first, then modules, then Global)
  const catOrder = ['Admin', 'Finance', 'Warehouse', 'Sourcing', 'Courier', 'Global']
  const sortedCatKeys = Object.keys(categories).sort((a, b) => {
    return catOrder.indexOf(a) - catOrder.indexOf(b)
  })

  const CAT_LABELS: Record<string, string> = {
    'Admin': 'Administrator',
    'Finance': 'Financial',
    'Warehouse': 'Inventory',
    'Sourcing': 'Purchasing',
    'Courier': 'Logistics',
    'Global': 'System'
  }

  const userNotifications = notifications.filter(n => n.userId === currentUser?.id)
  const unreadNotifications = userNotifications.filter(n => !n.read)

  return (
    <div 
      className={cn(
        "hidden md:flex flex-col fixed left-4 top-1/2 -translate-y-1/2 h-[96vh] bg-white dark:bg-slate-900 z-20 transition-all duration-500 py-6 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 dark:border-slate-800",
        isMinimized ? "w-20" : "w-64"
      )}
    >
      <div className={cn("px-6 mb-4 relative flex items-center", isMinimized ? "justify-center px-0" : "justify-between")}>
        {!isMinimized && (
          <div className="flex flex-col gap-0.5">
            <Image 
              src="/Logo-disma fresh-transparan.png" 
              alt="DISMA Fresh" 
              width={120} 
              height={40} 
              className="object-contain"
            />
            <span className="text-[9px] uppercase tracking-[0.2em] text-emerald-500 font-black ml-1 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full w-fit">{roleName}</span>
          </div>
        )}
        {isMinimized && (
          <div className="w-10 h-10 flex items-center justify-center mx-auto bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
            <span className="text-xl font-black text-emerald-600">D</span>
          </div>
        )}
        
        {/* Toggle Button */}
        <button 
          onClick={toggleSidebar}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 right-[-12px] w-6 h-6 bg-white dark:bg-slate-800 shadow-lg border border-slate-100 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 transition-all hover:scale-110 z-30",
            isMinimized && "right-[-10px]"
          )}
        >
          {isMinimized ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>

      {/* Utility Section (New) */}
      <div className={cn(
        "px-4 mb-6 flex items-center gap-2",
        isMinimized ? "flex-col" : "justify-between px-6"
      )}>
        <button className={cn(
          "p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl transition-all",
          isMinimized ? "w-10 h-10 flex items-center justify-center" : ""
        )}>
          <Search className="w-4 h-4" />
        </button>
        
        <Link href="/tasks" className={cn(
          "p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl transition-all relative",
          isMinimized ? "w-10 h-10 flex items-center justify-center" : ""
        )}>
          <CheckSquare className="w-4 h-4" />
        </Link>
        
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(
            "relative p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl transition-all outline-none",
            isMinimized ? "w-10 h-10 flex items-center justify-center" : ""
          )}>
            <Bell className="w-4 h-4" />
            {unreadNotifications.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white ring-2 ring-rose-500/20 animate-pulse"></span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isMinimized ? "start" : "center"} side={isMinimized ? "right" : "bottom"} className="w-80 liquid-card p-0 border-none overflow-hidden ml-2">
             <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Notifications</h4>
                <button 
                  onClick={() => {
                    unreadNotifications
                      .forEach(n => useAppStore.getState().markNotificationRead(n.id))
                  }}
                  className="text-[10px] font-bold text-emerald-600 hover:underline"
                >
                  Mark all read
                </button>
             </div>
             <div className="max-h-[300px] overflow-y-auto">
                {userNotifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                     <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                     <p className="text-[10px] font-bold uppercase tracking-widest">No notifications yet</p>
                  </div>
                ) : (
                  userNotifications.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => useAppStore.getState().markNotificationRead(n.id)}
                        className={cn(
                          "p-4 border-b last:border-0 cursor-pointer transition-colors hover:bg-slate-50",
                          !n.read ? "bg-emerald-50/30" : "bg-white"
                        )}
                      >
                        <div className="flex justify-between items-start mb-1">
                           <h5 className="text-[11px] font-black text-slate-800 leading-tight">{n.title}</h5>
                           {!n.read && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug line-clamp-2 mb-2">{n.message}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                )}
             </div>
             <div className="p-3 bg-slate-50/50 border-t text-center">
                <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors">
                   View All Activity
                </button>
             </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 scrollbar-hide px-3 custom-scrollbar">
        {sortedCatKeys.map((catKey) => (
          <div key={catKey} className="mb-6 last:mb-0">
            {!isMinimized && (
              <h4 className="px-4 text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-3 ml-1 text-center md:text-left">
                {CAT_LABELS[catKey] || catKey}
              </h4>
            )}
            <nav className="space-y-1">
              {categories[catKey].map((item, index) => {
                const hasChildren = item.children && item.children.length > 0;
                const isExpanded = expandedMenus[item.key] || pathname.startsWith(item.href);
                const isActive = pathname === item.href || (
                  pathname.startsWith(`${item.href}/`) && 
                  !allItems.some(other => 
                    other.href !== item.href && 
                    (pathname === other.href || pathname.startsWith(`${other.href}/`)) && 
                    other.href.length > item.href.length
                  )
                )
                return (
                  <div key={index} className="space-y-1">
                    <Link
                      href={item.href}
                      onClick={(e) => hasChildren && !isMinimized ? toggleSubMenu(e, item.key) : undefined}
                      className={cn(
                        "flex items-center rounded-2xl transition-all duration-300 group relative",
                        isMinimized ? "justify-center w-12 h-12 mx-auto" : "gap-3 px-4 py-3 text-xs font-bold",
                        isActive && !hasChildren
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none"
                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                        hasChildren && isExpanded && !isMinimized && "bg-slate-50/50 dark:bg-slate-800/30 text-emerald-600 dark:text-emerald-400"
                      )}
                      title={isMinimized ? item.title : undefined}
                    >
                      <div className={cn(
                        "transition-colors",
                        (isActive && !hasChildren) ? "text-white" : "text-slate-400 group-hover:text-emerald-500",
                        hasChildren && isExpanded && !isMinimized && "text-emerald-500"
                      )}>
                        {item.icon}
                      </div>
                      {!isMinimized && (
                        <span className="truncate tracking-tight flex-1">{item.title}</span>
                      )}
                      {!isMinimized && hasChildren && (
                        <div className={cn("transition-transform duration-300", isExpanded ? "rotate-90" : "rotate-0")}>
                           <ChevronRight className="w-3 h-3 opacity-50" />
                        </div>
                      )}
                      {isActive && !isMinimized && !hasChildren && (
                        <div className="absolute right-3 w-1.5 h-1.5 bg-white rounded-full shadow-sm" />
                      )}
                    </Link>

                    {/* Sub-menu rendering */}
                    {!isMinimized && hasChildren && isExpanded && (
                      <div className="ml-9 space-y-1 py-1 border-l-2 border-slate-100 dark:border-slate-800 pl-4 mb-2">
                        {item.children?.map(child => {
                          const isChildActive = currentPathWithQuery === child.href;
                          return (
                            <Link
                              key={child.key}
                              href={child.href}
                              className={cn(
                                "block py-1.5 text-[11px] font-bold transition-all",
                                isChildActive 
                                  ? "text-emerald-600 dark:text-emerald-400" 
                                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              )}
                            >
                              {child.title}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="px-4 mt-auto pt-6 border-t border-slate-100 dark:border-slate-800/50">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full outline-none">
            <div className={cn(
              "flex items-center gap-3 p-2 rounded-2xl transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 group",
              isMinimized ? "justify-center" : "px-3"
            )}>
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-400 flex items-center justify-center text-white font-black shadow-lg shadow-emerald-200/50 dark:shadow-none transition-transform group-hover:scale-105">
                {currentUser?.name?.charAt(0) || 'U'}
              </div>
              {!isMinimized && (
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-none truncate">{currentUser?.name}</p>
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter truncate">{currentUser?.role?.replace('_', ' ')}</p>
                </div>
              )}
              {!isMinimized && <ChevronDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors" />}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side={isMinimized ? "right" : "top"} className="w-56 liquid-card p-2 border-none ml-2 mb-2">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-3 py-2">
                  <p className="text-xs font-black text-slate-800">{currentUser?.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{currentUser?.role}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-100" />
              {(currentUser?.role === 'super_admin' || currentUser?.role === 'ceo') && (
                <Link href="/admin/users">
                  <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-emerald-50 text-emerald-600 cursor-pointer outline-none group">
                      <Shield className="w-4 h-4" />
                      <span className="text-xs font-black uppercase tracking-tight">User & Role Management</span>
                  </DropdownMenuItem>
                </Link>
              )}
              <Link href="/settings/profile">
                <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-50 cursor-pointer outline-none">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-700">Account Settings</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/settings/preferences">
                <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-50 cursor-pointer outline-none">
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-700">Preferences</span>
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem 
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-rose-50 text-rose-600 cursor-pointer"
              >
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-tight">Log Out</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
