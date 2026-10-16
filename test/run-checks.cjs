const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
function collect(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory()
    ? collect(path.join(dir,entry.name))
    : (entry.name.endsWith('.check.ts') || entry.name.endsWith('.test.cjs')) ? [path.join(dir,entry.name)] : []);
}
const files = [...collect(path.join(root,'src')),...collect(path.join(root,'tests'))].sort();
const results = files.map(file => {
  const run = spawnSync(process.execPath,['-r',path.join(__dirname,'offline-register.cjs'),file],{cwd:root,timeout:30000,encoding:'utf8'});
  const passed = run.status===0;
  const name = path.relative(root,file);
  console.log(`${passed?'PASS':'FAIL'} ${name}`);
  if(!passed) console.log((run.stdout+run.stderr).trim());
  return {file:name,passed,status:run.status,error:run.error?.message,output:(run.stdout+run.stderr).trim()};
});
fs.mkdirSync(path.join(root,'.superpowers'),{recursive:true});
fs.writeFileSync(path.join(root,'.superpowers','regression-results.json'),JSON.stringify(results,null,2));
const passed=results.filter(r=>r.passed).length;
console.log(`${passed}/${results.length} regression files passed`);
if(passed!==results.length) process.exitCode=1;
