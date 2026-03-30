"use client"

import { useEffect, useRef } from "react"
import { useAppStore } from "@/lib/store"

export default function StoreSync() {
  const init = useAppStore((state) => state.init)
  const saveToHdd = useAppStore((state) => state.saveToHdd)
  const isSyncing = useAppStore((state) => state.isSyncing)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // 1. Initial load from HDD
    init()

    // 2. Continuous polling (every 10 seconds)
    const pollInterval = setInterval(() => {
        console.log('Polling latest data from Supabase...');
        init();
    }, 10000);

    // 3. Subscribe to changes
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
        // Skip sync status changes to avoid infinite loops 
        if (state.isSyncing !== prevState.isSyncing) return;
        if (state.currentUser !== prevState.currentUser) return; // Don't save session to HDD
        
        // Debounce: save only after 2s of inactivity
        if (timerRef.current) clearTimeout(timerRef.current);
        
        timerRef.current = setTimeout(() => {
           console.log('Syncing to HDD...');
           saveToHdd();
        }, 2000);
    })

    return () => {
        unsubscribe();
        clearInterval(pollInterval);
        if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, [init, saveToHdd])

  return null
}
