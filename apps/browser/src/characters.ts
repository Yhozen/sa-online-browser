// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import {asset,clips} from './assets';
import type {PlayerState} from '../../../packages/shared/protocol';
const actors=new WeakMap<THREE.Group,{mixer:THREE.AnimationMixer;actions:Map<string,THREE.AnimationAction>;current:string;outfit:THREE.Material[]}>();
export function createCharacter(variant=0){
 const group=asset('neighbor');group.children[0].position.z=-1;
 const outfit:THREE.Material[]=[];
 group.traverse(o=>{if(o instanceof THREE.Mesh){const list=Array.isArray(o.material)?o.material:[o.material];const replaced=list.map(m=>{if(m.name!=='outfit')return m;const c=(m as THREE.MeshStandardMaterial).clone();c.color.set(variant%2?0xa95032:0x2d7774);outfit.push(c);return c;});o.material=Array.isArray(o.material)?replaced:replaced[0];}});
 const mixer=new THREE.AnimationMixer(group);const actions=new Map<string,THREE.AnimationAction>();for(const clip of clips()){const name=clip.name.split('|').pop()!;actions.set(name,mixer.clipAction(clip));}
 actors.set(group,{mixer,actions,current:'',outfit});return group;
}
export function animateCharacter(group:THREE.Group,state:PlayerState,dt:number,groundZ:number,vehicle?:THREE.Group){
 const a=actors.get(group);if(!a)return;
 const name=state.mode!=='onFoot'?'seated':state.position[2]>groundZ+1.06?'jump':Math.hypot(...state.velocity.slice(0,2))>.2?'walk':'idle';
 if(a.current!==name){a.actions.get(a.current)?.fadeOut(.12);a.actions.get(name)?.reset().fadeIn(.12).play();a.current=name;}
 a.mixer.update(dt);
 if(vehicle&&state.mode!=='onFoot'){
  const anchor=vehicle.getObjectByName(state.mode==='driver'?'seat_driver':'seat_passenger');
  if(anchor){anchor.getWorldPosition(group.position);group.quaternion.copy(vehicle.quaternion);}
 }
 group.userData.animation=name;group.userData.seated=state.mode!=='onFoot';
}
export function disposeActor(group:THREE.Group){const a=actors.get(group);if(a){a.mixer.stopAllAction();a.mixer.uncacheRoot(group);a.outfit.forEach(m=>m.dispose());actors.delete(group);}}
export function createCar(){return asset('coupe');}
export function animateCar(group:THREE.Group,velocity:number[],dt:number){const distance=Math.hypot(velocity[0],velocity[1])*dt;group.traverse(o=>{if(o.name.startsWith('wheel')||o.name.startsWith('hub'))o.rotateZ(distance/.41);});}
