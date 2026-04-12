async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        table: 'purchases', 
        data: { id: 'test-id-123', purchaserId: 'test' } 
      })
    });
    console.log("Purchases sync result:", res.status, await res.text());

    const res2 = await fetch('http://localhost:3000/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        table: 'purchase_items', 
        data: { id: 'test-id-123', purchaseId: 'test', isQCed: true } 
      })
    });
    console.log("PurchaseItems sync result:", res2.status, await res2.text());
  } catch(e) { console.error(e); }
}
run();
