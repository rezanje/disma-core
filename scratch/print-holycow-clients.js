const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: clients } = await supabase.from('clients').select('*');
  const holycows = clients.filter(c => c.company_name.toLowerCase().includes('holycow'));
  console.log('Holycow clients detailed:', holycows.map(c => ({
    id: c.id,
    company_name: c.company_name,
    total_order_jan_may: c.total_order_jan_may,
    is_brand: c.is_brand,
    parent_id: c.parent_id
  })));
}
main();
