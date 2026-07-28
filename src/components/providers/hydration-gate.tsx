"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"

export default function HydrationGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHydrated = useAppStore((state) => state.isHydrated)
  const isSyncing = useAppStore((state) => state.isSyncing)
  const hydratedFromCache = useAppStore((state) => state.hydratedFromCache)
  const [hasInitialSyncCompleted, setHasInitialSyncCompleted] = useState(false)

  useEffect(() => {
    // If we're hydrated and no longer syncing, mark initial sync as complete
    if (isHydrated && !isSyncing) {
      setHasInitialSyncCompleted(true)
    }
  }, [isHydrated, isSyncing])

  if (pathname?.startsWith("/tri-chess")) {
    return <>{children}</>
  }

  // init() flips isHydrated and isSyncing in the same synchronous tick, so the
  // effect above never observes the gap between them — on a cold boot the
  // splash used to stay up for the whole Phase 2 fetch and the localStorage
  // snapshot bought the user nothing. When Phase 1 restored a real cache we
  // render it immediately and let the fetch finish underneath.
  if (!isHydrated || (!hasInitialSyncCompleted && isSyncing && !hydratedFromCache)) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-50 rounded-full blur-[120px] opacity-60" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-50 rounded-full blur-[120px] opacity-60" />
        
        <div className="relative flex flex-col items-center gap-12">
          {/* Main Logo Animation */}
          <div className="flex flex-col items-center relative group">
             <div className="absolute inset-0 bg-emerald-400/20 blur-3xl rounded-full scale-150 animate-pulse" />
             <div className="relative">
                <span className="text-6xl font-black tracking-tighter text-slate-900 drop-shadow-2xl">disma</span>
                <span className="absolute -bottom-4 right-0 text-[10px] font-black text-emerald-600 tracking-[0.4em] uppercase bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 shadow-sm">Core ERP</span>
             </div>
          </div>

          {/* Premium Loading Indicator */}
          <div className="flex flex-col items-center gap-4">
             <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-slate-900 rounded-full animate-[loading-bar_1.2s_ease-in-out_infinite]" />
                <div className="w-1.5 h-10 bg-emerald-500 rounded-full animate-[loading-bar_1.2s_ease-in-out_0.2s_infinite]" />
                <div className="w-1.5 h-6 bg-slate-900 rounded-full animate-[loading-bar_1.2s_ease-in-out_0.4s_infinite]" />
             </div>
             <div className="space-y-1 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Synchronizing Data</p>
                <p className="text-[9px] font-bold text-slate-300 italic">Please wait while we secure your session...</p>
             </div>
          </div>
        </div>

        <style jsx>{`
          @keyframes loading-bar {
            0%, 100% { transform: scaleY(1); opacity: 0.5; }
            50% { transform: scaleY(1.5); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  return <>{children}</>
}
