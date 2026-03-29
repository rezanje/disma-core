"use client"

import { useAppStore } from "@/lib/store"
import { Megaphone, X, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

export default function GlobalAnnouncement() {
  const announcement = useAppStore(state => state.announcement)
  const updateAnnouncement = useAppStore(state => state.updateAnnouncement)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (announcement?.active) {
      setIsVisible(true)
    }
  }, [announcement])

  if (!announcement?.active || !isVisible) return null

  return (
    <div className="bg-emerald-600 text-white py-2 px-4 shadow-xl animate-in slide-in-from-top duration-500 relative z-[100] border-b border-emerald-400">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-1.5 rounded-lg shrink-0">
            <Megaphone className="w-4 h-4 text-white animate-bounce" />
          </div>
          <p className="text-sm font-black tracking-tight leading-tight">
             <span className="opacity-70 mr-2">[BROADCAST]:</span> 
             {announcement.message}
          </p>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[10px] font-bold opacity-50 hidden md:block uppercase tracking-widest">
              {new Date(announcement.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
           </span>
           <Button 
             variant="ghost" 
             size="icon-sm" 
             className="text-white hover:bg-white/10 rounded-full h-7 w-7"
             onClick={() => setIsVisible(false)}
           >
             <X className="w-4 h-4" />
           </Button>
        </div>
      </div>
    </div>
  )
}
