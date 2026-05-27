const { createClient } = require('@supabase/supabase-js');

const prodUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const prodKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';

const localUrl = 'https://plzkrzzmqatjgsitvmfd.supabase.co';
const localKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ';

async function check() {
  const prodSupabase = createClient(prodUrl, prodKey);
  const localSupabase = createClient(localUrl, localKey);

  console.log('--- PRODUCTION DATABASE ---');
  try {
    const { data: clients } = await prodSupabase.from('clients').select('id, company_name');
    console.log(`Clients count: ${clients?.length || 0}`);
    if (clients && clients.length > 0) {
      console.log('Sample clients:', clients.slice(0, 10));
    }
    const { count: invoicesCount } = await prodSupabase.from('invoices').select('*', { count: 'exact', head: true });
    console.log(`Invoices count: ${invoicesCount || 0}`);
  } catch (err) {
    console.error('Prod error:', err);
  }

  console.log('\n--- LOCAL DATABASE ---');
  try {
    const { data: clients } = await localSupabase.from('clients').select('id, company_name');
    console.log(`Clients count: ${clients?.length || 0}`);
    if (clients && clients.length > 0) {
      console.log('Sample clients:', clients.slice(0, 10));
    }
    const { count: invoicesCount } = await localSupabase.from('invoices').select('*', { count: 'exact', head: true });
    console.log(`Invoices count: ${invoicesCount || 0}`);
  } catch (err) {
    console.error('Local error:', err);
  }
}

check();
