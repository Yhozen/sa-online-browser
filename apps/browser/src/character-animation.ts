// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";

export type AnimatedState = { mode: string; position: number[]; velocity: number[] };
/** Shared by local and replicated actors; animation adds no protocol messages. */
export class CharacterAnimation {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  current = "";
  constructor(private root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) this.actions.set(clip.name.split("|").pop()!, this.mixer.clipAction(clip));
  }
  advance(state: AnimatedState, dt: number, groundZ: number) {
    const next = state.mode !== "onFoot" ? "seated"
      : state.position[2] > groundZ + 1.06 ? "jump"
      : Math.hypot(state.velocity[0], state.velocity[1]) > .2 ? "walk" : "idle";
    if (next !== this.current) {
      this.actions.get(this.current)?.fadeOut(.12);
      this.actions.get(next)?.reset().fadeIn(.12).play();
      this.current = next;
    }
    this.mixer.update(dt);
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
