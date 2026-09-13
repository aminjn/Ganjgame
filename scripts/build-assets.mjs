// Builds compact GLBs from the Quaternius Stylized Nature MegaKit (CC0) glTF sources.
// Usage: node scripts/build-assets.mjs <path-to-kit>/glTF
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, simplify, weld, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-assets.mjs <kit>/glTF'); process.exit(1); }
const out = 'public/assets/models';
mkdirSync(out, { recursive: true });

// Subset we actually scatter on the map (keep the download small for phones).
const MODELS = [
  'CommonTree_1','CommonTree_2','CommonTree_3','CommonTree_4','CommonTree_5',
  'Pine_1','Pine_2','Pine_3','Pine_4','Pine_5',
  'DeadTree_1','DeadTree_2','DeadTree_3','DeadTree_4','DeadTree_5',
  'Rock_Medium_1','Rock_Medium_2','Rock_Medium_3',
  'Pebble_Round_1','Pebble_Round_2','Pebble_Round_3',
  'Bush_Common','Bush_Common_Flowers','Fern_1','Grass_Common_Tall','Grass_Wispy_Tall',
  'Mushroom_Common','Flower_3_Group','Flower_4_Group','Plant_1_Big','Clover_1',
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const manifest = [];
for (const name of MODELS) {
  const file = join(src, name + '.gltf');
  if (!existsSync(file)) { console.warn('missing', name); continue; }
  const doc = await io.read(file);
  // برگ‌ها: به‌جای بافت رنگی تیره‌ی «_C» از ماسک روشن استفاده می‌کنیم تا در زمان اجرا با رنگ استایلایز رنگ‌آمیزی شود.
  for (const tex of doc.getRoot().listTextures()) {
    const uri = tex.getURI() || tex.getName() || '';
    const m = uri.match(/^(.*)_C(\.png)?$/);
    if (m) {
      const alt = join(src, m[1] + '.png');
      if (existsSync(alt)) { tex.setImage(readFileSync(alt)); tex.setMimeType('image/png'); tex.setName(m[1]); }
    }
  }
  // صخره‌ها و سنگریزه‌ها بدون بافت: رنگ تخت low-poly
  if (/^(Rock|Pebble)/.test(name)) for (const mat of doc.getRoot().listMaterials()) { mat.setBaseColorTexture(null); mat.setBaseColorFactor([0.62, 0.58, 0.54, 1]); }
  await doc.transform(
    dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.01 }),
    resample(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [256, 256] }),
    quantize(),
  );
  // Drop normal maps: flat stylized look does not need them and they cost memory on phones.
  for (const mat of doc.getRoot().listMaterials()) mat.setNormalTexture(null);
  await doc.transform(prune());
  const glb = await io.writeBinary(doc);
  writeFileSync(join(out, name + '.glb'), glb);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  manifest.push({ name, bytes: glb.byteLength, tris });
  console.log(name, (glb.byteLength / 1024).toFixed(0) + 'KB', tris, 'tris');
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
