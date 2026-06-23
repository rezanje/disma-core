"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Undo2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface GlobalUndoButtonProps {
  inline?: boolean
}

export default function GlobalUndoButton({ inline = false }: GlobalUndoButtonProps) {
  const pathname = usePathname()
  const historyCount = useAppStore(state => state.devHistoryStack.length)
  const isUndoing = useAppStore(state => state.isUndoing)
  const undoDevSnapshot = useAppStore(state => state.undoDevSnapshot)

  // Shopping list page-level bridge
  const shoppingListUndo = useAppStore(state => state.shoppingListUndo)
  const shoppingListHistoryLength = useAppStore(state => state.shoppingListHistoryLength)

  if (!inline) {
    // Only show on admin/finance/sourcing/warehouse/courier routes
    const isAllowedPath = pathname?.startsWith("/admin") || 
                          pathname?.startsWith("/finance") || 
                          pathname?.startsWith("/sourcing") || 
                          pathname?.startsWith("/warehouse") || 
                          pathname?.startsWith("/courier")

    if (!isAllowedPath) return null
    if (pathname?.startsWith("/tri-chess")) return null
    if (pathname === "/admin/sales-orders") return null // Hide floating version on sales-orders page
  }

  const isShoppingList = pathname === "/admin/shopping-list"
  const hasShoppingListHistory = isShoppingList && shoppingListHistoryLength > 0
  const hasGlobalHistory = historyCount > 0
  const canUndo = hasShoppingListHistory || hasGlobalHistory

  const handleUndoAction = async () => {
    if (isUndoing || !canUndo) return
    if (hasShoppingListHistory && shoppingListUndo) {
      shoppingListUndo()
    } else {
      await undoDevSnapshot()
    }
  }

  const titleText = hasShoppingListHistory
    ? `Undo Pemilihan (${shoppingListHistoryLength})`
    : hasGlobalHistory
      ? `Undo Transaksi (${historyCount})`
      : "Undo"

  if (inline) {
    return (
      <Button
        onClick={handleUndoAction}
        disabled={isUndoing || !canUndo}
        variant="outline"
        className={cn(
          "transition-all font-black text-xs uppercase tracking-wider flex items-center gap-2 h-10 px-4 rounded-xl border",
          canUndo 
            ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:scale-105 active:scale-95 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200" 
            : "bg-slate-50 text-slate-300 border-slate-200 dark:bg-slate-950/20 dark:text-slate-600 dark:border-slate-800/10 cursor-not-allowed opacity-50"
        )}
      >
        {isUndoing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : (
          <Undo2 className={cn("h-3.5 w-3.5", canUndo ? "text-emerald-500 animate-pulse" : "text-slate-400")} />
        )}
        <span>{isUndoing ? "Membatalkan..." : titleText}</span>
      </Button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <Button
        size="lg"
        onClick={handleUndoAction}
        disabled={isUndoing || !canUndo}
        className={cn(
          "shadow-2xl transition-all font-black text-xs uppercase tracking-widest flex items-center gap-2 h-12 px-5 rounded-full border",
          canUndo 
            ? "bg-slate-900 text-white border-slate-800 hover:bg-slate-800 hover:scale-105 hover:border-emerald-500/20 active:scale-95" 
            : "bg-slate-200/50 dark:bg-slate-950/20 text-slate-400 border-slate-300/20 dark:border-slate-800/10 opacity-30 cursor-not-allowed"
        )}
      >
        {isUndoing ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : (
          <Undo2 className={cn("h-4 w-4", canUndo ? "text-emerald-400 animate-pulse" : "text-slate-400")} />
        )}
        <span>{isUndoing ? "Membatalkan..." : titleText}</span>
      </Button>
    </div>
  )
}
