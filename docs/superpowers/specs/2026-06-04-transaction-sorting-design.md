# Design Spec: Cash Transaction Sorting (Sort by Time)

Adding a user-friendly dropdown selector to sort cash transactions by date & time (newest first vs oldest first) in `/finance/cash-bank`.

## Problem Description
Currently, cash transactions in the `History Transaksi Kas` section on `/finance/cash-bank` are sorted by date/time descending (newest first) by default. However, users have no control over this sorting. When they want to view transactions in chronological order (oldest first), they cannot do so. A sorting control is needed to toggle between newest-to-oldest and oldest-to-newest.

## Proposed Changes

### UI & Layout Enhancements in `/finance/cash-bank`

We will modify `/src/app/finance/cash-bank/page.tsx`:

1. **Sort Dropdown Component**:
   - Add a dropdown component (using Shadcn/ui `Select`) to choose the sorting order:
     - "🕒 Terbaru ke Terlama" (Newest first, descending)
     - "🕒 Terlama ke Terbaru" (Oldest first, ascending)
   - Position the dropdown in the header actions bar, aligned nicely next to the Category filter select and Search input.

2. **State Management**:
   - Introduce a new state `sortOrder` initialized to `'desc'`.

3. **Sorting Logic**:
   - Update the `.sort` logic in `filteredTxs` to use the `sortOrder` state and correctly order the items including tiebreaking for transactions on the same date/time.

## Code Design

### State Definition
```tsx
const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
```

### Updated Filtering & Sorting
```tsx
  const filteredTxs = cashTransactions.filter(tx => {
    const matchSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.counterpartName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchBank = selectedBankFilter ? tx.bankAccountId === selectedBankFilter : true;
    const matchCategory = selectedCategoryFilter ? tx.category === selectedCategoryFilter : true;
    return matchSearch && matchBank && matchCategory;
  }).sort((a,b) => {
    const timeA = new Date(a.date).getTime()
    const timeB = new Date(b.date).getTime()
    
    if (sortOrder === 'desc') {
      const dt = timeB - timeA
      if (dt !== 0) return dt
      // Tiebreaker: lower store index = newer (prepend pattern)
      return (txIndex.get(a.id) ?? 0) - (txIndex.get(b.id) ?? 0)
    } else {
      const dt = timeA - timeB
      if (dt !== 0) return dt
      // Tiebreaker: lower store index = newer, so reverse it for ascending
      return (txIndex.get(b.id) ?? 0) - (txIndex.get(a.id) ?? 0)
    }
  })
```

### Dropdown Component placement
```tsx
                  <div className="w-56">
                     <Select 
                        value={selectedCategoryFilter || "all"} 
                        onValueChange={(val) => setSelectedCategoryFilter(val === "all" ? null : val)}
                     >
                       {/* ... */}
                     </Select>
                  </div>
                  
                  {/* Sorting dropdown */}
                  <div className="w-48">
                     <Select 
                        value={sortOrder} 
                        onValueChange={(val) => setSortOrder(val as 'desc' | 'asc')}
                     >
                        <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                           <SelectValue placeholder="Urutkan Waktu" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="desc" className="text-xs">🕒 Terbaru ke Terlama</SelectItem>
                           <SelectItem value="asc" className="text-xs">🕒 Terlama ke Terbaru</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>

                  <div className="relative w-72">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                     {/* ... */}
                  </div>
```

## Verification Plan
1. **Manual Verification**:
   - Open `/finance/cash-bank` in the browser.
   - Verify the presence of the sorting dropdown next to the Category filter.
   - Toggle sorting to "🕒 Terlama ke Terbaru" and verify the list is displayed in ascending chronological order.
   - Toggle back to "🕒 Terbaru ke Terlama" and verify it returns to the default descending chronological order.
   - Verify search and category filters work correctly with both sorting directions.
