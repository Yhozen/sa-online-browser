// SPDX-License-Identifier: GPL-3.0-or-later
// Editable layout recipe. Generated manifests are committed and consumed directly.
import {readFileSync,writeFileSync} from 'node:fs';
const yard={id:'yard',name:'The test yard',revision:'yard-1',...JSON.parse(readFileSync('test-server/arena.json')),teleport:[-4,-4,10],houses:[],props:[],roads:[],route:[]};
const n={id:'neighborhood',name:'Arroyo',revision:'arroyo-1',groundZ:9,halfSize:90,spawns:[[-4,0,10],[4,0,10]],teleport:[-4,-4,10],vehicle:{model:411,position:[0,6,10],heading:0},barriers:[],houses:[],props:[],roads:[{points:[[0,-66],[0,40]],width:12},{points:[[0,-48],[58,-48],[58,12],[0,12]],width:12}],culdesac:{center:[0,40],radius:18},route:[[0,6],[0,12],[58,12],[58,-48],[0,-48],[0,6]]};
const barrier=(id,x,y,w,d,h=3)=>n.barriers.push({id,position:[x,y,9+h/2],size:[w,d,h]});
barrier('boundary-west',-90,0,2,182,4);barrier('boundary-east',90,0,2,182,4);barrier('boundary-north',0,90,180,2,4);barrier('boundary-south',0,-90,180,2,4);
// Rotations are radians about Z. House front is local -Y.
const lots=[[-27,-46,Math.PI/2],[-27,-18,Math.PI/2],[-27,11,Math.PI/2],[-28,43,Math.PI/2],[0,71,0],[29,43,-Math.PI/2],[77,12,-Math.PI/2],[77,-22,-Math.PI/2],[28,-19,0],[29,-72,Math.PI]];
for(let i=0;i<lots.length;i++){
 const [x,y,rotation]=lots[i],variant=i%4;n.houses.push({id:`house-${i}`,asset:`house-${variant}`,position:[x,y,9],rotation});
 const turn=Math.abs(Math.sin(rotation))>.5; barrier(`house-${i}`,x,y,turn?12:16,turn?16:12,5.8);
 const point=(u,v)=>[x+u*Math.cos(rotation)-v*Math.sin(rotation),y+u*Math.sin(rotation)+v*Math.cos(rotation),9];
 for(const [u,v,w,d] of [[-11,0,.15,23],[11,0,.15,23],[0,11,22,.15],[-5,-11,12,.15]]){
  const p=point(u,v);barrier(`fence-${i}-${u}-${v}`,p[0],p[1],turn?d:w,turn?w:d,1.05);
  n.props.push({asset:'fence',position:p,rotation:rotation+(w>d?0:Math.PI/2),scale:[Math.max(w,d)/4,1,1]});
 }
 for(const [asset,u,v] of [['mailbox',-9,-11],['bin',8,-8],['palm',-8,-7],['tree',8,8]]){const p=point(u,v);n.props.push({asset,position:p,rotation:0});if(asset==='palm'||asset==='tree')barrier(`${asset}-${i}`,p[0],p[1],.7,.7,8);}
}
for(const y of [-62,-30,2,34])for(const x of [-9,9]){n.props.push({asset:'pole',position:[x,y,9],rotation:0});n.props.push({asset:'lamp',position:[x*1.3,y+8,9],rotation:x<0?0:Math.PI});}
for(const x of [22,50])for(const y of [-57,21])n.props.push({asset:'palm',position:[x,y,9],rotation:0});
for(const scene of [yard,n])writeFileSync(`packages/shared/scenes/${scene.id}.json`,JSON.stringify(scene,null,2)+'\n');
