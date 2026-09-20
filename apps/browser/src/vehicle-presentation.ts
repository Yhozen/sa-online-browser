// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import type { Rotation } from "../../../packages/shared/protocol";

export interface VehiclePresentationInput { rotation?: Rotation; keys?: number }
interface Wheel { object: THREE.Object3D; neutral: THREE.Quaternion; up: THREE.Vector3; front: boolean }
interface Lamp { object: THREE.Mesh; original?: THREE.Material | THREE.Material[]; material: THREE.MeshStandardMaterial; base: THREE.Color; kind: "brake" | "reverse" }
interface GeometryReplacement { object: THREE.Mesh; original: THREE.BufferGeometry; replacement: THREE.BufferGeometry }
const clamp = THREE.MathUtils.clamp;
const AXLE = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;

/** Presentation follows observed vehicle motion; it never changes the physics,
 * vehicle root transform, cabin, wheel centers, or either occupant's anchor. */
export class VehiclePresentation {
  private wheels: Wheel[] = [];
  private lamps: Lamp[] = [];
  private replacements: GeometryReplacement[] = [];
  private additions: THREE.Mesh[] = [];
  private heading: number | null = null;
  private previousSpeed: number | null = null;
  private yawRate = 0;
  private disposed = false;
  private root: THREE.Group;
  private disposeMaterial: (material: THREE.Material) => void;
  private steerQuaternion = new THREE.Quaternion();
  private rollQuaternion = new THREE.Quaternion();
  private orientation = new THREE.Quaternion();
  private forward = new THREE.Vector3();
  readonly state = { signedSpeed: 0, rolling: 0, steering: 0, braking: 0, reversing: 0 };

  constructor(root: THREE.Group, disposeMaterial: (material: THREE.Material) => void = material => material.dispose()) {
    this.root = root;
    this.disposeMaterial = disposeMaterial;
    root.updateMatrixWorld(true);
    const rootInverse = root.matrixWorld.clone().invert(), rootRotation = root.getWorldQuaternion(new THREE.Quaternion());
    const rootUp = new THREE.Vector3(0, 0, 1).applyQuaternion(rootRotation);
    const meshes: THREE.Mesh[] = [];
    root.traverse(object => {
      if (/^wheel_(left|right)_\d+$/.test(object.name)) {
        const point = object.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
        const parentRotation = object.parent!.getWorldQuaternion(new THREE.Quaternion());
        this.wheels.push({ object, neutral: object.quaternion.clone(), up: rootUp.clone().applyQuaternion(parentRotation.invert()).normalize(), front: point.y > 0 });
      }
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    for (const object of meshes) {
      // The exported tail mesh contains only the red lenses and optic elements;
      // clone it per car so braking never illuminates another vehicle's lights.
      if (object.material instanceof THREE.MeshStandardMaterial && object.material.name === "tail") {
        const original = object.material, material = original.clone();
        object.material = material;
        this.lamps.push({ object, original, material, base: material.color.clone(), kind: "brake" });
      }
      // Blender batches the two existing reverse-lamp boxes with white plates
      // and running lights. Partition their exact authored triangles rather than
      // illuminating every ivory detail or adding a floating light overlay.
      if (object.material instanceof THREE.MeshStandardMaterial && object.material.name === "ivory") {
        const source = object.geometry, positions = source.getAttribute("position"), indices = source.index;
        const transform = rootInverse.clone().multiply(object.matrixWorld), point = new THREE.Vector3();
        const reverse: number[] = [], rest: number[] = [];
        const count = indices?.count ?? positions.count;
        for (let i = 0; i < count; i += 3) {
          const triangle = [0, 1, 2].map(offset => indices?.getX(i + offset) ?? i + offset);
          const isReverse = triangle.every(index => {
            point.fromBufferAttribute(positions, index).applyMatrix4(transform);
            return Math.abs(Math.abs(point.x) - .42) <= .034 && Math.abs(point.y + 2.235) <= .006 && Math.abs(point.z + .327) <= .0095;
          });
          (isReverse ? reverse : rest).push(...triangle);
        }
        if (reverse.length === 0 || rest.length === 0) continue;
        const replacement = source.clone(); replacement.setIndex(rest);
        object.geometry = replacement; this.replacements.push({ object, original: source, replacement });
        const geometry = source.clone(); geometry.setIndex(reverse);
        const material = object.material.clone(); material.name = "reverse-lamp-owned";
        const light = new THREE.Mesh(geometry, material); light.name = "reverse-lamps";
        light.position.copy(object.position); light.quaternion.copy(object.quaternion); light.scale.copy(object.scale);
        light.castShadow = object.castShadow; light.receiveShadow = object.receiveShadow;
        object.parent!.add(light); this.additions.push(light);
        this.lamps.push({ object: light, material, base: material.color.clone(), kind: "reverse" });
      }
    }
    this.lights();
    root.userData.vehiclePresentation = this.state;
  }

  advance(velocity: readonly number[], dt: number, input: VehiclePresentationInput = {}) {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0 || dt > .5 || velocity.length < 3 || !velocity.every(Number.isFinite)) return;
    if (input.rotation && input.rotation.every(Number.isFinite)) {
      const [w, x, y, z] = input.rotation;
      this.orientation.set(-x, -y, -z, w).normalize();
    } else this.orientation.copy(this.root.quaternion);
    this.forward.set(0, 1, 0).applyQuaternion(this.orientation);
    const signedSpeed = clamp(velocity[0] * this.forward.x + velocity[1] * this.forward.y + velocity[2] * this.forward.z, -45, 45);
    const heading = Math.atan2(-this.forward.x, this.forward.y);
    const change = this.heading === null ? 0 : Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading));
    // Snapshot headings can remain constant across several fixed ticks, then
    // advance together. A short filter turns that cadence into stable steering.
    // Large authoritative heading corrections snap the presentation neutral.
    if (Math.abs(change) > .7) this.yawRate = 0;
    else this.yawRate += (clamp(change / dt, -3, 3) - this.yawRate) * (1 - Math.exp(-dt * 10));
    this.heading = heading;
    const desiredSteering = Math.abs(signedSpeed) > .4 ? clamp(Math.atan(2.76 * this.yawRate / signedSpeed), -.45, .45) : 0;
    this.state.steering += (desiredSteering - this.state.steering) * (1 - Math.exp(-dt * 12));
    this.state.rolling = (this.state.rolling + signedSpeed * dt / .41) % TAU;
    this.state.signedSpeed = signedSpeed;
    for (const wheel of this.wheels) {
      this.steerQuaternion.setFromAxisAngle(wheel.up, wheel.front ? this.state.steering : 0);
      this.rollQuaternion.setFromAxisAngle(AXLE, this.state.rolling);
      wheel.object.quaternion.copy(this.steerQuaternion).multiply(wheel.neutral).multiply(this.rollQuaternion);
    }
    const deceleration = this.previousSpeed === null ? 0 : (Math.abs(this.previousSpeed) - Math.abs(signedSpeed)) / dt;
    const keys = input.keys ?? 0;
    const pedal = Boolean(keys & 32) && signedSpeed > .15;
    const handbrake = Boolean(keys & 128) && Math.abs(signedSpeed) > .15;
    const braking = pedal || handbrake || (Math.abs(signedSpeed) > .35 && deceleration > 3.5);
    this.state.braking += (Number(braking) - this.state.braking) * (1 - Math.exp(-dt * 22));
    this.state.reversing += (Number(signedSpeed < -.15) - this.state.reversing) * (1 - Math.exp(-dt * 16));
    this.previousSpeed = signedSpeed;
    this.lights();
  }

  private lights() {
    for (const lamp of this.lamps) {
      const brightness = lamp.kind === "brake" ? this.state.braking : this.state.reversing;
      const active = lamp.kind === "brake" ? new THREE.Color(0xff0802) : new THREE.Color(0xfff3db);
      const idle = lamp.base.clone().multiplyScalar(lamp.kind === "brake" ? .65 : .48);
      // Keep the owned Standard material current while Low is displayed, so a
      // graphics switch preserves the lamp state. Low uses its actual cached
      // Basic material's color since Basic has no emissive lighting channel.
      lamp.material.color.copy(idle);
      lamp.material.emissive.copy(active);
      // Keep red within the useful ACES exposure range; excessive emission turns
      // saturated red lenses peach even without a bloom pass.
      lamp.material.emissiveIntensity = brightness * (lamp.kind === "brake" ? .8 : 2);
      const visible = lamp.object.material;
      if (visible instanceof THREE.MeshBasicMaterial) visible.color.copy(idle).lerp(active, brightness);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const wheel of this.wheels) wheel.object.quaternion.copy(wheel.neutral);
    for (const lamp of this.lamps) {
      if (lamp.original) lamp.object.material = lamp.original;
      this.disposeMaterial(lamp.material);
    }
    for (const { object, original, replacement } of this.replacements) { object.geometry = original; replacement.dispose(); }
    for (const addition of this.additions) { addition.removeFromParent(); addition.geometry.dispose(); }
    delete this.root.userData.vehiclePresentation;
    this.wheels.length = 0; this.lamps.length = 0; this.replacements.length = 0; this.additions.length = 0;
  }
}
