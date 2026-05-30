# Edit User Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve user name editing in the admin user management page by adding explicit "Simpan" and "Batal" buttons, making the edit icon always visible, and supporting keyboard shortcuts (Enter/Escape).

**Architecture:** React state modifications in the page component. Update inline view of name to always display edit trigger, and replace single checkmark button with explicit "Simpan" and "Batal" UI buttons. Add keydown event listeners to the input field.

**Tech Stack:** Next.js, React, Tailwind CSS, Lucide icons, Sonner toast.

---

### Task 1: Update UI and Event Listeners in User Management Page

**Files:**
- Modify: `src/app/admin/users/page.tsx:235-292`

- [ ] **Step 1: Replace edit pencil hover styling and implement Simpan/Batal buttons**

Replace the existing cell rendering for the username column in `src/app/admin/users/page.tsx` around lines 235-292 to:
1. Always display the `Edit2` button by removing the `opacity-0 group-hover:opacity-100 transition-opacity` class.
2. In the editing state, display the edit text input and two buttons: "Simpan" (emerald) and "Batal" (outline).
3. Attach `onKeyDown` to the Input component to handle `Enter` (saveName) and `Escape` (cancel).

```tsx
// Inside users.map(user => ( ... ))
<TableCell>
  {editingId === user.id ? (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-md">
      <Input 
        value={newName} 
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveName();
          if (e.key === "Escape") setEditingId(null);
        }}
        className="h-8 text-xs font-bold w-full sm:w-48 bg-white dark:bg-slate-800"
        autoFocus 
      />
      <div className="flex items-center gap-1.5 shrink-0">
        <Button 
          size="sm" 
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 text-[11px] px-3 rounded-lg transition-colors cursor-pointer" 
          onClick={saveName}
        >
          Simpan
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          className="border-slate-200 hover:bg-slate-50 text-slate-600 font-bold h-8 text-[11px] px-3 rounded-lg dark:border-slate-800 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors cursor-pointer" 
          onClick={() => setEditingId(null)}
        >
          Batal
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div>
        <div className="font-bold text-slate-800 dark:text-slate-200">{user.name}</div>
        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{user.id}</div>
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        onClick={() => startEditing(user)}
      >
         <Edit2 className="w-3 h-3" />
      </Button>
    </div>
  )}
</TableCell>
```

- [ ] **Step 2: Update saveName helper function logic**

Update the `saveName` function at lines 130-136 to validate that the name is not empty or just spaces before saving, showing an error toast if it is.

```tsx
  const saveName = () => {
    if (!editingId) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
      toast.error("Nama karyawan tidak boleh kosong.");
      return;
    }
    updateUser(editingId, { name: trimmedName });
    setEditingId(null);
    toast.success("Nama berhasil diperbarui.");
  }
```

- [ ] **Step 3: Verify build compiles without errors**

Run production build command to check TypeScript and build configurations.
Run: `npm run build`
Expected: Compile finishes successfully without TypeScript/Next.js build errors.

- [ ] **Step 4: Commit changes**

Run:
```bash
git add src/app/admin/users/page.tsx
git commit -m "feat: add user name editing with simpan/batal buttons and key controls"
```
