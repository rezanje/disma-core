"use client"

import { useEffect, useState } from "react"
import { useAppStore } from "@/lib/store"

export default function HydrationGate({ children }: { children: React.ReactNode }) {
  const isHydrated = useAppStore((state) => state.isHydrated)
  const isSyncing = useAppStore((state) => state.isSyncing)
  const [hasInitialSyncCompleted, setHasInitialSyncCompleted] = useState(false)

  useEffect(() => {
    // If we're hydrated and no longer syncing, mark initial sync as complete
    if (isHydrated && !isSyncing) {
      setHasInitialSyncCompleted(true)
    }
  }, [isHydrated, isSyncing])

  if (!isHydrated || (!hasInitialSyncCompleted && isSyncing)) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="flex flex-col items-center">
            <span className="text-4xl font-black tracking-tighter text-slate-800">disma</span>
            <span className="text-xs font-bold text-emerald-600 tracking-widest uppercase">fresh</span>
          </div>

          {/* Loading animation */}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>

          <p className="text-xs text-slate-400 font-medium">Memuat data...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
