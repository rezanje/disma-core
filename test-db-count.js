const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { count: ctCount, error: err1 } = await supabase.from('cash_transactions').select('*', { count: 'exact', head: true });
  const { count: jeCount, error: err2 } = await supabase.from('journal_entries').select('*', { count: 'exact', head: true });
  const { count: jlCount, error: err3 } = await supabase.from('journal_lines').select('*', { count: 'exact', head: true });
  
  console.log('ctCount:', ctCount, err1);
  console.log('jeCount:', jeCount, err2);
  console.log('jlCount:', jlCount, err3);
}
main();
