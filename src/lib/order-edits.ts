// Which lines of an order actually changed while the detail modal was open.
//
// The modal keeps every line's qty and price in local state and writes them back only
// when "Simpan Perubahan" is pressed. Nothing told the user that: the button looked
// identical whether they had typed something or not, and closing the modal threw the
// edits away in silence. Knowing precisely what is dirty is what lets the screen say
// "2 belum disimpan" and stop the close.
//
// Pure — no store, no React — see order-edits.check.ts.

export type StoredLine = { id: string; qty: number; unitPrice: number };
export type EditedLine = { qty: number; price: number };

/** Ids of lines whose qty or price differs from what is stored. */
export function pendingEdits(
  items: StoredLine[],
  editing: Record<string, EditedLine>,
): string[] {
  return (items || [])
    .filter(item => {
      const e = editing?.[item.id];
      if (!e) return false;
      // Number() guards the case where an input hands back a numeric string: "3" and 3
      // are the same order, and flagging them as different would make the warning cry
      // wolf until people click through it without reading.
      return Number(e.qty) !== Number(item.qty) || Number(e.price) !== Number(item.unitPrice);
    })
    .map(item => item.id);
}

export function hasPendingEdits(
  items: StoredLine[],
  editing: Record<string, EditedLine>,
): boolean {
  return pendingEdits(items, editing).length > 0;
}
