import assert from 'node:assert/strict';
import { requiresProof, proofBlocker } from './transcription-proof';

// dikerjakan orang lain = hasil salinan = butuh foto kertasnya
assert.equal(requiresProof('u-hilman', 'u-sifa'), true);
// dikerjakan sendiri = bukan salinan
assert.equal(requiresProof('u-hilman', 'u-hilman'), false);
assert.equal(requiresProof(null, 'u-hilman'), false);
assert.equal(requiresProof('', 'u-hilman'), false);

assert.equal(proofBlocker('u-hilman', 'u-sifa', 'https://x/foto.jpg'), null);
assert.equal(proofBlocker('u-hilman', 'u-hilman', null), null);
assert.equal(typeof proofBlocker('u-hilman', 'u-sifa', null), 'string');
assert.equal(typeof proofBlocker('u-hilman', 'u-sifa', ''), 'string');
assert.match(proofBlocker('u-hilman', 'u-sifa', null) as string, /foto/i);

console.log('transcription-proof: OK');
