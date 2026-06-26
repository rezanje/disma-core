# Design Spec: Move Global Undo Button Inline on Sales Orders Page

Move the floating global undo button to be an inline button next to the "+ New Sales Order" button in the header of the Sales Orders page.

## Requirements & Behavior

1. **Inline Placement**: On `/admin/sales-orders`, the undo button should not float at the bottom-right. Instead, it must render inline in the header, to the left of the "+ New Sales Order" button.
2. **Global Floating Button**: On all other admin/finance/sourcing/warehouse/courier pages, the undo button will continue to float at the bottom-right as it currently does.
3. **Styling Consistency**: The inline undo button must have a height of `h-10` and use `rounded-xl` borders to align with the "+ New Sales Order" button. It should use an outline variant with a slate border and support loading/disabled states gracefully.

## Proposed Changes

### Component: `src/components/global-undo-button.tsx`
- Add `inline?: boolean` prop.
- If `inline` is true:
  - Render with inline styling (`h-10 px-4 rounded-xl border`).
- If `inline` is false (default):
  - Do path validation.
  - Hide if pathname matches `/admin/sales-orders`.
  - Render with floating styling (`fixed bottom-6 right-6 z-[9999] h-12 px-5 rounded-full`).

### Page: `src/app/admin/sales-orders/page.tsx`
- Import `GlobalUndoButton`.
- Wrap both the `GlobalUndoButton` (with `inline` prop) and the `Dialog` (with "+ New Sales Order" button trigger) in a flex container:
  ```tsx
  <div className="flex items-center gap-2">
    <GlobalUndoButton inline />
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* ... */}
    </Dialog>
  </div>
  ```

## Verification
- Load `/admin/sales-orders` and verify that the global floating button is not shown.
- Verify the new outline inline undo button is rendered next to "+ New Sales Order".
- Make changes (e.g. create a sales order, delete one) and verify the undo button updates its state (enables/shows counts) and works correctly when clicked.
- Go to another allowed page (e.g., `/admin/shopping-list` or `/admin/clients`) and verify the floating undo button is still present in the bottom-right.
