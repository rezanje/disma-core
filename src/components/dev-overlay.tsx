"use client"

import React from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { RefreshCcw, Undo2, Ban } from "lucide-react"
import { toast } from "sonner"

export default function DevOverlay() {
  const [isVisible, setIsVisible] = React.useState(true)
  const [isDev, setIsDev] = React.useState(false)

  React.useEffect(() => {
    // Only show on localhost / development
    const hostname = window.location.hostname
    setIsDev(hostname === 'localhost' || hostname === '127.0.0.1')
  }, [])

  if (!isDev) return null
  const resetSimulation = useAppStore(state => state.resetSimulation)
  const undoDevSnapshot = useAppStore(state => state.undoDevSnapshot)

  // Custom reset that preserves current clients and products
  const handleDevReset = () => {
    resetSimulation()
  }

  const handleUndo = () => {
    undoDevSnapshot()
  }



  if (!isVisible) return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      <Button 
        variant="outline" 
        size="icon" 
        className="rounded-full shadow-lg bg-slate-900 border-none text-white hover:bg-slate-800"
        onClick={() => setIsVisible(true)}
      >
        <RefreshCcw className="w-4 h-4" />
      </Button>
    </div>
  )

  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-in slide-in-from-right-10 duration-500">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/20 p-2 rounded-[2rem] shadow-2xl flex items-center gap-2 pr-6">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full text-slate-400 hover:text-white"
          onClick={() => setIsVisible(false)}
        >
          <Ban className="w-4 h-4" />
        </Button>
        
        <div className="h-8 w-[1px] bg-white/10" />
        
        <Button 
          onClick={handleUndo}
          variant="ghost"
          className="h-10 rounded-full text-slate-300 hover:text-white hover:bg-white/10 gap-2 font-bold text-xs uppercase tracking-tight"
        >
          <Undo2 className="w-4 h-4" />
          Undo
        </Button>

        <Button 
          onClick={handleDevReset}
          className="h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white gap-2 font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20"
        >
          <RefreshCcw className="w-4 h-4" />
          Reset Simulation
        </Button>
      </div>
    </div>
  )
}
