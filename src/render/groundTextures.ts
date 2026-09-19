// بارگذاری بافت‌های نقاشی‌شده‌ی اختیاری زمین از public/assets/textures/index.json
// نمونه‌ی index.json: { "grass": "grass.jpg", "dry": "dry.jpg", "rock": "rock.jpg", "marsh": "marsh.jpg", "cracked": "cracked.jpg", "lava": "lava.jpg", "stone": "stone.jpg", "gold": "gold.jpg", "chasm": "chasm.jpg" }
import { TextureLoader, RepeatWrapping, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter } from 'three';
import { TEX_KEYS, type GroundTextures } from './ground';

export async function loadGroundTextures(base = 'assets/textures/'): Promise<GroundTextures> {
  const out: GroundTextures = {};
  let index: Record<string, string> = {};
  try { const r = await fetch(base + 'index.json', { cache: 'no-cache' }); if (!r.ok) return out; index = await r.json(); } catch { return out; }
  const loader = new TextureLoader();
  await Promise.all(TEX_KEYS.filter(k => index[k]).map(k => new Promise<void>(resolve => {
    loader.load(base + index[k], t => { t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.anisotropy = 4; out[k] = t; resolve(); }, undefined, () => { console.warn('بافت زمین بارگذاری نشد:', k); resolve(); });
  })));
  return out;
}
