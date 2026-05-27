async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/db?group=1');
    const data = await res.json();
    const clients = data.clients || [];
    const holycows = clients.filter(c => c.companyName.toLowerCase().includes('holycow'));
    console.log('Frontend Holycow clients:', holycows.map(c => ({
      id: c.id,
      companyName: c.companyName,
      totalOrderJanMay: c.totalOrderJanMay,
      isBrand: c.isBrand,
      parentId: c.parentId
    })));
  } catch (e) {
    console.error(e);
  }
}
main();
