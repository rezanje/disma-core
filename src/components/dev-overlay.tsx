"use client"

import React from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { RefreshCcw, Undo2, Ban, Play, Plus } from "lucide-react"
import { runAppendOutstandingSimulation, runResetSimulationScenario } from "@/lib/simulation"

export default function DevOverlay() {
  const [isVisible, setIsVisible] = React.useState(true)
  const [isDev, setIsDev] = React.useState(false)
  const [isRunningResetSimulation, setIsRunningResetSimulation] = React.useState(false)
  const [isRunningAppendSimulation, setIsRunningAppendSimulation] = React.useState(false)

  React.useEffect(() => {
    // Only show on localhost / development
    const hostname = window.location.hostname
    setIsDev(hostname === 'localhost' || hostname === '127.0.0.1')
  }, [])

  const resetSimulation = useAppStore(state => state.resetSimulation)
  const undoDevSnapshot = useAppStore(state => state.undoDevSnapshot)
  const historyCount = useAppStore(state => state.devHistoryStack.length)

  if (!isDev) return null

  // Custom reset that preserves current clients and products
  const handleDevReset = () => {
    resetSimulation()
  }

  const handleUndo = async () => {
    await undoDevSnapshot()
  }

  const handleRunResetSimulation = async () => {
    setIsRunningResetSimulation(true)
    try {
      await runResetSimulationScenario()
    } finally {
      setIsRunningResetSimulation(false)
    }
  }

  const handleRunAppendSimulation = async () => {
    setIsRunningAppendSimulation(true)
    try {
      await runAppendOutstandingSimulation()
    } finally {
      setIsRunningAppendSimulation(false)
    }
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
          className="h-10 rounded-full text-slate-300 hover:text-white hover:bg-white/10 gap-2 font-bold text-xs uppercase tracking-tight disabled:opacity-30"
          disabled={historyCount === 0}
        >
          <Undo2 className="w-4 h-4" />
          Undo {historyCount > 0 && <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px]">{historyCount}</span>}
        </Button>

        <Button 
          onClick={handleRunResetSimulation}
          className="h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white gap-2 font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 disabled:opacity-70"
          disabled={isRunningResetSimulation || isRunningAppendSimulation}
        >
          <Play className="w-4 h-4" />
          {isRunningResetSimulation ? "Menjalankan..." : "Reset + Simulasi"}
        </Button>

        <Button 
          onClick={handleRunAppendSimulation}
          className="h-10 rounded-full bg-sky-500 hover:bg-sky-600 text-white gap-2 font-black text-xs uppercase tracking-widest shadow-lg shadow-sky-500/20 disabled:opacity-70"
          disabled={isRunningResetSimulation || isRunningAppendSimulation}
        >
          <Plus className="w-4 h-4" />
          {isRunningAppendSimulation ? "Menambahkan..." : "Tambah Simulasi"}
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
