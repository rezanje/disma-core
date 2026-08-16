import assert from 'node:assert/strict';
import { resolveActor, transcriptionNote } from './actor';

// yang dipilih menang; kalau tidak memilih, jatuh ke yang login
assert.equal(resolveActor('u-sandi', 'u-sifa'), 'u-sandi');
assert.equal(resolveActor(null, 'u-sifa'), 'u-sifa');
assert.equal(resolveActor(undefined, 'u-sifa'), 'u-sifa');
assert.equal(resolveActor('', 'u-sifa'), 'u-sifa');

// tidak ada dua-duanya: 'system', bukan string kosong yang menyamar jadi nama
assert.equal(resolveActor(null, null), 'system');

// catatan hanya muncul kalau memang disalin orang lain
assert.equal(transcriptionNote('Sandi', 'Sifa'), 'Dikerjakan Sandi, disalin Sifa');
assert.equal(transcriptionNote(null, 'Sifa'), undefined);
assert.equal(transcriptionNote('Sifa', 'Sifa'), undefined);
assert.equal(transcriptionNote('Sandi', null), undefined);

console.log('actor: OK');
