"use client"

import { useEffect, useRef } from "react"
import { useAppStore } from "@/lib/store"

export default function StoreSync() {
  const init = useAppStore((state) => state.init)
  const saveToHdd = useAppStore((state) => state.saveToHdd)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // 1. Initial load from Supabase
    init()

    // 2. Realtime Listener (Cross-tab)
    const bc = new BroadcastChannel('disma_core_sync');
    bc.onmessage = (event) => {
        if (event.data?.type === 'SYNC_UPDATE') {
            console.log(`[REALTIME-SYNC] Update received for ${event.data.table}. Refreshing UI...`);
            init();
        }
    };

    // 3. Failsafe Polling (Long interval for safety)
    const pollInterval = setInterval(() => {
        const { isSyncing } = useAppStore.getState();
        if (!isSyncing) {
            init();
        }
    }, 60000); // 1 minute failsafe

    // 4. Persistence Listener (Save changes to HDD)
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
        if (state.isSyncing !== prevState.isSyncing) return;
        if (state.currentUser !== prevState.currentUser) return;
        
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
           saveToHdd();
        }, 3000);
    })

    return () => {
        bc.close();
        unsubscribe();
        clearInterval(pollInterval);
        if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, [init, saveToHdd])

  return null
}
