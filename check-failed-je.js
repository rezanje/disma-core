const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: entry, error: err1 } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', 'je-bca-out-1061-mqkpwf18');
  console.log('Entry:', entry, err1);

  const { data: lines, error: err2 } = await supabase
    .from('journal_lines')
    .select('*')
    .eq('journal_entry_id', 'je-bca-out-1061-mqkpwf18');
  console.log('Lines:', lines, err2);
}
main();
