// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import type {CollisionIndex} from './collision';
export class FollowCamera {
 yaw=0;pitch=.29;distance=7;obstruction=1;private dragging=false;private lastOrbit=0;private initialized=false;
 constructor(readonly camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement){
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{if(e.button===2){this.dragging=true;canvas.setPointerCapture(e.pointerId);}});
  canvas.addEventListener('pointerup',e=>{this.dragging=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!this.dragging)return;this.yaw-=e.movementX*.005;this.pitch=THREE.MathUtils.clamp(this.pitch+e.movementY*.003,.05,1.1);this.lastOrbit=performance.now();});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=THREE.MathUtils.clamp(this.distance+e.deltaY*.006,3,16);},{passive:false});
  window.addEventListener('blur',()=>this.dragging=false);
 }
 movement(x:number,y:number):[number,number]{return [x*Math.cos(this.yaw)-y*Math.sin(this.yaw),x*Math.sin(this.yaw)+y*Math.cos(this.yaw)];}
 update(position:number[],heading:number,driving:boolean,dt:number,index:CollisionIndex){
  if(driving&&!this.dragging&&performance.now()-this.lastOrbit>1500){const error=Math.atan2(Math.sin(heading-this.yaw),Math.cos(heading-this.yaw));this.yaw+=error*(1-Math.exp(-dt*3));}
  const target=new THREE.Vector3(position[0],position[1],position[2]+.55),d=this.distance+(driving?2:0);
  const desired=target.clone().add(new THREE.Vector3(Math.sin(this.yaw)*d*Math.cos(this.pitch),-Math.cos(this.yaw)*d*Math.cos(this.pitch),d*Math.sin(this.pitch)));
  this.obstruction=index.fraction(target.toArray(),desired.toArray());desired.lerpVectors(target,desired,this.obstruction);
  if(!this.initialized||this.obstruction<1)this.camera.position.copy(desired);else this.camera.position.lerp(desired,1-Math.exp(-dt*10));
  // Also check the smoothed camera; a teleport must never leave it behind a house.
  const safe=index.fraction(target.toArray(),this.camera.position.toArray());if(safe<1)this.camera.position.lerpVectors(target,this.camera.position,safe);
  this.camera.lookAt(target);this.initialized=true;
 }
}
