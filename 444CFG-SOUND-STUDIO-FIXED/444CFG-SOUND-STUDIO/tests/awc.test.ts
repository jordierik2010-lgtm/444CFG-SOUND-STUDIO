import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { carveAwc, inspectRpf, patchAwcInPlace, verifyPatchedRpf } from '../src/core/rpf.ts';
import { buildAwc, parseAwc, replaceStreamPcm, streamFormat, streamPcm, validateAwc } from '../src/core/awc.ts';
import { joaat } from '../src/core/hash.ts';
import { decodeWav, encodeWavPcm16 } from '../src/core/wav.ts';

const DIR = process.env.RPF_DIR ?? '/mnt/user-data/uploads';
const FILES = ['RESIDENT.rpf', 'RESIDENT_1.rpf', 'WEAPONS_PLAYER.rpf', 'WEAPONS_PLAYER_1.rpf'];
const have = FILES.every((f) => existsSync(`${DIR}/${f}`));
const skip = have ? false : `Faltan RPF de muestra en ${DIR} (define RPF_DIR)`;

test('joaat conocido: adder = 0xB779A091', () => { assert.equal(joaat('adder'), 0xb779a091); });

test('WAV round-trip PCM16', () => {
  const pcm = Int16Array.from([0, 1000, -1000, 32767, -32768]);
  const w = decodeWav(encodeWavPcm16(pcm, 22050));
  assert.equal(w.sampleRate, 22050); assert.equal(w.channels.length, 1); assert.equal(w.channels[0].length, 5);
});

test('RPF: los 4 archivos son RPF7 con TOC cifrado NG', { skip }, () => {
  for (const f of FILES) { const i = inspectRpf(readFileSync(`${DIR}/${f}`)); assert.equal(i.encryption, 'NG'); assert.equal(i.readableToc, false); }
});

let total = 0;
for (const f of FILES) {
  test(`AWC ${f}: detecta bancos, valida y reconstruye byte a byte`, { skip }, () => {
    const rpf = readFileSync(`${DIR}/${f}`);
    const slots = carveAwc(rpf);
    assert.ok(slots.length > 0); total += slots.length;
    for (const s of slots) {
      const orig = rpf.subarray(s.offset, s.offset + s.size);
      assert.ok(validateAwc(orig).ok, `AWC 0x${s.offset.toString(16)} no valida`);
      const rebuilt = buildAwc(parseAwc(orig));
      assert.equal(Buffer.compare(Buffer.from(rebuilt), Buffer.from(orig)), 0, `Round-trip distinto en 0x${s.offset.toString(16)}`);
    }
  });
}
test('total de bancos AWC = 32', { skip }, () => { assert.equal(total, 32); });

test('Sustitución: stream reemplazado se lee de vuelta, el resto queda intacto', { skip }, () => {
  const rpf = readFileSync(`${DIR}/WEAPONS_PLAYER_1.rpf`);
  const slot = carveAwc(rpf).find((s) => s.streamCount === 16)!;
  const awc = parseAwc(rpf, slot.offset);
  const before = awc.streams.map((s) => streamPcm(s));
  const n = streamFormat(awc.streams[3])!.samples;
  const pcm = Int16Array.from({ length: Math.floor(n / 2) }, (_, i) => Math.round(Math.sin(i / 7) * 12000));
  const bytes = buildAwc(replaceStreamPcm(awc, 3, pcm, 32000));
  assert.ok(validateAwc(bytes).ok);
  const back = parseAwc(bytes);
  assert.deepEqual(Array.from(streamPcm(back.streams[3])!), Array.from(pcm));
  assert.equal(streamFormat(back.streams[3])!.sampleRate, 32000);
  back.streams.forEach((s, i) => { if (i !== 3) assert.deepEqual(streamPcm(s), before[i]); assert.equal(s.id, awc.streams[i].id); });
});

test('Parche en sitio: TOC y tamaño intactos, solo cambia el hueco', { skip }, () => {
  const orig = readFileSync(`${DIR}/WEAPONS_PLAYER_1.rpf`);
  const rpf = new Uint8Array(orig);
  const slots = carveAwc(rpf);
  const slot = slots.find((s) => s.streamCount === 16)!;
  const awc = parseAwc(rpf, slot.offset);
  const pcm = new Int16Array(500).map((_, i) => Math.round(Math.sin(i / 5) * 9000));
  const bytes = buildAwc(replaceStreamPcm(awc, 2, pcm, 32000));
  patchAwcInPlace(rpf, slot, bytes);
  const rep = verifyPatchedRpf(orig, rpf, [slot]);
  assert.deepEqual(rep.errors, []);
  const again = carveAwc(rpf);
  assert.equal(again.length, slots.length);
  assert.deepEqual(Array.from(streamPcm(parseAwc(rpf, slot.offset).streams[2])!), Array.from(pcm));
});

test('Parche en sitio: rechaza AWC que no cabe', { skip }, () => {
  const rpf = new Uint8Array(readFileSync(`${DIR}/WEAPONS_PLAYER_1.rpf`));
  const slot = carveAwc(rpf).find((s) => s.streamCount === 1)!;
  const awc = parseAwc(rpf, slot.offset);
  const big = buildAwc(replaceStreamPcm(awc, 0, new Int16Array(slot.size), 32000));
  assert.throws(() => patchAwcInPlace(rpf, slot, big), /no cabe/);
});
