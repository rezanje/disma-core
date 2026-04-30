const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://plzkrzzmqatjgsitvmfd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDM0NTgsImV4cCI6MjA5MDM3OTQ1OH0.emqfLBO9wfYnBZ_jpD1zYLO5u7fPT2E6HQw-ysi6VxY'
);

async function run() {
  const { data, error } = await supabase.from('app_settings').select('*');
  console.log('App Settings Data:', data);
  console.log('App Settings Error:', error);

  // Try to insert to check for RLS
  const { data: iData, error: iError } = await supabase.from('app_settings').upsert({
    id: 'global-settings',
    nav_configs: {},
    role_permissions: { 'Admin PO': ['/admin'] }
  });
  console.log('Insert Error:', iError);
}
run();
