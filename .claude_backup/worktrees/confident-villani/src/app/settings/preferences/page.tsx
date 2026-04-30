"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Sun, Moon, Laptop, Volume2, Bell, Eye } from "lucide-react"
import { cn } from "@/lib/utils"

export default function PreferencesPage() {
  const { theme, setTheme } = useTheme()
  const [notifications, setNotifications] = useState(true)
  const [sounds, setSounds] = useState(false)
  const [highContrast, setHighContrast] = useState(false)

  const THEMES = [
    { id: "light", title: "Light", icon: <Sun className="w-4 h-4" /> },
    { id: "dark", title: "Dark", icon: <Moon className="w-4 h-4" /> },
    { id: "system", title: "System", icon: <Laptop className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-black text-slate-800">Application Preferences</h3>
        <p className="text-xs text-slate-500 font-medium">Customize how the application looks and behaves.</p>
      </div>

      {/* Theme Selector */}
      <div className="space-y-4">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Interface Theme</Label>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                theme === t.id 
                  ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200" 
                  : "bg-white text-slate-400 border-slate-100 hover:border-slate-300"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                theme === t.id ? "bg-white/10" : "bg-slate-50"
              )}>
                {t.icon}
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider">{t.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400">
                 <Bell className="w-5 h-5" />
              </div>
              <div>
                 <p className="text-xs font-black text-slate-800">Push Notifications</p>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Receive alerts for new tasks</p>
              </div>
           </div>
           <Switch checked={notifications} onCheckedChange={setNotifications} />
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400">
                 <Volume2 className="w-5 h-5" />
              </div>
              <div>
                 <p className="text-xs font-black text-slate-800">System Sounds</p>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Audio cues for critical actions</p>
              </div>
           </div>
           <Switch checked={sounds} onCheckedChange={setSounds} />
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400">
                 <Eye className="w-5 h-5" />
              </div>
              <div>
                 <p className="text-xs font-black text-slate-800">High Contrast</p>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Optimize for visual accessibility</p>
              </div>
           </div>
           <Switch checked={highContrast} onCheckedChange={setHighContrast} />
        </div>
      </div>

      <div className="pt-4 border-t flex justify-between items-center">
         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Changes are saved automatically.</p>
         <Button variant="ghost" className="text-xs font-black text-rose-500 hover:text-rose-600 hover:bg-rose-50">Reset to Defaults</Button>
      </div>
    </div>
  )
}
