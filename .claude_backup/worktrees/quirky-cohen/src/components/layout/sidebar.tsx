"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  LogOut, PieChart, LineChart, RefreshCw, ScrollText, ArrowRightLeft,
  ShoppingCart, FileText, Package, Users, Truck, Send, Target, Shield, LayoutDashboard, Briefcase,
  ChevronLeft, ChevronRight, Menu, CheckSquare
} from "lucide-react"
import { useAppStore } from "@/lib/store"
import { useRouter } from "next/navigation"

import { getNavItemsForUser } from "@/lib/navigation"

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
  const setCurrentUser = useAppStore(state => state.setCurrentUser)
  const currentUser = useAppStore(state => state.currentUser)
  const rolePermissions = useAppStore(state => state.rolePermissions) || {}
  const isMinimized = useAppStore(state => state.isSidebarMinimized)
  const toggleSidebar = useAppStore(state => state.toggleSidebar)

  const handleLogout = () => {
    setCurrentUser(null)
    router.push("/login")
  }

  const permissions = currentUser?.role ? rolePermissions[currentUser.role] || [] : []
  const renderItems = getNavItemsForUser(permissions as any)

  return (
    <div 
      className={cn(
        "hidden md:flex flex-col fixed left-4 top-1/2 -translate-y-1/2 h-[96vh] liquid-sidebar z-20 transition-all duration-500 py-6",
        isMinimized ? "w-24" : "w-64"
      )}
    >
      <div className={cn("p-6 relative flex items-center", isMinimized ? "justify-center px-0" : "justify-between")}>
        {!isMinimized && (
          <div className="flex flex-col gap-1">
            <Image 
              src="/Logo-disma fresh-transparan.png" 
              alt="DISMA Fresh" 
              width={140} 
              height={50} 
              className="object-contain"
            />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">{roleName}</span>
          </div>
        )}
        {isMinimized && (
          <div className="w-12 h-12 flex items-center justify-center mx-auto">
            <Image 
              src="/Logo-disma fresh-transparan.png" 
              alt="D" 
              width={32} 
              height={32} 
              className="object-contain"
            />
          </div>
        )}
        
        {/* Toggle Button */}
        <button 
          onClick={toggleSidebar}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 right-[-14px] w-7 h-7 bg-white shadow-md rounded-full flex items-center justify-center text-slate-400 hover:text-emerald-600 transition-all hover:scale-110",
            isMinimized && "right-[-12px] hover:translate-x-1"
          )}
        >
          {isMinimized ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-hide">
        <nav className="grid gap-1 px-3">
          {renderItems.map((item, index) => {
            const isActive = pathname === item.href || (
              pathname.startsWith(`${item.href}/`) && 
              !renderItems.some(other => 
                other.href !== item.href && 
                (pathname === other.href || pathname.startsWith(`${other.href}/`)) && 
                other.href.length > item.href.length
              )
            )
            return (
              <Link
                key={index}
                href={item.href}
                className={cn(
                  "flex items-center rounded-full transition-all duration-300 group",
                  isMinimized ? "justify-center w-12 h-12 mx-auto my-2" : "gap-4 px-5 py-3.5 mx-4 my-1 text-sm font-black text-slate-600",
                  isActive
                    ? "liquid-card text-emerald-600 bg-white"
                    : "hover:bg-slate-50 hover:text-emerald-500 border border-transparent"
                )}
                title={isMinimized ? item.title : undefined}
              >
                <div className={cn(isMinimized && !isActive && "text-slate-500 group-hover:text-emerald-600 transition-colors")}>
                  {item.icon}
                </div>
                {!isMinimized && (
                  <span className="truncate">{item.title}</span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="p-4 mt-auto border-t border-slate-100 mx-4">
        <button 
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center rounded-full text-sm font-black transition-all duration-300",
            "text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100",
            isMinimized ? "justify-center w-12 h-12 mx-auto" : "gap-4 px-5 py-3.5"
          )}
          title={isMinimized ? "Logout" : undefined}
        >
          <span className="text-xl emoji-3d">👋</span>
          {!isMinimized && "Logout"}
        </button>
      </div>
    </div>
  )
}
