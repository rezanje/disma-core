"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { 
  ShieldAlert, 
  Database, 
  ChevronRight, 
  Cog, 
  Lock,
  RefreshCw,
  Users
} from "lucide-react"
import AuthGuard from "@/components/auth/auth-guard"
import { cn } from "@/lib/utils"

const SETTINGS_OPTIONS = [
  {
    title: "Roles & Permissions",
    description: "Manage user roles and their access levels across the application modules.",
    href: "/admin/settings/roles",
    icon: <Users className="w-6 h-6 text-indigo-600" />,
    color: "bg-indigo-50",
    roleRequired: ["super_admin"]
  },
  {
    title: "Database Maintenance",
    description: "Reset stok barang ke 0, bersihkan data transaksi (PO/Order), reset jurnal, dan kontrol database secara menyeluruh.",
    href: "/admin/settings/maintenance",
    icon: <RefreshCw className="h-6 w-6 text-rose-600" />,
    color: "bg-rose-50",
    roleRequired: ["super_admin"]
  }
]

export default function SettingsLandingPage() {
  return (
    <AuthGuard allowedRoles={['super_admin', 'ceo']}>
      <div className="max-w-4xl mx-auto space-y-10 pb-20">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            System Settings <Cog className="w-8 h-8 text-slate-400" />
          </h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest leading-relaxed">
            Centralized control for system security and data integrity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SETTINGS_OPTIONS.map((opt) => (
            <Link key={opt.href} href={opt.href}>
              <Card className="liquid-card border-none bg-white shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700 pointer-events-none" />
                
                <CardHeader className="p-8 relative z-10">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-inner", opt.color)}>
                    {opt.icon}
                  </div>
                  <CardTitle className="text-xl font-black text-slate-900 flex items-center justify-between">
                    {opt.title}
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-900 group-hover:translate-x-1 transition-all" />
                  </CardTitle>
                  <CardDescription className="text-sm font-medium text-slate-500 leading-relaxed mt-2">
                    {opt.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8 pt-0 relative z-10">
                   <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Requires Super Admin</span>
                   </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
           <div className="relative z-10 flex items-center gap-8">
              <div className="w-20 h-20 bg-emerald-500 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                 <ShieldAlert className="w-10 h-10 text-slate-950" />
              </div>
              <div>
                 <h3 className="text-2xl font-black">Security Audit Logs</h3>
                 <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">COMING SOON: Track every administrative change.</p>
              </div>
           </div>
           <button className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all relative z-10 opacity-50 cursor-not-allowed">
              View Audit History
           </button>
        </div>
      </div>
    </AuthGuard>
  )
}
