async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        table: 'clients', 
        data: { 
          id: 'client-demie-bakmie-bintaro',
          companyName: 'DEMIE BAKMIE BINTARO',
          picName: '-',
          email: '',
          phone: '',
          address: '',
          paymentTermDays: 30,
          createdAt: new Date().toISOString(),
          parentId: 'e89b5d73-2c01-401c-8814-086e8aae589c',
          isBrand: false
        } 
      })
    });
    console.log("Client sync result:", res.status, await res.text());
  } catch(e) { console.error(e); }
}
run();
