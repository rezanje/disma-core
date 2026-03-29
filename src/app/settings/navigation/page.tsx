"use client"

import { useAppStore, RoleNavConfig, NavItemConfig } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { GripVertical, ArrowUp, ArrowDown, Save, RotateCcw, Eye, EyeOff, Smartphone, Monitor } from "lucide-react"
import { toast } from "sonner"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { APP_PAGES, getNavItemsForUser } from "@/lib/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export default function NavigationSettings() {
  const currentUser = useAppStore(state => state.currentUser)
  const navConfigs = useAppStore(state => state.navConfigs) || {}
  const updateNavConfig = useAppStore(state => state.updateNavConfig)
  const rolePermissions = useAppStore(state => state.rolePermissions) || {}
  const saveToHdd = useAppStore(state => state.saveToHdd)

  const role = currentUser?.role || 'default'
  const permissions = rolePermissions[role] || []
  const availablePages = getNavItemsForUser(permissions as any)
  
  // Local state for the dynamic editor
  const [config, setConfig] = useState<RoleNavConfig>({
    desktop: { order: [], hidden: [] },
    mobile: { enabled: true, order: [], hidden: [] }
  })

  useEffect(() => {
    const existing = navConfigs[role]
    if (existing) {
      setConfig(existing)
    } else {
      // Default initialization
      const titles = availablePages.map(p => p.title)
      setConfig({
        desktop: { order: titles, hidden: [] },
        mobile: { enabled: true, order: titles, hidden: [] }
      })
    }
  }, [role, navConfigs])

  const handleSave = () => {
    updateNavConfig(role, config)
    toast.success("Navigation settings updated and synced!")
  }

  const handleReset = () => {
    const titles = availablePages.map(p => p.title)
    const newConfig = {
      desktop: { order: titles, hidden: [] },
      mobile: { enabled: true, order: titles, hidden: [] }
    }
    setConfig(newConfig)
    updateNavConfig(role, newConfig)
    toast.info("Navigation reset to defaults.")
  }

  const toggleVisibility = (platform: 'desktop' | 'mobile', key: string) => {
    setConfig(prev => {
      const currentHidden = prev[platform].hidden || []
      const isHidden = currentHidden.includes(key)
      const newHidden = isHidden 
        ? currentHidden.filter(k => k !== key)
        : [...currentHidden, key]
      
      return {
        ...prev,
        [platform]: { ...prev[platform], hidden: newHidden }
      }
    })
  }

  const moveOrder = (platform: 'desktop' | 'mobile', index: number, direction: 'up' | 'down') => {
    setConfig(prev => {
      // 1. Get current visible titles in their current order
      const platformConfig = prev[platform]
      const currentOrder = platformConfig.order.length > 0 ? platformConfig.order : availablePages.map(p => p.title)
      
      // 2. Filter to ONLY include titles that currently exist in availablePages
      const validOrder = currentOrder.filter(title => availablePages.some(p => p.title === title))
      
      // 3. Ensure all current availablePages are in the order (append new ones)
      const missingTitles = availablePages.filter(p => !validOrder.includes(p.title)).map(p => p.title)
      const fullOrder = [...validOrder, ...missingTitles]

      // 4. Perform the swap
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= fullOrder.length) return prev
      
      const newOrder = [...fullOrder]
      const temp = newOrder[index]
      newOrder[index] = newOrder[targetIndex]
      newOrder[targetIndex] = temp
      
      return {
        ...prev,
        [platform]: { ...prev[platform], order: newOrder }
      }
    })
  }

  const renderNavList = (platform: 'desktop' | 'mobile') => {
    const platformConfig = config[platform]
    const rawOrder = platformConfig.order.length > 0 ? platformConfig.order : availablePages.map(p => p.title)
    
    // Normalize order: only valid titles + append new ones
    const validOrder = rawOrder.filter(title => availablePages.some(p => p.title === title))
    const missingItems = availablePages.filter(p => !validOrder.includes(p.title))
    const normalizedOrder = [...validOrder, ...missingItems.map(p => p.title)]

    // Sort availablePages based on the normalized order
    const sortedItems = [...availablePages].sort((a, b) => {
      const idxA = normalizedOrder.indexOf(a.title)
      const idxB = normalizedOrder.indexOf(b.title)
      return idxA - idxB
    })

    return (
      <div className="space-y-3">
        {sortedItems.map((item, index) => {
          const isHidden = platformConfig.hidden?.includes(item.key)
          return (
            <div 
              key={item.key}
              className={cn(
                "flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all group",
                isHidden ? "opacity-50 grayscale bg-slate-50 border-dashed" : "hover:border-emerald-100"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="text-slate-300 group-hover:text-slate-400 transition-colors">
                  <GripVertical className="w-5 h-5" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                    {item.title}
                    {platform === 'desktop' && index < 4 && !isHidden && (
                      <span className="text-[8px] font-black uppercase text-emerald-600 px-2 py-0.5 bg-emerald-100 rounded-full">Pinned</span>
                    )}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.key}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("h-8 w-8 rounded-lg", isHidden ? "text-slate-300" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50")}
                  onClick={() => toggleVisibility(platform, item.key)}
                >
                  {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                
                <div className="w-px h-4 bg-slate-200 mx-1" />

                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                  onClick={() => moveOrder(platform, index, 'up')}
                  disabled={index === 0}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                  onClick={() => moveOrder(platform, index, 'down')}
                  disabled={index === sortedItems.length - 1}
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Navigasi & Menu</h3>
          <p className="text-sm text-slate-500 font-medium">Atur tampilan menu lo secara mandiri untuk HP dan Komputer (Desktop).</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleReset} className="text-slate-500 font-bold hover:text-rose-600 gap-2 rounded-xl border-slate-200">
            <RotateCcw className="w-4 h-4" /> Reset Default
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 h-11 rounded-xl gap-2 shadow-lg shadow-emerald-200">
            <Save className="w-4 h-4" /> Simpan Konfigurasi
          </Button>
        </div>
      </div>

      <Tabs defaultValue="desktop" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-2xl h-auto flex flex-wrap gap-1 mb-6">
          <TabsTrigger value="desktop" className="flex-1 py-3 font-black text-xs uppercase tracking-widest rounded-xl data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm">
            <Monitor className="w-4 h-4 mr-2" /> Desktop View
          </TabsTrigger>
          <TabsTrigger value="mobile" className="flex-1 py-3 font-black text-xs uppercase tracking-widest rounded-xl data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm">
            <Smartphone className="w-4 h-4 mr-2" /> Mobile View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="desktop" className="space-y-6">
          <Card className="border-none shadow-sm bg-blue-50/30">
            <CardHeader className="p-6">
              <CardTitle className="text-sm font-black uppercase text-blue-700 tracking-widest">Desktop Preferences</CardTitle>
              <CardDescription className="text-xs font-medium text-blue-600/70">
                Menu teratas (maksimal 4) akan dipin di bar navigasi utama.
              </CardDescription>
            </CardHeader>
          </Card>
          {renderNavList('desktop')}
        </TabsContent>

        <TabsContent value="mobile" className="space-y-6">
          <Card className="border-none shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="space-y-0.5">
                  <Label className="text-sm font-black text-slate-800">Aktifkan Mobile Bottom Nav</Label>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Tampilkan menu bar di bagian bawah untuk mode HP</p>
                </div>
                <Switch 
                  checked={config.mobile.enabled !== false}
                  onCheckedChange={(val) => setConfig(prev => ({ 
                    ...prev, 
                    mobile: { ...prev.mobile, enabled: val } 
                  }))}
                />
              </div>
            </CardContent>
          </Card>
          
          <div className={cn("space-y-6 transition-opacity duration-300", config.mobile.enabled === false && "opacity-20 pointer-events-none")}>
            <Card className="border-none shadow-sm bg-emerald-50/30">
              <CardHeader className="p-6">
                <CardTitle className="text-sm font-black uppercase text-emerald-700 tracking-widest leading-none">Mobile Preferences</CardTitle>
                <CardDescription className="text-xs font-medium text-emerald-600/70">
                  Urutan dan visibilitas menu khusus untuk tampilan handphone.
                </CardDescription>
              </CardHeader>
            </Card>
            {renderNavList('mobile')}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
