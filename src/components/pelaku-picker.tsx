"use client"

import { useAppStore } from "@/lib/store"

/**
 * Who actually did this in the field. Shown wherever a transcriber records work that
 * someone else performed — without it every field record is attributed to the typist,
 * and an audit trail that answers "who received these goods" answers with the name of
 * whoever was at the keyboard.
 */
export function PelakuPicker({
  value,
  onChange,
  roles,
  label = "Dikerjakan oleh",
}: {
  value: string
  onChange: (userId: string) => void
  roles: string[]
  label?: string
}) {
  const users = useAppStore(state => state.users)
  const choices = users.filter(u => roles.includes(u.role))
  if (choices.length === 0) return null

  return (
    <div className="mb-3">
      <label className="text-xs font-black text-slate-500 uppercase tracking-wider">{label}</label>
      <select
        className="mt-1 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm font-bold"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Saya sendiri —</option>
        {choices.map(u => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </div>
  )
}
