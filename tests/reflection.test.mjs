// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DataUtils } from 'three';
import { decodeReflection } from '../apps/browser/src/reflection-storage.ts';
const packed = readFileSync('apps/browser/public/assets/arroyo-reflections.pmrem.gz');
const buffer = b => b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
test('committed reflection cache preserves finite RGBA16F colors and full atlas dimensions',async()=>{
  const raw=gunzipSync(packed), {texture,bytes}=await decodeReflection(buffer(packed));
  try {
    assert.equal(texture.image.width,1536);assert.equal(texture.image.height,2048);
    assert.equal(bytes,1536*2048*8);
    assert.deepEqual(Buffer.from(texture.image.data.buffer,texture.image.data.byteOffset),raw.subarray(12));
    let colored=0, peak=0;
    for(let i=0;i<texture.image.data.length;i++) {
      const v=texture.image.data[i];assert.notEqual(v&0x7c00,0x7c00,'finite half-float');
      if(i%4<3) {
        const radiance=DataUtils.fromHalfFloat(v);
        assert.ok(radiance>=0, "physical reflection radiance is nonnegative");
        peak=Math.max(peak,radiance);
        if(v&0x7fff)colored++;
      }
    }
    assert.ok(colored>1536*2048,'GPU readback contains colors, not an empty render target');
    // This static, rough-surfaced fixture has no bright emissive lamps. The bound
    // catches a wrapped diffuse term accidentally feeding a singular GGX BRDF.
    assert.ok(peak<16, `static probe radiance must remain plausible; measured ${peak}`);
  } finally { texture.dispose(); }
});
test('reflection decoder rejects corrupt, truncated, oversized and mismatched atlas payloads',async()=>{
  const header=Buffer.alloc(12);header.writeUInt32LE(0x31524d50);header.writeUInt32LE(1536,4);header.writeUInt32LE(2048,8);
  for(const raw of [Buffer.alloc(2),Buffer.alloc(12),header,Buffer.concat([header,Buffer.alloc(33*1024*1024)])])
    await assert.rejects(decodeReflection(buffer(gzipSync(raw))),/truncated|invalid atlas|size limit/);
  await assert.rejects(decodeReflection(buffer(packed.subarray(0,packed.length-50))));
});
