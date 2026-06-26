const fs = require('fs');
async function main() {
  const content = fs.readFileSync('/Users/rezanje/.gemini/antigravity/brain/a97fe0a3-fcc2-4c8a-a544-c19842ecd63d/.system_generated/tasks/task-299.log', 'utf8');
  const lines = content.split('\n');
  const matches = lines.filter(l => l.includes('1061') || l.includes('1081'));
  console.log('Matches:', matches);
}
main();
