"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Plus, Search, Filter, Truck, Car, Laptop, 
  MapPin, Calendar, Activity, ChevronRight, X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const ASSETS = [
  {
    id: "AST-V-001",
    name: "Daihatsu Grandmax Van",
    type: "Vehicle",
    category: "Delivery",
    status: "Active",
    thumbnail: "/assets/renders/grandmax.png",
    description: "Primary delivery vehicle for urban routes. Highly efficient and reliable.",
    details: {
      plateNumber: "B 1234 DIS",
      lastService: "Feb 15, 2024",
      nextService: "Aug 15, 2024",
      condition: "Excellent",
      location: "Central Warehouse"
    }
  },
  {
    id: "AST-V-002",
    name: "Isuzu Giga Logistics Truck",
    type: "Vehicle",
    category: "Long-haul",
    status: "Maintenance",
    thumbnail: "/assets/renders/truck.png",
    description: "Heavy-duty truck for inter-city logistics and bulk material transport.",
    details: {
      plateNumber: "B 5678 DIS",
      lastService: "Jan 10, 2024",
      nextService: "Scheduled for Tomorrow",
      condition: "Fair (Needs Oil Change)",
      location: "Main Workshop"
    }
  },
  {
    id: "AST-E-001",
    name: "CEO Executive Workstation",
    type: "Equipment",
    category: "Office",
    status: "Active",
    thumbnail: "/assets/renders/laptop.png",
    description: "High-performance workstation setup including MacBook Pro and Studio Display.",
    details: {
      serialNumber: "SN-DISMA-999-HQ",
      assignedTo: "Reza (CEO)",
      purchasedDate: "Nov 20, 2023",
      warrantyUntil: "Nov 20, 2025",
      location: "Headquarters - 12th Floor"
    }
  },
  {
    id: "AST-V-003",
    name: "Operational Grandmax (Backup)",
    type: "Vehicle",
    category: "Standby",
    status: "Active",
    thumbnail: "/assets/renders/grandmax.png",
    description: "Secondary vehicle used for overflow orders or as back-up during maintenance.",
    details: {
      plateNumber: "B 9999 DIS",
      lastService: "Mar 01, 2024",
      nextService: "Sep 01, 2024",
      condition: "Good",
      location: "West Hub"
    }
  }
]

export default function AssetsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [selectedAsset, setSelectedAsset] = useState<typeof ASSETS[0] | null>(null)

  const filteredAssets = ASSETS.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filter === "all" || asset.type.toLowerCase() === filter.toLowerCase()
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            Company Assets
          </h1>
          <p className="text-slate-500 mt-1">Track and manage your physical assets with 3D visualization.</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 rounded-xl px-6">
          <Plus className="mr-2 h-4 w-4" /> Add New Asset
        </Button>
      </div>

      {/* Controls Section */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <Input 
            placeholder="Search assets by name or ID..." 
            className="pl-10 h-12 bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl focus:ring-emerald-500/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'vehicle', 'equipment'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 h-12 rounded-xl text-sm font-semibold capitalize transition-all duration-300 ${
                filter === f 
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-md transform -translate-y-[2px]' 
                  : 'text-slate-500 hover:bg-white/40 dark:hover:bg-slate-900/40'
              }`}
            >
              {f === 'all' ? 'All Assets' : f + 's'}
            </button>
          ))}
        </div>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredAssets.map((asset, index) => (
            <motion.div
              layout
              key={asset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -8 }}
              className="glass-card group cursor-pointer relative overflow-hidden flex flex-col"
              onClick={() => setSelectedAsset(asset)}
            >
              <div className="aspect-[4/3] relative overflow-hidden bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent z-0" />
                <motion.img 
                  src={asset.thumbnail} 
                  alt={asset.name}
                  className="w-full h-full object-contain relative z-10 drop-shadow-2xl"
                  whileHover={{ scale: 1.1, rotate: 2 }}
                />
                <div className="absolute top-4 right-4 z-20">
                  <Badge variant={asset.status === 'Active' ? 'default' : 'secondary'} className={
                    asset.status === 'Active' 
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                      : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  }>
                    {asset.status}
                  </Badge>
                </div>
              </div>
              
              <div className="p-5 flex-1 flex flex-col bg-white dark:bg-slate-900/50">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {asset.id} • {asset.category}
                  </span>
                </div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 transition-colors">
                  {asset.name}
                </h3>
                <p className="text-sm text-slate-500 line-clamp-2 mt-2 mb-4">
                  {asset.description}
                </p>
                <div className="mt-auto flex items-center justify-between text-slate-400 group-hover:text-emerald-600 transition-colors pt-4 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    {asset.type === 'Vehicle' ? <Truck className="h-3.5 w-3.5" /> : <Laptop className="h-3.5 w-3.5" />}
                    {asset.type} Details
                  </span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden border-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl shadow-[0_32px_128px_rgba(0,0,0,0.2)] dark:shadow-[0_32px_128px_rgba(0,0,0,0.4)] rounded-3xl">
          {selectedAsset && (
            <div className="flex flex-col">
              <div className="relative h-[320px] bg-slate-100 dark:bg-slate-950/50 flex items-center justify-center p-6 sm:p-10">
                <button 
                  onClick={() => setSelectedAsset(null)}
                  className="absolute top-4 right-4 z-40 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-xl flex items-center justify-center text-slate-500 hover:text-rose-500 transition-all hover:scale-110 active:scale-95"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 via-transparent to-emerald-500/5 z-0" />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full h-full relative z-10 flex items-center justify-center"
                >
                  <img 
                    src={selectedAsset.thumbnail} 
                    alt={selectedAsset.name}
                    className="max-w-full max-h-full object-contain drop-shadow-[0_20px_50px_rgba(10,180,100,0.3)] pointer-events-none"
                  />
                </motion.div>
              </div>
              
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{selectedAsset.name}</h2>
                    <p className="text-slate-500">Asset ID: {selectedAsset.id}</p>
                  </div>
                  <Badge className="px-4 py-1 rounded-full bg-emerald-100 text-emerald-700 border-none">
                    {selectedAsset.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        <Activity className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Condition</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">{selectedAsset.details.condition}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Location</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">{selectedAsset.details.location}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Last Service</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          {selectedAsset.details.lastService || selectedAsset.details.purchasedDate}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        {selectedAsset.type === 'Vehicle' ? <Car className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                          {selectedAsset.type === 'Vehicle' ? 'Plate Number' : 'Serial Number'}
                        </p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          {selectedAsset.details.plateNumber || selectedAsset.details.serialNumber}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12">
                    Schedule Maintenance
                  </Button>
                  <Button variant="outline" className="flex-1 rounded-xl h-12">
                    View Service History
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
