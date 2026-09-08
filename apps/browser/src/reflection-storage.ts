// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
const MAGIC = 0x31524d50; // PMR1: little-endian width/height + unmodified RGBA16F texels.
const MAX_BYTES = 32 * 1024 * 1024;
export async function decodeReflection(packed: ArrayBuffer) {
  const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const {done,value} = await reader.read(); if(done)break;
    length += value.length;
    if(length > MAX_BYTES) { await reader.cancel(); throw Error('Reflection asset exceeds its decoded size limit.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  if(length<12)throw Error('Reflection asset is truncated. Rebuild assets and retry.');
  const header = new DataView(bytes.buffer), width=header.getUint32(4,true), height=header.getUint32(8,true);
  if(header.getUint32(0,true)!==MAGIC || height<64 || height>2048 || (height&(height-1))!==0 || width!==height/4*3 || length!==12+width*height*8)
    throw Error('Reflection asset has an invalid atlas layout. Rebuild assets and retry.');
  const texture = new THREE.DataTexture(new Uint16Array(bytes.buffer,12),width,height,THREE.RGBAFormat,THREE.HalfFloatType);
  texture.mapping=THREE.CubeUVReflectionMapping;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.flipY=false;texture.needsUpdate=true;
  return {texture,bytes:width*height*8};
}

/** Asset-build-only readback; no gameplay or renderer controls are exposed to tests. */
export async function encodeReflection(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget) {
  const {width,height}=source;
  const output=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,depthBuffer:false});
  const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{source:{value:source.texture}},depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D source;out vec4 color;void main(){color=texelFetch(source,ivec2(gl_FragCoord.xy),0);}'});
  const geometry=new THREE.PlaneGeometry(2,2), scene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,material));
  const previous=renderer.getRenderTarget(), pixels=new Float32Array(width*height*4);
  try { renderer.setRenderTarget(output);renderer.render(scene,new THREE.Camera());renderer.readRenderTargetPixels(output,0,0,width,height,pixels); }
  finally { renderer.setRenderTarget(previous);output.dispose();geometry.dispose();material.dispose(); }
  const raw=new ArrayBuffer(12+pixels.length*2),header=new DataView(raw),half=new Uint16Array(raw,12);
  header.setUint32(0,MAGIC,true);header.setUint32(4,width,true);header.setUint32(8,height,true);
  for(let i=0;i<pixels.length;i++)half[i]=THREE.DataUtils.toHalfFloat(pixels[i]);
  const packed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary='';for(let i=0;i<packed.length;i+=32768)binary+=String.fromCharCode(...packed.subarray(i,i+32768));
  return btoa(binary);
}
