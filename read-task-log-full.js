const fs = require('fs');
async function main() {
  const content = fs.readFileSync('/Users/rezanje/.gemini/antigravity/brain/a97fe0a3-fcc2-4c8a-a544-c19842ecd63d/.system_generated/tasks/task-299.log', 'utf8');
  const lines = content.split('\n');
  
  // Find lines containing the specific ID
  const matches = lines.filter(l => l.includes('1061'));
  console.log('Log lines with 1061:', matches);
  
  // Also print the 10 lines around the first match if any
  const idx = lines.findIndex(l => l.includes('1061'));
  if (idx !== -1) {
    console.log('Log context around first match:');
    console.log(lines.slice(Math.max(0, idx - 5), idx + 6).join('\n'));
  }
}
main();
