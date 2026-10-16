"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { Loader2 } from "lucide-react"
import type { Role } from "@/types"
import { canAccessRoute } from "@/lib/access-policy"
interface AuthGuardProps { children:React.ReactNode; allowedRoles?:Role[] }
export default function AuthGuard({children}:AuthGuardProps) {
  const router=useRouter()
  const pathname=usePathname()
  const currentUser=useAppStore(state=>state.currentUser)
  const [verifiedPath,setVerifiedPath]=useState<string|null>(null)
  useEffect(()=>{
    let cancelled=false
    void (async()=>{
      try {
        const response=await fetch('/api/auth/session',{cache:'no-store',credentials:'same-origin'})
        const result=await response.json()
        if(cancelled) return
        if(!response.ok || !result.user) {
          useAppStore.getState().setCurrentUser(null)
          if(pathname!=='/login') router.replace('/login')
          else setVerifiedPath(pathname)
          return
        }
        useAppStore.getState().setCurrentUser(result.user)
        const home=result.user.role==='admin_po' ? '/admin/hari-ini' : result.user.role==='finance' ? '/finance' : '/admin'
        if(pathname==='/login' || !canAccessRoute(result.user.role,pathname)) router.replace(home)
        else setVerifiedPath(pathname)
      } catch {
        if(!cancelled) { useAppStore.getState().setCurrentUser(null); router.replace('/login') }
      }
    })()
    return ()=>{cancelled=true}
  },[pathname,router])
  if(verifiedPath!==pathname || (!currentUser && pathname!=='/login')) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if(currentUser && !canAccessRoute(currentUser.role,pathname)) return null
  return <>{children}</>
}
