"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useAppStore } from "@/lib/store"

export default function StoreSync() {
  const isLoginPage = usePathname() === '/login'
  const init = useAppStore(state => state.init)
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      try {
        const response = await fetch('/api/auth/session', {cache:'no-store',credentials:'same-origin'})
        if(disposed) return
        if(!response.ok) {
          useAppStore.getState().setServerSession(null)
          return
        }
        const {user} = await response.json()
        if(disposed || !user) return
        useAppStore.getState().setServerSession(user)
        await init()
      } catch { /* Retain the last read state; APIs still fail closed. */ }
    }
    // No data reads or persistence until the server has verified the session.
    void refresh()
    const bc = new BroadcastChannel('disma_core_sync')
    bc.onmessage = event => {
      if (event.data?.type === 'SYNC_UPDATE' && Date.now() >= (useAppStore.getState()._ignoreBroadcastUntil || 0)) void refresh()
    }
    const pollInterval=setInterval(()=>{
      if(!useAppStore.getState().isSyncing) void refresh()
    },60000)
    return ()=>{
      disposed=true
      bc.close()
      clearInterval(pollInterval)
    }
    // Leaving login starts the first read; ordinary menu changes use the
    // existing snapshot. Polls and broadcasts keep it fresh in the background.
  },[init,isLoginPage])
  return null
}
