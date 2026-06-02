"use client"

import { useState, useEffect, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import type { AppTask } from "@/types"

export interface TaskNotif {
  id: string
  title: string
  message: string
  createdAt: string
  read: boolean
  href: string
}

const isAssignedToUser = (t: AppTask, userId: string) =>
  t.assignedToId === userId ||
  (Array.isArray(t.assignedToIds) && t.assignedToIds.includes(userId))

const isOpen = (t: AppTask) => t.status !== "Done" && t.status !== "Cancelled"

/**
 * Derives notification items live from the tasks list: every open task currently
 * assigned to the logged-in user. Robust against reassignment and pre-existing
 * tasks — no dependency on separate notification rows surviving sync.
 *
 * "Read" state is tracked per-user in localStorage (which task ids have been seen).
 */
export function useTaskNotifications() {
  const tasks = useAppStore((state) => state.tasks)
  const currentUser = useAppStore((state) => state.currentUser)
  const [seen, setSeen] = useState<string[]>([])

  const storageKey = currentUser ? `task-notif-seen-${currentUser.id}` : null

  useEffect(() => {
    if (!storageKey) {
      setSeen([])
      return
    }
    try {
      const raw = window.localStorage.getItem(storageKey)
      setSeen(raw ? JSON.parse(raw) : [])
    } catch {
      setSeen([])
    }
  }, [storageKey])

  const assigned = (tasks || []).filter(
    (t) => currentUser != null && isAssignedToUser(t, currentUser.id) && isOpen(t)
  )

  const items: TaskNotif[] = assigned
    .map((t) => ({
      id: t.id,
      title: t.title,
      message:
        t.description ||
        `Priority: ${t.priority}${t.dueDate ? ` · Due ${new Date(t.dueDate).toLocaleDateString()}` : ""}`,
      createdAt: t.createdAt,
      read: seen.includes(t.id),
      href: "/tasks",
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const unreadCount = items.filter((i) => !i.read).length

  const persist = useCallback(
    (ids: string[]) => {
      if (!storageKey) return
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(ids))
      } catch {
        /* ignore quota / unavailable storage */
      }
    },
    [storageKey]
  )

  const markAllRead = useCallback(() => {
    const ids = assigned.map((t) => t.id)
    setSeen(ids)
    persist(ids)
  }, [assigned, persist])

  const markRead = useCallback(
    (id: string) => {
      setSeen((prev) => {
        if (prev.includes(id)) return prev
        const next = [...prev, id]
        persist(next)
        return next
      })
    },
    [persist]
  )

  return { items, unreadCount, markAllRead, markRead }
}
