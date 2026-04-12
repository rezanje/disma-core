const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const MOCK_USERS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Bagus (Admin PO)', role: 'admin_po', pin: '1111' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Hilman (Sourcing)', role: 'sourcing', pin: '2222' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Sandi (Inventory)', role: 'gudang', pin: '3333' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Rivai (Logistik)', role: 'kurir', pin: '4444' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Sifa (Admin Finance)', role: 'finance', pin: '5555' },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Reza (Super Admin)', role: 'super_admin', pin: '120194' },
  { id: '77777777-7777-7777-7777-777777777777', name: 'Damar (CEO)', role: 'ceo', pin: '6666' },
  { id: '88888888-8888-8888-8888-888888888888', name: 'Hanif (CMO)', role: 'cmo', pin: '7777' },
  ];

  for (const u of MOCK_USERS) {
    await supabase.from('users').upsert(u);
  }
  console.log("Seeded users!");
}
run();
