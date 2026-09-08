// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';import assert from 'node:assert/strict';
import {cutoutMipmaps} from '../apps/browser/src/foliage-mips.ts';
test('cutout reduction retains leaf color beside transparent black and preserves source alpha',()=>{
 const data=new Uint8Array(16*16*4);for(let y=0;y<16;y++)for(let x=5;x<11;x++)data.set([64,128,32,255],(y*16+x)*4);
 const original=new Uint8Array(data), levels=cutoutMipmaps({data,width:16,height:16});
 assert.deepEqual(data,original);assert.deepEqual(levels.map(l=>l.width),[16,8,4,2,1]);
 for(let i=3;i<data.length;i+=4)assert.equal(levels[0].data[i],data[i],'edge color padding must never change alpha');
 for(const level of levels)for(let i=0;i<level.data.length;i+=4)if(level.data[i+3]>0)
  assert.deepEqual([...level.data.subarray(i,i+3)],[64,128,32],'transparent neighbors must not darken leaf RGB');
 assert.deepEqual([...levels[0].data.subarray((8*16+4)*4,(8*16+4)*4+4)],[64,128,32,0]);
});
test('non-power-of-two mip chain keeps coverage and finite bounded colors',()=>{
 const w=125,h=67,data=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4,inside=(x-62)**2/42**2+(y-33)**2/23**2<1;data.set([70,135,40,inside?255:0],i);
 }
 const levels=cutoutMipmaps({data,width:w,height:h});let target;
 for(const l of levels){assert.equal(l.data.length,l.width*l.height*4);let n=0;for(let i=3;i<l.data.length;i+=4)n+=l.data[i]>=115;
 const coverage=n/(l.width*l.height);target??=coverage;if(l.width>=7)assert.ok(Math.abs(coverage-target)<.03,`${l.width}: coverage ${coverage} vs ${target}`);
 }
 assert.deepEqual([levels.at(-1).width,levels.at(-1).height],[1,1]);
 assert.throws(()=>cutoutMipmaps({width:2,height:3,data:new Uint8Array(5)}),/dimensions/);
});
