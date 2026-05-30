# Design Spec: Edit User Name in User Management

Improvements to `/admin/users` page to make user editing visible, accessible, and user-friendly by adding explicit "Simpan" (Save) and "Batal" (Cancel) buttons and ensuring proper interaction controls.

## Problem Description
Currently, when a Super Admin or CEO visits `/admin/users`, they see a list of users.
1. The "Edit" (pencil) icon to edit a user's name is hidden under hover (`opacity-0 group-hover:opacity-100`), making it impossible/difficult to discover and use on touch/mobile devices.
2. In the edit state, the only action is a small green checkmark icon (`Check` component) without any text labels. This confuses users as they cannot find an explicit "Save" button.
3. There is no cancellation button in edit mode, making it hard to exit editing state.

## Proposed Changes

### UI & Layout Enhancements in `/admin/users`

We will modify `/src/app/admin/users/page.tsx`:

1. **Always-Visible Edit Trigger**:
   - Change the edit button wrapper to remove the hover dependency so the edit icon is always visible.
   - Position it clearly next to the user's name.

2. **Inline Edit Controls**:
   - Replace the checkmark-only button with a flex container containing:
     - An input box populated with the user's current name.
     - A green **Simpan** button (Emerald color theme) with the text "Simpan".
     - A gray/slate outline **Batal** button with the text "Batal".
   - Use standard Shadcn/Tailwind styles to keep a premium aesthetic consistent with the rest of the application.

3. **Keyboard Controls**:
   - Support `Enter` to save the name.
   - Support `Escape` (Esc) to cancel editing and close the inline input.

4. **Input Validation**:
   - Show an error toast using `toast.error` if the admin tries to save an empty or whitespace-only name.

## Code Design

### Component Level (`src/app/admin/users/page.tsx`)

In the users mapping block:
```tsx
{editingId === user.id ? (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-md">
    <Input 
      value={newName} 
      onChange={(e) => setNewName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") saveName();
        if (e.key === "Escape") setEditingId(null);
      }}
      className="h-8 text-xs font-bold w-full sm:w-48"
      autoFocus 
    />
    <div className="flex items-center gap-1.5 shrink-0">
      <Button 
        size="sm" 
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 text-[11px] px-3.5 rounded-lg" 
        onClick={saveName}
      >
        Simpan
      </Button>
      <Button 
        size="sm" 
        variant="outline" 
        className="border-slate-200 hover:bg-slate-50 text-slate-600 font-bold h-8 text-[11px] px-3.5 rounded-lg" 
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
      className="h-6 w-6 text-slate-400 hover:text-emerald-600 transition-colors"
      onClick={() => startEditing(user)}
    >
       <Edit2 className="w-3 h-3" />
    </Button>
  </div>
)}
```

In `saveName`:
```tsx
const saveName = () => {
  if (!editingId) return;
  if (!newName.trim()) {
    toast.error("Nama karyawan tidak boleh kosong.");
    return;
  }
  updateUser(editingId, { name: newName.trim() });
  setEditingId(null);
  toast.success("Nama berhasil diperbarui.");
}
```

## Verification Plan
1. **Manual Verification**:
   - Go to `/admin/users` in the browser.
   - Verify that each user row has a visible gray edit (pencil) icon next to the user's name.
   - Click/tap the edit icon. Verify that the inline input appears with the "Simpan" and "Batal" buttons.
   - Test changing the name and clicking "Simpan". Verify that the name updates in the UI and the success toast appears.
   - Verify that the database updates successfully.
   - Test changing the name and clicking "Batal". Verify that the edit mode exits and the name remains unchanged.
   - Test pressing `Enter` to save and `Escape` to cancel.
   - Test empty input validation.
