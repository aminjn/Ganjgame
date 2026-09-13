// Strips KayKit Adventurers (CC0) characters down to the few animations the game uses and shrinks textures.
// Usage: node scripts/build-characters.mjs <pack>/Characters/gltf
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
const out = 'public/assets/models/kaykit';
mkdirSync(out, { recursive: true });
const KEEP = new Set(['Idle', 'Walking_A', 'Cheer']);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded']) {
  const doc = await io.read(join(src, name + '.glb'));
  for (const a of doc.getRoot().listAnimations()) if (!KEEP.has(a.getName())) {
    for (const c of a.listChannels()) c.dispose();
    for (const sm of a.listSamplers()) sm.dispose();
    a.dispose();
  }
  const names = doc.getRoot().listNodes().map(n => n.getName()).filter(n => /hand|slot|head|spine/i.test(n));
  console.log(name, 'bones:', names.join(','));
  await doc.transform(dedup(), resample(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [256, 256] }), quantize());
  const glb = await io.writeBinary(doc);
  writeFileSync(join(out, name + '.glb'), glb);
  console.log(name, (glb.byteLength / 1024).toFixed(0) + 'KB', 'anims', doc.getRoot().listAnimations().map(a => a.getName()).join(','));
}
