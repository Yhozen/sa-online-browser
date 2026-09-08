// SPDX-License-Identifier: GPL-3.0-or-later
/** Sampling preparation for cutout foliage. Source art remains unchanged. */
export type CutoutMip = { data: Uint8Array; width: number; height: number };
const linear = Float32Array.from({length:256}, (_,i) => {
  const s=i/255;return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);
});
function srgb(value:number) {
  return Math.round(255*(value<=.0031308?value*12.92:1.055*Math.pow(value,1/2.4)-.055));
}
function edgeColors(level:CutoutMip) {
  // Give bilinear taps outside an alpha contour the nearby leaf's color. This
  // changes only invisible RGB, never alpha/shape, and is repeated at every mip.
  const {width:w,height:h,data}=level;
  let valid=Uint8Array.from({length:w*h},(_,i)=>data[i*4+3]>0?1:0);
  for(let pass=0;pass<2;pass++) {
    const next=new Uint8Array(valid), output=new Uint8Array(data);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const i=y*w+x;if(valid[i])continue;
      let n=0,r=0,g=0,b=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;
        const j=yy*w+xx;if(!valid[j])continue;
        r+=linear[data[j*4]];g+=linear[data[j*4+1]];b+=linear[data[j*4+2]];n++;
      }
      if(n){output[i*4]=srgb(r/n);output[i*4+1]=srgb(g/n);output[i*4+2]=srgb(b/n);next[i]=1;}
    }
    data.set(output);valid=next;
  }
}
export function cutoutMipmaps(input:CutoutMip, threshold=.45):CutoutMip[] {
  const {width,height}=input;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||input.data.length!==width*height*4)
    throw Error('Invalid cutout image dimensions.');
  if(!(threshold>0 && threshold<1))throw Error('Invalid alpha threshold.');
  const first={width,height,data:new Uint8Array(input.data)}, levels=[first];
  let covered=0;for(let i=3;i<first.data.length;i+=4)if(first.data[i]/255>=threshold)covered++;
  const coverage=covered/(width*height);
  // Unscaled alpha feeds the next reduction. Coverage adjustment must not
  // accumulate through the chain and eventually turn transparent gaps opaque.
  let previous=first;
  while(previous.width>1||previous.height>1) {
    const w=Math.max(1,Math.floor(previous.width/2)),h=Math.max(1,Math.floor(previous.height/2));
    const data=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const x0=Math.floor(x*previous.width/w),x1=Math.floor((x+1)*previous.width/w);
      const y0=Math.floor(y*previous.height/h),y1=Math.floor((y+1)*previous.height/h);
      let a=0,r=0,g=0,b=0,n=0;
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++) {
        const j=(yy*previous.width+xx)*4,alpha=previous.data[j+3]/255;
        a+=alpha;r+=linear[previous.data[j]]*alpha;g+=linear[previous.data[j+1]]*alpha;b+=linear[previous.data[j+2]]*alpha;n++;
      }
      const i=(y*w+x)*4;
      if(a){data[i]=srgb(r/a);data[i+1]=srgb(g/a);data[i+2]=srgb(b/a);}
      data[i+3]=Math.round(255*a/n);
    }
    previous={width:w,height:h,data};
    const output={width:w,height:h,data:new Uint8Array(data)};
    // A histogram makes a monotone coverage search cheap for non-power-of-two art.
    const hist=new Uint32Array(256);for(let i=3;i<data.length;i+=4)hist[data[i]]++;
    let best=1,bestError=Infinity;
    for(let boundary=1;boundary<256;boundary++) {
      let n=0;for(let a=boundary;a<256;a++)n+=hist[a];
      const error=Math.abs(n/(w*h)-coverage);
      const scale=threshold*255/(boundary-.5);
      if(error<bestError || (error===bestError && Math.abs(scale-1)<Math.abs(best-1))){best=scale;bestError=error;}
    }
    // Alpha zero remains zero. No global mip bias or resolution reduction.
    for(let i=3;i<data.length;i+=4)output.data[i]=Math.min(255,Math.round(data[i]*best));
    levels.push(output);
  }
  levels.forEach(edgeColors);
  return levels;
}
