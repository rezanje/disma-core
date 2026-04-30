"use client"

import { useAppStore } from "@/lib/store"
import AuthGuard from "@/components/auth/auth-guard"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ShieldAlert, UserCog, Save, Database, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useState } from "react"
import { Role, AccessKey } from "@/types"
import { RolePermissionMap } from "@/types"

const ROLES_LIST: { id: Role; label: string; desc: string }[] = [
  { id: 'admin_po', label: 'Admin PO', desc: 'Seksi purchasing order admin.' },
  { id: 'sourcing', label: 'Sourcing', desc: 'Tim lapangan pembelanja barang.' },
  { id: 'gudang', label: 'Warehouse / Gudang', desc: 'PIC persediaan fisik dan aset mentah.' },
  { id: 'kurir', label: 'Kurir / Logistik', desc: 'Tim distribusi eksternal.' },
  { id: 'finance', label: 'Finance Staff', desc: 'PIC pembukuan, budget, & laporan laba rugi.' },
  { id: 'ceo', label: 'CEO (Damar)', desc: 'C-Level executive visibility.' },
  { id: 'cmo', label: 'CMO (Hanif)', desc: 'Marketing & sales pipeline oversight.' },
  { id: 'super_admin', label: 'Super Admin', desc: 'Sistem Administrator (High Authority).' },
]

const AVAILABLE_KEYS: { id: AccessKey, label: string, module: string }[] = [
  // Operasional
  { id: 'admin_dashboard', label: 'Admin Dashboard', module: 'Operasional' },
  { id: 'admin_sales_orders', label: 'Sales Orders', module: 'Operasional' },
  { id: 'admin_shopping_list', label: 'Strategic Shopping List', module: 'Operasional' },
  { id: 'sourcing_dashboard', label: 'Sourcing Menu', module: 'Operasional' },
  { id: 'courier_dashboard', label: 'Delivery / Kurir', module: 'Operasional' },
  { id: 'warehouse_dashboard', label: 'Gudang Dashboard', module: 'Logistik' },
  { id: 'warehouse_catalog', label: 'Katalog Barang', module: 'Logistik' },
  
  // Keuangan
  { id: 'finance_dashboard', label: 'Finance Hub', module: 'Keuangan' },
  { id: 'finance_ledger', label: 'Buku Besar / Ledger', module: 'Keuangan' },
  { id: 'finance_cash_bank', label: 'Kas & Bank', module: 'Keuangan' },
  { id: 'finance_budget', label: 'Budgeting PO', module: 'Keuangan' },
  { id: 'finance_online_purchase', label: 'Finance Hub: Online', module: 'Keuangan' },
  
  // Data Strategic
  { id: 'admin_crm', label: 'CRM & Leads Pipeline', module: 'Data Strategic' },
  { id: 'admin_hr', label: 'HR & KPI Performance', module: 'Data Strategic' },
  { id: 'admin_okr', label: 'OKR Mapping', module: 'Data Strategic' },
  { id: 'admin_products', label: 'Master SKU / Product', module: 'Data Strategic' },
  
  // Settings
  { id: 'admin_settings', label: 'Settings: Core Configuration', module: 'Otoritas Super' },
  { id: 'admin_users', label: 'User Management', module: 'Otoritas Super' },
  { id: 'tasks_global', label: 'Global Tasks Board', module: 'Otoritas Super' },
]


export default function RoleSettingsPage() {
  const currentPermissions = useAppStore(state => state.rolePermissions) || {}
  const updateRolePermissions = useAppStore(state => state.updateRolePermissions)
  const saveToHdd = useAppStore(state => state.saveToHdd)
  
  // Local state for UI toggles
  const [localPerms, setLocalPerms] = useState<RolePermissionMap>(currentPermissions)

  const togglePermission = (role: string, key: AccessKey) => {
    setLocalPerms(prev => {
        const currentKeys = prev[role] || [];
        const hasKey = currentKeys.includes(key);
        
        let newKeys: AccessKey[];
        if (hasKey) {
            newKeys = currentKeys.filter(k => k !== key);
        } else {
            newKeys = [...currentKeys, key];
        }

        return {
            ...prev,
            [role]: newKeys
        }
    })
  }

  const handleSave = async () => {
    // Commit local changes to Zustand
    for(const role of Object.keys(localPerms)) {
       updateRolePermissions(role, localPerms[role]);
    }

    try {
        await saveToHdd(); // Persist to db.json
        toast.success("Konfigurasi Hak Akses berhasil disimpan & disinkron ke server.")
    } catch (err) {
        toast.error("Gagal sinkron database ke server.")
    }
  }

  return (
    <AuthGuard allowedRoles={['super_admin']}>
      <div className="space-y-6 pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div>
             <h2 className="text-3xl font-black tracking-tight flex items-center gap-3 text-slate-800">
               <ShieldAlert className="text-rose-600 w-8 h-8" /> Role & Permission Settings
             </h2>
             <p className="text-slate-500 font-medium text-sm">
                Kelola hak akses database, dashboard, dan menu secara modular.
             </p>
           </div>
           <Button onClick={handleSave} className="bg-slate-900 border-none rounded-xl h-11 px-6 shadow-xl text-white font-bold hover:bg-slate-800">
              <Save className="w-4 h-4 mr-2" /> Terapkan & Simpan Permanen
           </Button>
        </div>

        <div className="bg-amber-50 p-4 border border-amber-200 rounded-2xl flex gap-4 text-amber-800">
           <Database className="w-5 h-5 shrink-0" />
           <p className="text-xs font-bold leading-relaxed">
             Centang module yang akan diberikan akses ke setiap role. Halaman yang tidak diijinkan akan otomatis tertutup dan User akan diredirect kembali ke login/blank page apabila mencoba _bypassing_.
           </p>
        </div>

        <div className="space-y-4">
           {ROLES_LIST.map(roleItem => {
              const assignedKeys = localPerms[roleItem.id] || []
              return (
                 <Card key={roleItem.id} className="border-none shadow-sm rounded-3xl overflow-hidden group hover:shadow-lg transition-all focus-within:ring-2 ring-emerald-500">
                    <div className="flex flex-col lg:flex-row bg-white">
                        <div className="lg:w-1/4 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-100 p-6 flex flex-col justify-center">
                            <div className="flex items-center gap-2 mb-2">
                               <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                  <UserCog className="w-4 h-4" />
                               </div>
                               <h3 className="font-black text-slate-800">{roleItem.label}</h3>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium italic">{roleItem.desc}</p>
                            
                            <div className="mt-4 inline-flex px-3 py-1 items-center bg-white border rounded-full text-[10px] font-black uppercase text-slate-400">
                               <ShieldCheck className="w-3 h-3 mr-1 text-emerald-500" /> {assignedKeys.length} Akses Dibuka
                            </div>
                        </div>

                        <div className="lg:w-3/4 p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                               {Array.from(new Set(AVAILABLE_KEYS.map(k => k.module))).map(moduleName => (
                                   <div key={moduleName} className="space-y-3">
                                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-1">
                                          {moduleName}
                                      </h4>
                                      <div className="space-y-2">
                                         {AVAILABLE_KEYS.filter(k => k.module === moduleName).map(keyObj => (
                                             <label key={keyObj.id} className="cursor-pointer flex items-center justify-between p-2 rounded-xl border hover:bg-slate-50 transition-colors">
                                                 <span className="text-xs font-bold text-slate-700">{keyObj.label}</span>
                                                 <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                                    checked={assignedKeys.includes(keyObj.id)}
                                                    onChange={() => togglePermission(roleItem.id, keyObj.id)}
                                                 />
                                             </label>
                                         ))}
                                      </div>
                                   </div>
                               ))}
                            </div>
                        </div>
                    </div>
                 </Card>
              )
           })}
        </div>
      </div>
    </AuthGuard>
  )
}
