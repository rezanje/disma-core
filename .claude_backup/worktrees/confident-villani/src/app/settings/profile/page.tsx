"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Camera, Mail, User as UserIcon, ShieldCheck } from "lucide-react"

export default function ProfilePage() {
  const currentUser = useAppStore(state => state.currentUser)
  const updateUser = useAppStore(state => state.updateUser)
  const setCurrentUser = useAppStore(state => state.setCurrentUser)

  const [name, setName] = useState(currentUser?.name || "")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleUpdateProfile = () => {
    if (!name.trim()) {
      toast.error("Nama tidak boleh kosong")
      return
    }

    setIsSubmitting(true)
    // Update in users list
    updateUser(currentUser!.id, { name })
    // Update local currentUser state
    setCurrentUser({ ...currentUser!, name })
    
    setTimeout(() => {
      setIsSubmitting(false)
      toast.success("Profile updated successfully")
    }, 500)
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-black text-slate-800">Account Profile</h3>
        <p className="text-xs text-slate-500 font-medium">Update your digital identity and contact info.</p>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-slate-50/50 border border-slate-100">
        <div className="relative group">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-600 to-green-400 flex items-center justify-center text-3xl text-white font-black shadow-lg">
            {currentUser?.name?.charAt(0) || 'U'}
          </div>
          <button className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-slate-600 hover:text-emerald-600 transition-colors border">
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center sm:text-left space-y-1">
          <h4 className="font-black text-slate-800 uppercase tracking-wide">{currentUser?.name}</h4>
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[9px] font-black uppercase tracking-widest">{currentUser?.role}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Verified Account
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 max-w-xl">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Full Name</Label>
          <div className="relative">
             <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="pl-10 h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-emerald-500 transition-all font-medium"
                placeholder="Enter your name"
             />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Address (Read Only)</Label>
          <div className="relative opacity-60 cursor-not-allowed">
             <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <Input 
                value={currentUser?.id + "@disma.id"} 
                readOnly
                className="pl-10 h-12 rounded-xl bg-slate-50 border-transparent font-medium cursor-not-allowed"
             />
          </div>
        </div>

        <div className="pt-4">
           <Button 
             onClick={handleUpdateProfile}
             disabled={isSubmitting}
             className="h-12 px-8 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 transition-all shadow-lg shadow-slate-200"
           >
             {isSubmitting ? "Updating..." : "Save Changes"}
           </Button>
        </div>
      </div>
    </div>
  )
}
