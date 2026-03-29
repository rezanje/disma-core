"use client"

import { useAppStore } from "@/lib/store"
import { 
  Bell, 
  Search, 
  Settings, 
  MoreHorizontal, 
  LayoutGrid, 
  LogOut, 
  User as UserIcon,
  ChevronDown,
  CheckSquare,
  Shield
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
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

interface NavItem {
  key: string
  title: string
  href: string
  icon: React.ReactNode
}

export default function Topbar({ title, navItems = [], displayAllNav = false }: { title: string, navItems?: NavItem[], displayAllNav?: boolean }) {
  const currentUser = useAppStore(state => state.currentUser)
  const setCurrentUser = useAppStore(state => state.setCurrentUser)
  const navConfigs = useAppStore(state => state.navConfigs) || {}
  const pathname = usePathname()
  const router = useRouter()

  // Apply custom desktop config if exists
  const role = currentUser?.role || 'default'
  const config = navConfigs[role]?.desktop
  const customOrder = config?.order
  const hiddenKeys = config?.hidden || []
  
  // 1. Filter out hidden items
  const visibleNavItems = navItems.filter(item => !hiddenKeys.includes(item.key))

  // 2. Sort visible items
  const sortedNavItems = [...visibleNavItems].sort((a, b) => {
    if (!customOrder) return 0
    const indexA = customOrder.indexOf(a.title)
    const indexB = customOrder.indexOf(b.title)
    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  // Navigation slicing
  const pillNav = displayAllNav ? sortedNavItems : sortedNavItems.slice(0, 4)
  const moreNav = displayAllNav ? [] : sortedNavItems.slice(4)

  const handleLogout = () => {
    setCurrentUser(null)
    toast.success("Logged out successfully")
    router.push("/login")
  }

  return (
    <header className="liquid-nav-pill flex items-center justify-between gap-4 h-16">
      {/* Logo Section - Now Shrink 0 to keep it visible */}
      <Link href="/" className="flex items-center gap-3 px-2 hover:opacity-80 transition-opacity shrink-0">
        <Image 
          src="/Logo-disma fresh-transparan.png" 
          alt="DISMA Fresh" 
          width={100} 
          height={32} 
          className="object-contain"
        />
      </Link>

      {/* Center Navigation - Now with overflow handling */}
      <nav className={cn(
        "hidden md:flex items-center gap-1 bg-slate-900/5 rounded-full p-1 border border-white/40 overflow-hidden",
        displayAllNav ? "overflow-x-auto scrollbar-hide max-w-[calc(100%-250px)]" : ""
      )}>
        <div className="flex items-center gap-1 min-w-max">
          {pillNav.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link 
                key={item.href}
                href={item.href}
                className={cn(
                  "px-4 py-2 rounded-full text-[10px] font-black transition-all duration-300 whitespace-nowrap",
                  isActive 
                    ? "bg-white text-emerald-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                )}
              >
                <span>{item.title}</span>
              </Link>
            )
          })}
        </div>
        
        {moreNav.length > 0 && !displayAllNav && (
           <DropdownMenu>
             <DropdownMenuTrigger className="px-4 py-2 rounded-full text-xs font-black text-slate-500 hover:text-emerald-600 hover:bg-white/40 transition-all flex items-center gap-2 outline-none shrink-0">
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden lg:inline">All Apps</span>
             </DropdownMenuTrigger>
             <DropdownMenuContent align="center" className="w-56 liquid-card mt-2 p-2 border-none">
               <DropdownMenuGroup>
                 <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2">Full Navigation</DropdownMenuLabel>
                 <DropdownMenuSeparator className="bg-slate-100" />
                 <div className="grid grid-cols-1 gap-1 py-1">
                   {moreNav.map((item) => (
                     <DropdownMenuItem key={item.href} className="p-0 hover:bg-transparent focus:bg-transparent">
                       <Link href={item.href} className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-emerald-50 group transition-all">
                           <div className="w-8 h-8 rounded-xl bg-slate-50 group-hover:bg-white flex items-center justify-center transition-colors">
                             {item.icon}
                           </div>
                           <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-600">{item.title}</span>
                       </Link>
                     </DropdownMenuItem>
                   ))}
                 </div>
               </DropdownMenuGroup>
             </DropdownMenuContent>
           </DropdownMenu>
        )}
      </nav>

      {/* Right Section: Utils & Profile */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1 mr-2 px-1 py-1 rounded-full bg-white/40 border border-white/40">
          <button className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-full transition-all">
            <Search className="w-4 h-4" />
          </button>
          
          <Link href="/tasks" className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-full transition-all relative">
            <CheckSquare className="w-4 h-4" />
          </Link>
          
          <DropdownMenu>
            <DropdownMenuTrigger className="relative p-2 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-full transition-all outline-none">
              <Bell className="w-4 h-4" />
              {useAppStore(state => state.notifications).filter(n => n.userId === currentUser?.id && !n.read).length > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white ring-2 ring-rose-500/20 animate-pulse"></span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 liquid-card mt-2 p-0 border-none overflow-hidden">
               <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Notifications</h4>
                  <button 
                    onClick={() => {
                      useAppStore.getState().notifications
                        .filter(n => n.userId === currentUser?.id && !n.read)
                        .forEach(n => useAppStore.getState().markNotificationRead(n.id))
                    }}
                    className="text-[10px] font-bold text-emerald-600 hover:underline"
                  >
                    Mark all read
                  </button>
               </div>
               <div className="max-h-[300px] overflow-y-auto">
                  {useAppStore(state => state.notifications).filter(n => n.userId === currentUser?.id).length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                       <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                       <p className="text-[10px] font-bold uppercase tracking-widest">No notifications yet</p>
                    </div>
                  ) : (
                    useAppStore(state => state.notifications)
                      .filter(n => n.userId === currentUser?.id)
                      .map((n) => (
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

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-3 pl-2 group cursor-pointer hover:opacity-80 transition-all outline-none">
             <div className="text-right hidden lg:block">
                <p className="text-[11px] font-black text-slate-800 leading-none">{currentUser?.name}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">{currentUser?.role?.replace('_', ' ')}</p>
             </div>
             <div className="h-10 w-10 rounded-full border-2 border-white bg-gradient-to-tr from-emerald-600 to-green-400 flex items-center justify-center text-white font-black shadow-md">
               {currentUser?.name?.charAt(0) || 'U'}
             </div>
             <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-800 transition-colors" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 liquid-card mt-2 p-2 border-none">
             <DropdownMenuGroup>
              <DropdownMenuLabel className="px-3 py-2">
                  <p className="text-xs font-black text-slate-800">{currentUser?.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{currentUser?.role}</p>
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
    </header>
  )
}
