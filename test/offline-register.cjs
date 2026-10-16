// Hermetic regression bootstrap: never use a connected Supabase project.
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
  return resolve.call(this, request, ...args);
};
process.env.NEXT_PUBLIC_SUPABASE_PROFILE = 'local';
process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL = 'offline-test';
process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL = 'offline-test';
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({module:'CommonJS',moduleResolution:'Node',jsx:'react-jsx',incremental:false});
globalThis.fetch = async () => { throw new Error('External fetch is blocked in regression tests'); };
for (const name of ['node:http','node:https']) {
  const api = require(name);
  api.get = api.request = () => { throw new Error('External HTTP is blocked in regression tests'); };
}
const net = require('node:net');
net.connect = net.createConnection = () => { throw new Error('External TCP is blocked in regression tests'); };
require(path.join(root,'node_modules/ts-node/register/transpile-only'));
