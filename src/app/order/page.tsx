"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { Search, Store, ArrowRight, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { motion } from "framer-motion"

export default function OrderLandingPage() {
  const router = useRouter()
  const clients = useAppStore(state => state.clients)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredClients = useMemo(() => {
    if (!searchTerm) return clients.slice(0, 5)
    return clients.filter(c => 
      c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.picName.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 10)
  }, [clients, searchTerm])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-100 via-slate-50 to-white">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-20 h-20 bg-emerald-600 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-xl shadow-emerald-200"
          >
            <Store className="w-10 h-10" />
          </motion.div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Portal Order</h1>
            <p className="text-slate-500 font-medium">Silakan pilih nama perusahaan Anda untuk mulai belanja.</p>
          </div>
        </div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <div className="relative">
            <Input 
              placeholder="Cari nama perusahaan..."
              className="h-14 bg-white border-slate-200 rounded-2xl pl-12 shadow-lg focus:ring-emerald-500/20 text-lg font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          </div>

          <div className="space-y-3">
            {filteredClients.map((client, idx) => (
              <motion.div
                key={client.id}
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 + (idx * 0.05) }}
              >
                <Card 
                  className="group hover:border-emerald-500 cursor-pointer transition-all active:scale-[0.98] border-none shadow-md overflow-hidden"
                  onClick={() => router.push(`/order/${client.id}`)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4 bg-white group-hover:bg-emerald-50/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 group-hover:bg-white flex items-center justify-center text-slate-400 group-hover:text-emerald-600 transition-colors">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-slate-800 group-hover:text-emerald-900 transition-colors">{client.companyName}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{client.picName}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            
            {filteredClients.length === 0 && (
              <div className="p-12 text-center text-slate-400 font-medium bg-white/50 rounded-3xl border border-dashed">
                Perusahaan tidak ditemukan.
              </div>
            )}
          </div>
        </motion.div>

        <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
          Powered by Disma Core v2.0
        </p>
      </div>
    </div>
  )
}
