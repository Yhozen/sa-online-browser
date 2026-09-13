// SPDX-License-Identifier: GPL-3.0-or-later
// Packed terrain v4 uses signed/unsigned 16-bit LITTLE-ENDIAN integers and raw
// normalized RGB/geology bytes. The output is derived only from retained v3 input.
import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identify=file=>{const bytes=readFileSync(file);return {path:path.relative(projectRoot,path.resolve(file)).split(path.sep).join('/'),bytes:bytes.length,sha256:hash(bytes)}};

export function bakeHorizonEnvelope(sourceBytes,lighting){
validateEnvelope(sourceBytes);
validateLighting(lighting);
const original=JSON.parse(sourceBytes), S=1440,R=20,STRIDE=S+1;
assert.equal(original.version,3,'This authoring input must be the retained v3 envelope');
const SUN=new THREE.Vector3(...lighting.sun.direction).normalize();
const sunColor=new THREE.Color(lighting.sun.color).multiplyScalar(lighting.sun.intensity);
const skyColor=new THREE.Color(lighting.sky.color),groundColor=new THREE.Color(lighting.sky.groundColor);
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b),clamp=THREE.MathUtils.clamp;
const fract=x=>x-Math.floor(x),lerp=THREE.MathUtils.lerp;
const innerFractions=[0,.12,.26,.40,.52,.62,.71,.78,.835,.88,.915,.945,.97,.987,1];
const outerFractions=[.035,.095,.20,.37,.64,1];
const fields=[];const stats=[];
function oldAt(layer,angular,radial,field='elevation') {
  angular=((angular%original.segments)+original.segments)%original.segments;
  const i=Math.floor(angular),u=angular-i,j=Math.min(original.rings-1,Math.max(0,Math.floor(radial))),v=clamp(radial-j,0,1);
  const arr=original.layers[layer][field],k=j*(original.segments+1)+i;
  return u+v<=1?arr[k]+(arr[k+1]-arr[k])*u+(arr[k+original.segments+1]-arr[k])*v:
    arr[k+original.segments+2]+(arr[k+original.segments+1]-arr[k+original.segments+2])*(1-u)+(arr[k+1]-arr[k+original.segments+2])*(1-v);
}
// Four unequal connected upper-face drainage networks per actually exposed band.
// Stations are authored world-space directions/widths: angle degrees, downslope
// bend degrees, maximum cut metres, left/right wall widths metres, branch spread.
// The retained broad crest itself is never replaced by a new row of summits.
const exposedGullies=[
 {range:[51.5,62],channels:[
  [53.35,.48,4.6,.85,2.3,1.9], [55.45,-.40,5.2,1.45,.9,2.3],
  [57.60,.55,4.7,.75,2.55,1.7], [59.65,-.22,4.2,1.35,.85,2.1]]},
 {range:[95.5,112],channels:[
  [97.6,.46,5.3,1.8,4.2,3.2], [101.2,-.36,5.8,3.4,1.6,3.8],
  [105.6,.62,5.0,1.5,4.5,3.0], [109.4,-.28,4.7,3.2,1.8,3.7]]},
 {range:[95.5,112],channels:[
  [98.8,-.28,5.1,2.1,4.6,4.1], [102.4,.42,5.7,4.1,2.0,4.5],
  [106.1,-.48,5.0,1.9,4.8,3.8], [109.8,.30,4.5,3.6,2.2,4.2]]}
];
function visibleGullyCut(layer,angle,radius,distance,inside) {
 if(!inside||distance<=.10||distance>=16)return 0;
 const {range,channels}=exposedGullies[layer],degrees=angle*180/Math.PI;
 if(degrees<=range[0]||degrees>=range[1])return 0;
 const edge=smooth(range[0],range[0]+.6,degrees)*(1-smooth(range[1]-.6,range[1],degrees));
 const depthGate=smooth(.10,2.8,distance)*(1-smooth(8,16,distance));
 let cut=0;
 for(const[axis,bend,depth,left,right,spread]of channels) {
  const center=axis+bend*smooth(0,9,distance);
  const x=(degrees-center)*Math.PI/180*radius;
  // Linear asymmetric walls expose planar side faces; short tributaries merge
  // into the same lower channel, rather than forming independent cone summits.
  const vee=(at,l,r)=>Math.max(0,1-Math.abs(at)/(at<0?l:r));
  const main=vee(x,left,right);
  const separate=spread*(1-smooth(.35,5,distance));
  const tributary=Math.max(vee(x-separate,left*.50,right*.42),vee(x+separate,left*.40,right*.54));
  cut=Math.max(cut,depth*depthGate*Math.max(main,tributary*.72));
 }
 return cut*edge;
}
// Breach only closed outlets introduced by the authored upper cuts. A minimax
// spill path through actual triangle edges joins each new depression to an
// existing lower outlet with a 1% fall. Existing unrelated basins are retained.
function connectAuthoredOutlets(positions,baselineHeight,cuts) {
 const count=baselineHeight.length;
 const flood=height=>{
  const level=new Float64Array(count).fill(Infinity),parent=new Int32Array(count).fill(-1),heap=[];
  const push=(id,h)=>{let k=heap.length;heap.push([id,h]);while(k){const up=(k-1)>>1;if(heap[up][1]<=h)break;heap[k]=heap[up];k=up;}heap[k]=[id,h]};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let c=k*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[k]=heap[c];k=c;}heap[k]=last;}return first};
  for(const row of[0,R])for(let i=0;i<STRIDE;i++){const k=row*STRIDE+i;level[k]=height[k];push(k,level[k]);}
  while(heap.length){const[k,h]=pop();if(h!==level[k])continue;const row=Math.floor(k/STRIDE),column=k%STRIDE;
   for(const[dr,dc]of[[0,-1],[0,1],[-1,0],[1,0],[-1,1],[1,-1]]){const r=row+dr;if(r<0||r>R)continue;const c=(column+dc+S)%S,q=r*STRIDE+c,next=Math.max(h,height[q]);if(next<level[q]){level[q]=next;parent[q]=k;push(q,next)}}
   if(column===0){const q=row*STRIDE+S;if(h<level[q]){level[q]=h;parent[q]=k;push(q,h);}}
  }return{level,parent};
 };
 const height=Float64Array.from({length:count},(_,k)=>positions[k*3+2]),before=flood(baselineHeight),after=flood(height);
 const seeds=Array.from({length:count},(_,k)=>k).filter(k=>after.level[k]-height[k]>(before.level[k]-baselineHeight[k])+.05).sort((a,b)=>height[a]-height[b]);
 const touched=new Set();let maximumOutletCut=0;
 for(const seed of seeds){let k=seed,target=positions[k*3+2];for(let steps=0;steps<count;steps++){
   const q=after.parent[k];if(q<0)break;
   target-=.01*Math.hypot(positions[q*3]-positions[k*3],positions[q*3+1]-positions[k*3+1]);
   if(after.level[q]<=target)break;
   const old=positions[q*3+2];if(old>target){positions[q*3+2]=target;cuts[q]+=old-positions[q*3+2];touched.add(q);maximumOutletCut=Math.max(maximumOutletCut,old-target);}
   target=Math.min(target,positions[q*3+2]);k=q;
  }}
 return{newDepressionSeeds:seeds.length,outletVertices:touched.size,maximumOutletCut};
}
for(let layer=0;layer<3;layer++) {
  const width=90+layer*50,inner=250+layer*125-width*.47,outer=inner+width;
  const p=new Float32Array(STRIDE*(R+1)*3),geo=new Uint8Array(STRIDE*(R+1)*2),radii=new Float64Array(STRIDE*(R+1));
  const retainedZ=new Float32Array(STRIDE*(R+1));
  const crowns=new Float64Array(STRIDE),heights=new Float64Array(STRIDE),cuts=new Float32Array(STRIDE*(R+1));
  const indices=[];let maxCut=0,min=Infinity,max=-Infinity;
  for(let i=0;i<=S;i++) {
    const ai=i/S*original.segments,a=i/S*Math.PI*2;
    // Search the accepted piecewise-triangular heightfield's exact radial breakpoints.
    // At intermediate angular columns these occur at integer j and j+(1-u).
    let crown=0,crownHeight=-Infinity;const u=fract(ai);
    for(let j=0;j<=original.rings;j++)for(const rr of [j,Math.min(original.rings,j+1-u)]) {
      const height=oldAt(layer,ai,rr);if(height>crownHeight){crownHeight=height;crown=rr;}
    }
    // Flat apron-only azimuths have no unique crown; choosing their first
    // tied sample would collapse all inner rows onto the same radius.
    if(crown<3||crown>original.rings-3){assert.ok(crownHeight<=-2.519,'Non-flat crest unexpectedly lies at a band edge');crown=original.rings*.47;}
    crowns[i]=inner+crown/original.rings*width;heights[i]=crownHeight;
    for(let j=0;j<=R;j++) {
      const radius=j<=14?lerp(inner,crowns[i],innerFractions[j]):lerp(crowns[i],outer,outerFractions[j-15]);
      const distance=Math.abs(radius-crowns[i]),aOld=ai,radial=(radius-inner)/width*original.rings;
      const accepted=oldAt(layer,aOld,radial);
      const parentCount=[64,88,104][layer];
      // Three unequal spurs per previous main watershed. Curving tributaries
      // converge downslope; profile values are real connected plane cuts.
      const slopeSign=j<14?-1:1;
      const parent=a/Math.PI/2*parentCount+.24*Math.sin(a*9+layer)+.11*Math.sin(a*21-1.2);
      const depth=smooth(0,22,distance);
      const phase=parent*3+.19*Math.sin(parent*Math.PI*2)+slopeSign*depth*(.40+.28*Math.sin(a*7+layer));
      const cross=fract(phase+.5)-.5;
      const unequal=.22+.045*Math.sin(parent*Math.PI*2+.7);
      const trunk=Math.max(0,1-Math.abs(cross)/(cross<0?unequal:.34));
      const forkSeparation=.29*(1-smooth(1,13,distance));
      const fork=Math.max(0,1-Math.min(Math.abs(cross-forkSeparation),Math.abs(cross+forkSeparation))/.10);
      const amplitude=Math.min(4.2,distance*.80)*(1-smooth(22,65,distance));
      const secondary=amplitude*(trunk*.90+fork*.34*(1-smooth(8,18,distance)));
      const authoredGully=visibleGullyCut(layer,a,radius,distance,j<14);
      const floor=-2.52,z=Math.max(floor,accepted-Math.max(secondary,authoredGully)),cut=accepted-z,k=j*STRIDE+i;
      // The maximum crest line is unchanged; cuts begin directly beside it.
      retainedZ[k]=9+Math.max(floor,accepted-secondary);
      p[k*3]=Math.cos(a)*radius;p[k*3+1]=Math.sin(a)*radius;p[k*3+2]=9+z;radii[k]=radius;cuts[k]=cut;
      geo[k*2]=Math.round(clamp(oldAt(layer,aOld,radial,'mineral')+24*trunk,0,255));
      geo[k*2+1]=Math.round(clamp(oldAt(layer,aOld,radial,'vegetation')*.55+35*trunk*smooth(2,13,distance),0,255));
      min=Math.min(min,z);max=Math.max(max,z);maxCut=Math.max(maxCut,cut);
      if(j<R&&i<S){indices.push(k,k+STRIDE,k+1,k+1,k+STRIDE,k+STRIDE+1);}
    }
  }
  const drainage=connectAuthoredOutlets(p,retainedZ,cuts);
  min=Infinity;max=-Infinity;maxCut=0;for(let k=0;k<retainedZ.length;k++){min=Math.min(min,p[k*3+2]-9);max=Math.max(max,p[k*3+2]-9);maxCut=Math.max(maxCut,cuts[k]);}
  // Exact duplicate endpoints make the authored wrap watertight.
  for(let j=0;j<=R;j++){
    const first=j*STRIDE,last=first+S;
    for(let k=0;k<3;k++)p[last*3+k]=p[first*3+k];
    for(let k=0;k<2;k++)geo[last*2+k]=geo[first*2+k];
    radii[last]=radii[first];cuts[last]=cuts[first];
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(p,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const n=geometry.getAttribute('normal');
  for(let j=0;j<=R;j++){
    const a=j*STRIDE,b=a+S,nn=new THREE.Vector3().fromBufferAttribute(n,a).add(new THREE.Vector3().fromBufferAttribute(n,b)).normalize();
    n.setXYZ(a,...nn.toArray());n.setXYZ(b,...nn.toArray());
  }
  fields.push({p,n,geo,radii,crowns,heights,cuts,inner,outer,width,geometry});
  stats.push({layer,triangles:indices.length/3,vertices:p.length/3,min,max,maxCut,drainage});
}
// Piecewise-linear ray/height intersections over the new nonuniform radial grid.
function heightAt(x,y){
  const radius=Math.hypot(x,y),angular=((Math.atan2(y,x)/(Math.PI*2)+1)%1)*S;
  const i=Math.floor(angular),u=angular-i;let height=-Infinity;
  for(const f of fields){
    if(radius<f.inner||radius>f.outer)continue;
    const at=j=>lerp(f.radii[j*STRIDE+i],f.radii[j*STRIDE+i+1],u);
    let lo=0,hi=R;while(hi-lo>1){const middle=(lo+hi)>>1;if(at(middle)>radius)hi=middle;else lo=middle;}
    const r0=at(lo),r1=at(lo+1),v=clamp((radius-r0)/(r1-r0),0,1),k=lo*STRIDE+i,z=q=>f.p[q*3+2];
    const value=u+v<=1?z(k)+(z(k+1)-z(k))*u+(z(k+STRIDE)-z(k))*v:
      z(k+STRIDE+1)+(z(k+STRIDE)-z(k+STRIDE+1))*(1-u)+(z(k+1)-z(k+STRIDE+1))*(1-v);
    height=Math.max(height,value);
  }
  return height;
}
const horizonDirections=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)]);
const sunSteps=[.75,1.5,2.5,4,6,9,14,22,35,55,85,125],skySteps=[1.5,4,10,24,60,125];
const sx=SUN.x/Math.hypot(SUN.x,SUN.y),sy=SUN.y/Math.hypot(SUN.x,SUN.y),sunSlope=SUN.z/Math.hypot(SUN.x,SUN.y);
const layers=[],IRRADIANCE_SCALE=4;
for(let layer=0;layer<fields.length;layer++){
  const f=fields[layer],count=f.p.length/3,irradiance=new Uint8Array(count*3),visibility=new Float32Array(count*2);
  let directMean=0,skyMean=0,unclampedMax=0;
  for(let k=0;k<count;k++){
    const x=f.p[k*3],y=f.p[k*3+1],z=f.p[k*3+2]+.07,nx=f.n.getX(k),ny=f.n.getY(k),nz=f.n.getZ(k);
    let sunHorizon=-Infinity;
    for(const distance of sunSteps)sunHorizon=Math.max(sunHorizon,(heightAt(x+sx*distance,y+sy*distance)-z)/distance);
    const visibleSun=smooth(-.018,.018,sunSlope-sunHorizon);
    let openSky=0,visibleSky=0;
    for(const [dx,dy]of horizonDirections){
      let horizon=0;for(const distance of skySteps)horizon=Math.max(horizon,(heightAt(x+dx*distance,y+dy*distance)-z)/distance);
      const facing=nx*dx+ny*dy,tangent=Math.max(0,Math.atan2(-facing,Math.max(.001,nz)));
      const integral=low=>facing*(Math.PI/4-low/2-Math.sin(2*low)/4)+nz*Math.cos(low)**2/2;
      openSky+=integral(tangent);visibleSky+=integral(Math.max(tangent,Math.atan(horizon)));
    }
    const skyVisibility=clamp(visibleSky/Math.max(.001,openSky),0,1),dot=Math.max(0,nx*SUN.x+ny*SUN.y+nz*SUN.z);
    const up=clamp(nz*.5+.5,0,1),hemi=groundColor.clone().lerp(skyColor,up).multiplyScalar(lighting.sky.intensity*skyVisibility);
    // Lambert diffuse: exactly one directional + sky irradiance evaluation.
    // The small neutral environment term is diffuse ambient, not a second sun.
    const rgb=sunColor.clone().multiplyScalar(dot*visibleSun).add(hemi);
    rgb.r+=(skyColor.r*lighting.environmentDiffuse+lighting.ambientBounce[0]);rgb.g+=(skyColor.g*lighting.environmentDiffuse+lighting.ambientBounce[1]);rgb.b+=(skyColor.b*lighting.environmentDiffuse+lighting.ambientBounce[2]);
    rgb.multiplyScalar(1/Math.PI);
    for(let c=0;c<3;c++){const value=[rgb.r,rgb.g,rgb.b][c];unclampedMax=Math.max(unclampedMax,value);irradiance[k*3+c]=Math.round(clamp(value/IRRADIANCE_SCALE,0,1)*255);}
    visibility[k*2]=visibleSun;visibility[k*2+1]=skyVisibility;directMean+=dot*visibleSun;skyMean+=skyVisibility;
  }
  for(let j=0;j<=R;j++)for(let c=0;c<3;c++)irradiance[(j*STRIDE+S)*3+c]=irradiance[j*STRIDE*3+c];
  const elevation=new Int16Array(count);for(let k=0;k<count;k++)elevation[k]=Math.round((f.p[k*3+2]-9)*256);
  const crownRadius=new Uint16Array(STRIDE);for(let k=0;k<=S;k++)crownRadius[k]=Math.round((f.crowns[k]-f.inner)*512);
  const encode=encodeFieldLE;
  layers.push({crownRadius:encode(crownRadius),elevation:encode(elevation),irradiance:encode(irradiance),geology:encode(f.geo)});
  f.irradiance=irradiance;f.visibility=visibility;
  stats[layer].lighting={meanVisibleNdotL:directMean/count,meanSkyVisibility:skyMean/count,maxIrradiance:unclampedMax,storageScale:IRRADIANCE_SCALE,clipped:unclampedMax>IRRADIANCE_SCALE};
}
const data={version:4,segments:S,rings:R,innerFractions,outerFractions,irradianceScale:IRRADIANCE_SCALE,elevationScale:256,crownRadiusScale:512,layers};

return {data,metrics:{layers:stats,triangles:stats.reduce((s,x)=>s+x.triangles,0),vertices:stats.reduce((s,x)=>s+x.vertices,0)}};
}


/** Explicit wire types; never serialize a host-native typed-array buffer. */
export function encodeFieldLE(values) {
  const type=values.constructor;
  assert.ok([Uint8Array,Int16Array,Uint16Array,Float32Array].includes(type),'Unsupported wire field');
  const bytes=Buffer.alloc(values.length*type.BYTES_PER_ELEMENT);
  for(let i=0;i<values.length;i++) {
    if(type===Uint8Array)bytes[i]=values[i];
    else if(type===Int16Array)bytes.writeInt16LE(values[i],i*2);
    else if(type===Uint16Array)bytes.writeUInt16LE(values[i],i*2);
    else bytes.writeFloatLE(values[i],i*4);
  }
  return bytes.toString('base64');
}
export function decodeFieldLE(encoded,type,count) {
  assert.equal(typeof encoded,'string','Packed field must be base64 text');
  assert.ok(Number.isSafeInteger(count)&&count>=0,'Invalid element count');
  assert.ok([Uint8Array,Int16Array,Uint16Array,Float32Array].includes(type),'Unsupported wire type');
  const bytes=Buffer.from(encoded,'base64');
  assert.equal(bytes.toString('base64'),encoded,'Non-canonical base64');
  assert.equal(bytes.length,count*type.BYTES_PER_ELEMENT,'Packed field byte length');
  const values=new type(count);
  for(let i=0;i<count;i++)values[i]=type===Uint8Array?bytes[i]:type===Int16Array?bytes.readInt16LE(i*2):
    type===Uint16Array?bytes.readUInt16LE(i*2):bytes.readFloatLE(i*4);
  return values;
}
function validateEnvelope(bytes) {
  const data=JSON.parse(bytes);
  assert.equal(data.version,3,'Expected retained v3 envelope, never the generated v4 output');
  assert.equal(data.segments,480);assert.equal(data.rings,60);assert.equal(data.layers.length,3);
  const stride=data.segments+1,count=stride*(data.rings+1);
  for(const layer of data.layers)for(const key of ['elevation','mineral','vegetation']) {
    assert.equal(layer[key].length,count,`Envelope ${key} count`);
    assert.ok(layer[key].every(Number.isFinite),`Envelope ${key} must be finite`);
    if(key!=='elevation')assert.ok(layer[key].every(x=>Number.isInteger(x)&&x>=0&&x<=255));
    for(let j=0;j<=data.rings;j++)assert.equal(layer[key][j*stride],layer[key][j*stride+data.segments],`Envelope ${key} seam`);
  }
}
function validateLighting(lighting) {
  assert.equal(lighting.version,1);
  for(const value of [...lighting.sun.direction,...lighting.ambientBounce,lighting.sun.intensity,lighting.sky.intensity,lighting.environmentDiffuse])
    assert.ok(Number.isFinite(value),'Lighting inputs must be finite');
  assert.equal(lighting.sun.direction.length,3);assert.equal(lighting.ambientBounce.length,3);
  assert.ok(lighting.sun.direction[2]>0&&Math.hypot(...lighting.sun.direction.slice(0,2))>0);
  for(const c of [lighting.sun.color,lighting.sky.color,lighting.sky.groundColor])assert.ok(Number.isInteger(c)&&c>=0&&c<=0xffffff);
  assert.ok(lighting.sun.intensity>=0&&lighting.sky.intensity>=0&&lighting.environmentDiffuse>=0);
}
/** Fail on effective fixture drift rather than silently baking stale constants.
 * The neutral diffuse approximation/bounce is authored here, not extracted PMREM. */
export function verifyLightingSource(lighting,source) {
  const values=(pattern,label)=>{const match=source.match(pattern);assert.ok(match,`Cannot verify ${label}`);return match.slice(1).map(Number)};
  assert.deepEqual(values(/new THREE\.HemisphereLight\((0x[\da-f]+),\s*(0x[\da-f]+),\s*([\d.]+)\)/i,'sky'),[lighting.sky.color,lighting.sky.groundColor,lighting.sky.intensity]);
  assert.deepEqual(values(/new THREE\.DirectionalLight\((0x[\da-f]+),\s*([\d.]+)\)/i,'sun'),[lighting.sun.color,lighting.sun.intensity]);
  assert.deepEqual(values(/const offset = new THREE\.Vector3\((-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\)/,'direction'),lighting.sun.direction);
  assert.deepEqual(values(/scene\.environmentIntensity = ([\d.]+)/,'environment'),[lighting.environmentDiffuse]);
}
export function validatePacked(data) {
  assert.equal(data.version,4);assert.equal(data.segments,1440);assert.equal(data.rings,20);assert.equal(data.layers.length,3);
  assert.equal(data.elevationScale,256);assert.equal(data.crownRadiusScale,512);assert.equal(data.irradianceScale,4);
  assert.deepEqual(data.innerFractions,[0,.12,.26,.40,.52,.62,.71,.78,.835,.88,.915,.945,.97,.987,1]);
  assert.deepEqual(data.outerFractions,[.035,.095,.20,.37,.64,1]);
  const stride=data.segments+1,count=stride*(data.rings+1);
  return data.layers.map((layer,l)=>{
    const result={crownRadius:decodeFieldLE(layer.crownRadius,Uint16Array,stride),
      elevation:decodeFieldLE(layer.elevation,Int16Array,count),irradiance:decodeFieldLE(layer.irradiance,Uint8Array,count*3),
      geology:decodeFieldLE(layer.geology,Uint8Array,count*2)};
    assert.equal(result.crownRadius[0],result.crownRadius[data.segments],'Crown seam');
    assert.ok(result.crownRadius.every(x=>x>0&&x<(90+l*50)*data.crownRadiusScale),'Crown inside radial band');
    for(const [key,size]of [['elevation',1],['irradiance',3],['geology',2]])
      for(let j=0;j<=data.rings;j++)for(let c=0;c<size;c++)
        assert.equal(result[key][j*stride*size+c],result[key][(j*stride+data.segments)*size+c],`${key} seam`);
    return result;
  });
}
/** Build Float32 runtime positions once in JS; native source saving consumes
 * these exact bytes, never a separately rounded Python sin/cos reconstruction. */
export function decodeHorizonGeometry(data,ground=9) {
  assert.ok(Number.isFinite(ground));
  const fields=validatePacked(data),stride=data.segments+1,count=stride*(data.rings+1);
  return fields.map((field,layer)=>{
    const width=90+layer*50,inner=250+layer*125-width*.47;
    const position=new Float32Array(count*3),uv=new Float32Array(count*2),index=new Uint16Array(data.segments*data.rings*6);
    let offset=0;
    for(let j=0;j<=data.rings;j++)for(let i=0;i<=data.segments;i++) {
      const crest=inner+field.crownRadius[i]/data.crownRadiusScale;
      const radius=j<data.innerFractions.length?THREE.MathUtils.lerp(inner,crest,data.innerFractions[j]):
        THREE.MathUtils.lerp(crest,inner+width,data.outerFractions[j-data.innerFractions.length]);
      const angle=i/data.segments*Math.PI*2,k=j*stride+i;
      position[k*3]=Math.cos(angle)*radius;position[k*3+1]=i===data.segments?0:Math.sin(angle)*radius;
      position[k*3+2]=ground+field.elevation[k]/data.elevationScale;
      uv[k*2]=position[k*3]/8;uv[k*2+1]=position[k*3+1]/8;
      if(j<data.rings&&i<data.segments){index.set([k,k+stride,k+1,k+1,k+stride,k+stride+1],offset);offset+=6;}
    }
    return {position,uv,index,irradiance:field.irradiance,geology:field.geology};
  });
}
export function validateGeometry(layers) {
  return layers.map((layer,l)=>{
    const p=layer.position,indices=layer.index;let minArea=Infinity;
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const ab=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],ac=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];
      const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      assert.ok(cross.every(Number.isFinite)&&cross[2]>0,`Inverted/degenerate terrain face in layer ${l}`);
      minArea=Math.min(minArea,Math.hypot(...cross)/2);
    }
    return {vertices:p.length/3,triangles:indices.length/3,minTriangleArea:minArea,
      fields:Object.fromEntries(Object.entries(layer).map(([name,array])=>[name,{bytes:array.byteLength,sha256:hash(Buffer.from(encodeFieldLE(array),'base64'))}]))};
  });
}
const json=value=>JSON.stringify(value)+'\n';
function writeJSON(file,value) {mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,json(value));}

/** CPU preparation only. Call from the existing asset scratch directory; this
 * intentionally does not publish assets or invoke Blender/browser/rendering. */
export function prepareHorizon({input=path.join(projectRoot,'assets/source/horizon-envelope-v3.json'),
  outputRoot,contextRoot=projectRoot,lightingFile=path.join(projectRoot,'assets/source/horizon-lighting.json'),
  sourceBlend=path.join(projectRoot,'assets/source/horizon-envelope-v3.blend'),
  sourceRecipe=path.join(projectRoot,'tools/assets/horizon-envelope-v3.py'),
  sourceRecord=path.join(projectRoot,'assets/source/horizon-envelope-v3-build.json'),
  runtimeFile=path.join(projectRoot,'apps/browser/src/horizon.ts')}={}) {
  assert.ok(outputRoot,'Explicit --output-root is required');outputRoot=path.resolve(outputRoot);
  assert.notEqual(path.resolve(input),path.join(outputRoot,'assets/horizon-relief.json'),'Authoring input must not be its output');
  const inputFiles={envelope:input,nativeEnvelope:sourceBlend,envelopeRecipe:sourceRecipe,envelopeRecord:sourceRecord,
    bakeRecipe:fileURLToPath(import.meta.url),saveRecipe:path.join(projectRoot,'tools/assets/horizon-save.py'),
    pipelineRecipe:path.join(projectRoot,'tools/build-assets.mjs'),lighting:lightingFile,runtime:runtimeFile};
  const inputs=Object.fromEntries(Object.entries(inputFiles).map(([key,file])=>[key,identify(file)]));
  const dependencyFiles=['apps/browser/src/lighting.ts','apps/browser/src/assets.ts','apps/browser/src/graphics.ts','apps/browser/src/surface-lighting.ts',
    'assets/textures/arroyo-grass.webp','assets/textures/arroyo-surfaces.webp','package-lock.json'];
  const dependencies=Object.fromEntries(dependencyFiles.map(file=>[file,{...identify(path.join(contextRoot,file)),path:file}]));
  const sourceBytes=readFileSync(input),lighting=JSON.parse(readFileSync(lightingFile)),envelopeRecord=JSON.parse(readFileSync(sourceRecord));
  assert.equal(hash(sourceBytes),inputs.envelope.sha256,'Envelope changed while reading');
  assert.equal(inputs.envelope.sha256,envelopeRecord.reliefSha256,'Retained envelope changed without authoring provenance');
  assert.equal(inputs.nativeEnvelope.sha256,envelopeRecord.sourceSha256,'Retained native source hash');
  assert.equal(inputs.envelopeRecipe.sha256,envelopeRecord.recipeSha256,'Retained authoring recipe hash');
  verifyLightingSource(lighting,readFileSync(path.join(contextRoot,'apps/browser/src/lighting.ts'),'utf8'));
  const {data,metrics}=bakeHorizonEnvelope(sourceBytes,lighting);
  const geometry=decodeHorizonGeometry(data),geometryMetrics=validateGeometry(geometry),runtimeBytes=Buffer.from(json(data));
  assert.ok(metrics.layers.every(layer=>!layer.lighting.clipped),'Irradiance encoding clipped');
  for(const [key,file]of Object.entries(inputFiles))assert.equal(identify(file).sha256,inputs[key].sha256,`Input changed during bake: ${file}`);
  for(const file of dependencyFiles)assert.equal(identify(path.join(contextRoot,file)).sha256,dependencies[file].sha256,`Dependency changed during bake: ${file}`);
  const record={version:2,status:'native-source-pending',
    inputs,dependencies,
    runtime:{path:'assets/horizon-relief.json',bytes:runtimeBytes.length,sha256:hash(runtimeBytes)},
    encoding:{version:4,byteOrder:'little-endian',elevation:'int16 / 256 metres relative to ground',crownRadius:'uint16 / 512 metres relative to band inner radius',
      irradiance:'normalized uint8 RGB × 4, linear',geology:'normalized uint8 RG',sourceGeometry:'float32 little-endian positions/UV; uint16 little-endian indices'},
    tools:{node:process.version,threeRevision:THREE.REVISION},lighting,metrics,geometry:geometryMetrics,
    quantization:{elevationMaxMetres:1/512,crownRadiusMaxMetres:1/1024,irradianceMaxPerChannel:4/510},
    limitations:['No GPU shader compilation or native visual acceptance is implied by this CPU build.',
      'Irradiance is sampled on the pre-quantized surface; the saved source uses exact decoded runtime geometry.',
      'Ambient diffuse/bounce is a static authored approximation; original surface maps are sampled by the runtime.']};
  const decoded={version:1,ground:9,runtimeSha256:record.runtime.sha256,layers:geometry.map(layer=>
    Object.fromEntries(Object.entries(layer).map(([key,array])=>[key,encodeFieldLE(array)])))};
  // Everything has passed CPU validation before any output is written. Caller
  // keeps these products in scratch space until native source validation passes.
  mkdirSync(path.join(outputRoot,'assets/source'),{recursive:true});
  writeFileSync(path.join(outputRoot,record.runtime.path),runtimeBytes);
  writeJSON(path.join(outputRoot,'assets/source/horizon-decoded.json'),decoded);
  writeJSON(path.join(outputRoot,'assets/source/horizon-build-pending.json'),record);
  return record;
}
export function completeHorizonProvenance(outputRoot,generator) {
  const source=path.join(outputRoot,'assets/source');
  const record=JSON.parse(readFileSync(path.join(source,'horizon-build-pending.json')));
  assert.equal(record.status,'native-source-pending');
  const native=JSON.parse(readFileSync(path.join(source,'horizon-native.json')));
  assert.equal(identify(path.join(outputRoot,record.runtime.path)).sha256,record.runtime.sha256);
  assert.equal(native.runtimeSha256,record.runtime.sha256);assert.equal(native.saveRecipeSha256,record.inputs.saveRecipe.sha256);
  assert.deepEqual(native.geometry,record.geometry.map(x=>({vertices:x.vertices,triangles:x.triangles,fields:x.fields})));
  assert.equal(native.sourceSha256,identify(path.join(source,'horizon.blend')).sha256);
  assert.equal(native.blender.version,generator.version);assert.equal(native.blender.executableSha256,generator.executableSha256);
  if(generator.buildHash)assert.equal(native.blender.buildHash,generator.buildHash);
  record.status='complete';record.nativeSource={...identify(path.join(source,'horizon.blend')),path:'assets/source/horizon.blend'};
  record.native={...native.blender,...generator};
  const target=path.join(source,'horizon-build.json');writeJSON(target+'.tmp',record);renameSync(target+'.tmp',target);
  return record;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {values}=parseArgs({options:{input:{type:'string'},'output-root':{type:'string'},'context-root':{type:'string'},
    lighting:{type:'string'},'source-blend':{type:'string'},'source-recipe':{type:'string'},'source-record':{type:'string'},runtime:{type:'string'},help:{type:'boolean',short:'h'}}});
  if(values.help)console.log('CPU horizon bake (no Blender/browser). --output-root PATH required. Optional --input, --lighting, --source-blend, --source-recipe, --source-record, --runtime, --context-root. Defaults are retained source paths in this project. Outputs remain pending until horizon-save.py and native provenance validation complete.');
  else {
    const result=prepareHorizon({input:values.input,outputRoot:values['output-root'],contextRoot:values['context-root'],lightingFile:values.lighting,
      sourceBlend:values['source-blend'],sourceRecipe:values['source-recipe'],sourceRecord:values['source-record'],runtimeFile:values.runtime});
    console.log(JSON.stringify({status:result.status,runtime:result.runtime,triangles:result.metrics.triangles}));
  }
}
