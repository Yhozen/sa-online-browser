// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { CharacterAnimation } from "./character-animation";
import { VehiclePresentation, type VehiclePresentationInput } from "./vehicle-presentation";
import { contactShadow } from "./shadows";
import { disposeQualityMaterial } from "./graphics";
import { asset, clips } from "./assets";
import type { PlayerState } from "../../../packages/shared/protocol";
const actors = new WeakMap<
  THREE.Group,
  {
    animation: CharacterAnimation;
    outfit: THREE.Material[];
  }
>();
const cars = new WeakMap<THREE.Group, VehiclePresentation>();
export function createCharacter(variant = 0) {
  const group = asset("neighbor");
  group.add(contactShadow(1.3, 1.3));
  group.children[0].position.z = -1;
  const outfit: THREE.Material[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const replaced = list.map((m) => {
        if (m.name !== "outfit") return m;
        const c = (m as THREE.MeshStandardMaterial).clone();
        c.color.set(variant % 2 ? 0x8f4931 : 0x795139);
        outfit.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? replaced : replaced[0];
    }
  });
  actors.set(group, { animation: new CharacterAnimation(group, clips()), outfit });
  return group;
}
export function advanceCharacter(
  group: THREE.Group,
  state: PlayerState,
  dt: number,
  groundZ: number,
) {
  const a = actors.get(group);
  if (!a) return;
  a.animation.advance(state, dt, groundZ);
  group.userData.animation = a.animation.current;
  group.userData.seated = state.mode !== "onFoot";
}
/** Render-only placement follows the interpolated vehicle, independently of clip time. */
export function placeCharacter(group: THREE.Group, state: PlayerState, groundZ: number, vehicle?: THREE.Group) {
  if (!actors.has(group)) return;
  if (vehicle && state.mode !== "onFoot") {
    const anchor = vehicle.getObjectByName(
      state.mode === "driver" ? "seat_driver" : "seat_passenger",
    );
    if (anchor) {
      anchor.getWorldPosition(group.position);
      group.quaternion.copy(vehicle.quaternion);
    }
  }
  const shadow = group.getObjectByName("contact-shadow")!;
  shadow.visible = state.mode === "onFoot";
  shadow.position.z = groundZ + 0.02 - group.position.z;
}
export function disposeActor(group: THREE.Group) {
  cars.get(group)?.dispose();
  cars.delete(group);
  const a = actors.get(group);
  if (a) {
    group.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    });
    a.animation.dispose();
    a.outfit.forEach(disposeQualityMaterial);
    actors.delete(group);
  }
}
export function createCar() {
  const group = asset("coupe");
  cars.set(group, new VehiclePresentation(group, disposeQualityMaterial));
  group.add(contactShadow(3, 5.5));
  return group;
}
export function animateCar(group: THREE.Group, velocity: number[], dt: number, input?: VehiclePresentationInput) {
  cars.get(group)?.advance(velocity, dt, input);
}
