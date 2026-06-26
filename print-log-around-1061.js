const fs = require('fs');
async function main() {
  const content = fs.readFileSync('/Users/rezanje/.gemini/antigravity/brain/a97fe0a3-fcc2-4c8a-a544-c19842ecd63d/.system_generated/tasks/task-299.log', 'utf8');
  const lines = content.split('\n');
  
  // Find where it says "Progress: 1000/2017 committed" or similar
  const idx = lines.findIndex(l => l.includes('1000/2017'));
  if (idx !== -1) {
    console.log('Log context around 1000/2017:');
    console.log(lines.slice(idx - 15, idx + 15).join('\n'));
  } else {
    console.log('Could not find 1000/2017 in log.');
  }
}
main();
