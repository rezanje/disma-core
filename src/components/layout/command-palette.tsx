"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { 
  Search, 
  Compass, 
  ShoppingCart, 
  Boxes, 
  Users, 
  FileText, 
  X, 
  CornerDownLeft,
  ArrowUp,
  ArrowDown
} from "lucide-react"
import { APP_PAGES } from "@/lib/navigation"

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpen: () => void
}

export default function CommandPalette({ isOpen, onClose, onOpen }: CommandPaletteProps) {
  const router = useRouter()
  const [mounted, setMounted] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const currentUser = useAppStore(state => state.currentUser)
  const rolePermissions = useAppStore(state => state.rolePermissions) || {}
  const userRole = currentUser?.role || ""
  const userPermissions = rolePermissions[userRole] || []

  const products = useAppStore(state => state.products) || []
  const salesOrders = useAppStore(state => state.salesOrders) || []
  const clients = useAppStore(state => state.clients) || []
  const invoices = useAppStore(state => state.invoices) || []

  // Component mount status
  React.useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Auto-focus input when palette opens
  React.useEffect(() => {
    if (isOpen) {
      setQuery("")
      setActiveIndex(0)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  // Global CMD+K / Ctrl+K and ESC keybind listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (isOpen) {
          onClose()
        } else {
          onOpen()
        }
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onOpen, onClose])

  // Dynamic role-based permissions filtering
  const isPOAllowed = ["admin_po", "sourcing", "gudang", "kurir", "finance", "ceo", "super_admin", "cmo"].includes(userRole)
  const isClientsAllowed = ["admin_po", "sourcing", "finance", "ceo", "super_admin", "cmo"].includes(userRole)
  const isInvoicesAllowed = ["finance", "ceo", "super_admin"].includes(userRole)

  // Map clients for O(1) resolution
  const clientMap = React.useMemo(() => {
    return new Map(clients.map(c => [c.id, c.companyName]))
  }, [clients])

  // Real-time filtered search items
  const queryLower = query.toLowerCase().trim()

  // 1. Menu/Navigasi search
  const filteredNav = React.useMemo(() => {
    if (!userRole) return []
    const matched: { title: string; href: string; category: string; icon: React.ReactNode }[] = []
    
    APP_PAGES.forEach(page => {
      if (userPermissions.includes(page.key)) {
        if (queryLower === "" || page.title.toLowerCase().includes(queryLower)) {
          matched.push({
            title: page.title,
            href: page.href,
            category: "Navigasi",
            icon: page.icon
          })
        }
        
        if (page.children) {
          page.children.forEach(child => {
            if (queryLower === "" || child.title.toLowerCase().includes(queryLower)) {
              if (queryLower !== "" || matched.length < 8) {
                matched.push({
                  title: `${page.title} > ${child.title}`,
                  href: child.href,
                  category: "Navigasi",
                  icon: page.icon
                })
              }
            }
          })
        }
      }
    })
    
    return queryLower === "" ? matched.slice(0, 6) : matched
  }, [userRole, userPermissions, queryLower])

  // 2. Sales Orders search
  const filteredPO = React.useMemo(() => {
    if (!isPOAllowed || queryLower === "") return []
    return salesOrders
      .filter(so => {
        const clientName = clientMap.get(so.clientId) || ""
        return (
          so.poNumber.toLowerCase().includes(queryLower) ||
          clientName.toLowerCase().includes(queryLower)
        )
      })
      .map(so => ({
        title: `${so.poNumber} (${clientMap.get(so.clientId) || "Unknown Client"})`,
        href: `/admin/sales-orders?detailId=${so.id}`,
        category: "Sales Order (PO)",
        icon: <ShoppingCart className="w-4 h-4 text-blue-500" />
      }))
  }, [isPOAllowed, queryLower, salesOrders, clientMap])

  // 3. Products search
  const filteredProducts = React.useMemo(() => {
    if (queryLower === "") return []
    return products
      .filter(p => 
        p.name.toLowerCase().includes(queryLower) ||
        p.skuCode.toLowerCase().includes(queryLower)
      )
      .map(p => ({
        title: `${p.name} [SKU: ${p.skuCode}]`,
        href: `/warehouse/catalog?detailId=${p.id}`,
        category: "Produk (SKU)",
        icon: <Boxes className="w-4 h-4 text-orange-500" />
      }))
  }, [queryLower, products])

  // 4. Clients search
  const filteredClients = React.useMemo(() => {
    if (!isClientsAllowed || queryLower === "") return []
    return clients
      .filter(c => 
        c.companyName.toLowerCase().includes(queryLower) ||
        c.picName.toLowerCase().includes(queryLower)
      )
      .map(c => ({
        title: `${c.companyName} (PIC: ${c.picName})`,
        href: `/admin/clients?detailId=${c.id}`,
        category: "Klien (Outlet)",
        icon: <Users className="w-4 h-4 text-green-500" />
      }))
  }, [isClientsAllowed, queryLower, clients])

  // 5. Invoices search
  const filteredInvoices = React.useMemo(() => {
    if (!isInvoicesAllowed || queryLower === "") return []
    return invoices
      .filter(inv => {
        const clientName = clientMap.get(inv.clientId) || ""
        return (
          inv.id.toLowerCase().includes(queryLower) ||
          clientName.toLowerCase().includes(queryLower)
        )
      })
      .map(inv => ({
        title: `${inv.id} - ${clientMap.get(inv.clientId) || "Unknown Client"} (Total: Rp ${inv.totalAmount.toLocaleString()})`,
        href: `/finance/invoices?detailId=${inv.id}`,
        category: "Invoice",
        icon: <FileText className="w-4 h-4 text-purple-500" />
      }))
  }, [isInvoicesAllowed, queryLower, invoices, clientMap])

  // Flattened results list for single list keyboard navigation
  const allResults = React.useMemo(() => {
    return [
      ...filteredNav,
      ...filteredPO,
      ...filteredProducts,
      ...filteredClients,
      ...filteredInvoices
    ]
  }, [filteredNav, filteredPO, filteredProducts, filteredClients, filteredInvoices])

  // Reset active selection index when list changes
  React.useEffect(() => {
    setActiveIndex(0)
  }, [allResults])

  // Handle select action
  const handleSelect = (item: typeof allResults[0]) => {
    onClose()
    router.push(item.href)
  }

  // Handle keyboard events inside dialog popup
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex(prev => (prev + 1) % allResults.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex(prev => (prev - 1 + allResults.length) % allResults.length)
    } else if (e.key === "Enter" && allResults.length > 0) {
      e.preventDefault()
      handleSelect(allResults[activeIndex])
    }
  }

  // Auto-scroll focused item into view
  React.useEffect(() => {
    const listElement = listRef.current
    if (listElement) {
      const activeElement = listElement.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement
      if (activeElement) {
        const listTop = listElement.scrollTop
        const listBottom = listTop + listElement.clientHeight
        const activeTop = activeElement.offsetTop
        const activeBottom = activeTop + activeElement.clientHeight

        if (activeTop < listTop) {
          listElement.scrollTop = activeTop
        } else if (activeBottom > listBottom) {
          listElement.scrollTop = activeBottom - listElement.clientHeight
        }
      }
    }
  }, [activeIndex])

  if (!mounted || !isOpen) return null

  // Helper mapping for category headers
  let currentGroup = ""

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh] p-4">
      {/* Modal Backdrop with deep Glassmorphism */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/65 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      />

      {/* Main Command Palette Card */}
      <div className="relative w-full max-w-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/50 dark:border-slate-800/50 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden max-h-[70vh] backdrop-blur-xl animate-in zoom-in-95 duration-200">
        
        {/* Search Input Bar */}
        <div className="relative flex items-center border-b border-slate-100 dark:border-slate-800/80 px-6 h-16 shrink-0">
          <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0 animate-pulse" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-slate-850 dark:text-slate-100 placeholder-slate-400 focus:outline-none h-full font-semibold border-none ring-0"
            placeholder="Search PO, products, clients, invoices, menu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-flex items-center h-5 select-none rounded bg-slate-100 dark:bg-slate-800 px-1.5 font-mono text-[9px] font-bold text-slate-400 border dark:border-slate-700">
              ESC
            </kbd>
            <button 
              onClick={onClose}
              className="p-1 text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Results Area */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
        >
          {allResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center gap-3">
              <Search className="w-8 h-8 opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest leading-none">No matching results found</p>
              <p className="text-[10px] font-bold text-slate-400/80 mt-0.5">Try searching with a different term</p>
            </div>
          ) : (
            allResults.map((item, index) => {
              const isFirstInGroup = item.category !== currentGroup
              currentGroup = item.category

              return (
                <React.Fragment key={`${item.category}-${item.title}-${index}`}>
                  {isFirstInGroup && (
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-450 dark:text-slate-500 px-3 pt-3 pb-1 border-t border-slate-100/30 dark:border-slate-800/30 first:border-0">
                      {item.category}
                    </div>
                  )}
                  <button
                    data-index={index}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-2xl transition-all flex items-center justify-between text-xs duration-150 group",
                      activeIndex === index
                        ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-450 font-bold border-l-4 border-emerald-500 pl-2 shadow-sm scale-[1.01]"
                        : "text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        {item.category === "Navigasi" ? (
                          <div className={cn(
                            "w-7 h-7 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-550 group-hover:text-emerald-600 transition-colors",
                            activeIndex === index && "bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-600"
                          )}>
                            {item.icon}
                          </div>
                        ) : (
                          item.icon
                        )}
                      </div>
                      <span className="truncate pr-4">{item.title}</span>
                    </div>
                    {activeIndex === index && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    )}
                  </button>
                </React.Fragment>
              )
            })
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-6 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <ArrowUp className="w-3 h-3" />
              <ArrowDown className="w-3 h-3" />
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <CornerDownLeft className="w-2.5 h-2.5" />
              Select
            </span>
          </div>
          <div>
            <span>Total {allResults.length} Items</span>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}
