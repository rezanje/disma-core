"use client"

import { useAppStore } from "@/lib/store"
import { Megaphone, X, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export default function GlobalAnnouncement() {
  const pathname = usePathname()
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
    <div className="bg-slate-900 text-slate-100 py-2 px-4 duration-150 relative z-[100] border-b border-slate-800">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-1.5 rounded-lg shrink-0">
            <Megaphone className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-sm font-bold tracking-tight leading-tight">
             <span className="opacity-70 mr-2">[BROADCAST]:</span> 
             {announcement.message}
          </p>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[11px] font-bold opacity-50 hidden md:block ">
              {new Date(announcement.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
           </span>
           <Button 
             variant="ghost" 
             size="icon-sm" 
             className="text-slate-300 hover:bg-slate-800 rounded-full h-7 w-7"
             onClick={() => setIsVisible(false)}
           >
             <X className="w-4 h-4" />
           </Button>
        </div>
      </div>
    </div>
  )
}
