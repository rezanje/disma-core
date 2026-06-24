"use client"

import { useAppStore } from "@/lib/store"
import AuthGuard from "@/components/auth/auth-guard"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useState, useEffect } from "react"
import { TrendingUp, Save, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { ClientPriceTier } from "@/types"

export default function PricingSettingsPage() {
  const tierMargins = useAppStore(state => state.tierMargins) || {
    'Standard': 0,
    'Tier 1': 50,
    'Tier 2': 30,
    'Tier 3': 20,
    'Tier 4': 15,
    'Tier 5': 10,
    'Custom': 0
  }
  const updateTierMargins = useAppStore(state => state.updateTierMargins)

  const [margins, setMargins] = useState<Record<string, number>>({
    'Tier 1': 50,
    'Tier 2': 30,
    'Tier 3': 20,
    'Tier 4': 15,
    'Tier 5': 10,
  })

  useEffect(() => {
    if (tierMargins) {
      setMargins({
        'Tier 1': tierMargins['Tier 1'] ?? 50,
        'Tier 2': tierMargins['Tier 2'] ?? 30,
        'Tier 3': tierMargins['Tier 3'] ?? 20,
        'Tier 4': tierMargins['Tier 4'] ?? 15,
        'Tier 5': tierMargins['Tier 5'] ?? 10,
      })
    }
  }, [tierMargins])

  const handleSave = async () => {
    try {
      const payload: Record<ClientPriceTier, number> = {
        'Standard': 0,
        'Tier 1': margins['Tier 1'] ?? 50,
        'Tier 2': margins['Tier 2'] ?? 30,
        'Tier 3': margins['Tier 3'] ?? 20,
        'Tier 4': margins['Tier 4'] ?? 15,
        'Tier 5': margins['Tier 5'] ?? 10,
        'Custom': 0
      }
      await updateTierMargins(payload)
      toast.success("Konfigurasi margin tier berhasil disimpan!")
    } catch (err: any) {
      toast.error("Gagal menyimpan margin: " + err.message)
    }
  }

  return (
    <AuthGuard allowedRoles={['super_admin']}>
      <div className="space-y-6 pb-20 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Link href="/admin/settings">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-slate-100">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-3 text-slate-800">
              <TrendingUp className="text-emerald-600 w-8 h-8" /> Pricing Margins
            </h2>
            <p className="text-slate-500 font-medium text-sm">
              Atur persentase margin bawaan (default) terhadap HPP barang untuk setiap pricing tier.
            </p>
          </div>
        </div>

        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardHeader className="p-8 border-b border-slate-50">
            <CardTitle className="text-xl font-black text-slate-900">Tier Margin Setup</CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Rumusan margin penawaran harga client
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-4">
              {['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'].map((tier) => {
                const labels: Record<string, string> = {
                  'Tier 1': 'Tier 1 / B2C (Standard +50%)',
                  'Tier 2': 'Tier 2 / General (Standard +30%)',
                  'Tier 3': 'Tier 3 / Cash (Standard +20%)',
                  'Tier 4': 'Tier 4 / Bottom (Standard +15%)',
                  'Tier 5': 'Tier 5 / Special Request (Standard +10%)',
                }
                return (
                  <div key={tier} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                    <div>
                      <Label htmlFor={`margin-${tier}`} className="text-xs font-black uppercase text-slate-700 tracking-wider">
                        {labels[tier] || tier}
                      </Label>
                      <p className="text-[10px] text-slate-400 mt-0.5">Margin default dihitung dari base HPP barang.</p>
                    </div>
                    <div className="relative">
                      <Input
                        id={`margin-${tier}`}
                        type="number"
                        min="0"
                        max="1000"
                        value={margins[tier] ?? 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setMargins(prev => ({ ...prev, [tier]: val }))
                        }}
                        className="h-11 rounded-xl border-slate-200 pr-12 font-bold font-mono text-slate-700"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <Button onClick={handleSave} className="bg-slate-900 border-none rounded-xl h-11 px-6 shadow-xl text-white font-bold hover:bg-slate-800">
                <Save className="w-4 h-4 mr-2" /> Simpan Margin
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  )
}
