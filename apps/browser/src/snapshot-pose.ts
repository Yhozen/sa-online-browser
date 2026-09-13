// SPDX-License-Identifier: GPL-3.0-or-later
import { Quaternion, Vector3 } from "three";
import type { Rotation, Vec3 } from "../../../packages/shared/protocol";

type NetworkPose = { position: Vec3; rotation: Rotation; velocity: Vec3 };
type Sample = { time: number; receivedAt: number; motionTime: number; position: Vector3; quaternion: Quaternion; velocity: Vector3 };

/** Remote presentation only. Server/worker states remain the authority. */
export class SnapshotPose {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  readonly delayMs = 100;
  private readonly samples: Sample[] = [];
  private clockOffset = 0;

  reset(pose: NetworkPose, now: number) {
    this.samples.length = 0;
    this.clockOffset = 0;
    this.push(pose, now);
  }

  push(pose: NetworkPose, now: number) {
    const previous = this.samples.at(-1);
    if (previous && now < previous.receivedAt) return;
    const sample: Sample = {
      time: now,
      receivedAt: now,
      motionTime: now,
      position: new Vector3(...pose.position),
      quaternion: new Quaternion(-pose.rotation[1], -pose.rotation[2], -pose.rotation[3], pose.rotation[0]),
      velocity: new Vector3(...pose.velocity),
    };
    // Legacy peer packets carry no teleport flag. A displacement beyond the
    // reported movement envelope is a correction, never a trip across the map.
    if (previous && sample.position.distanceTo(previous.position) >
        1 + 2 * Math.max(previous.velocity.length(), sample.velocity.length()) * (now - previous.receivedAt) / 1000) {
      this.samples.length = 0;
      this.clockOffset = 0;
    }
    if (this.samples.length && previous) {
      const receivedInterval = now - previous.receivedAt;
      sample.motionTime = previous.motionTime + receivedInterval;
      const velocity = previous.velocity.clone().add(sample.velocity).multiplyScalar(.5);
      const movement = sample.position.clone().sub(previous.position);
      const interval = velocity.lengthSq() > .01 ? movement.dot(velocity) / velocity.lengthSq() * 1000 : 0;
      const residual = movement.clone().addScaledVector(velocity, -interval / 1000).length();
      // Packet arrival jitter is not movement. When both velocities explain
      // the displacement, recover its elapsed interval instead of making the
      // actor speed up and slow down with each network delivery.
      if (previous.velocity.dot(sample.velocity) > .01 && interval >= 1 &&
          interval <= receivedInterval + 200 && residual <= .1 + movement.length() * .1)
        sample.motionTime = previous.motionTime + interval;
      // Anchor that motion timeline to the earliest actual receipt. Never
      // schedule a received pose in the future or backdate it by over 100ms.
      const offset = Math.max(now - 100 - sample.motionTime,
        Math.min(this.clockOffset, now - sample.motionTime));
      const correction = offset - this.clockOffset;
      for (const queued of this.samples) queued.time += correction;
      this.clockOffset = offset;
      sample.time = sample.motionTime + offset;
    }
    if (this.samples.at(-1)?.time === sample.time) this.samples.pop();
    this.samples.push(sample);
    while (this.samples.length > 32) this.samples.shift();
    if (this.samples.length === 1) {
      this.position.copy(sample.position);
      this.quaternion.copy(sample.quaternion);
    }
  }

  sample(now: number) {
    if (!this.samples.length) return;
    const time = now - this.delayMs;
    while (this.samples.length > 2 && this.samples[1].time <= time) this.samples.shift();
    const a = this.samples[0], b = this.samples[1];
    if (time <= a.time) {
      this.position.copy(a.position);
      this.quaternion.copy(a.quaternion);
      return;
    }
    if (!b || time >= b.time) {
      const latest = b ?? a;
      // Cover a brief missing packet with its reported velocity, then hold.
      // Both the interpolation delay and extrapolation horizon are bounded.
      const seconds = Math.min(100, time - latest.time) / 1000;
      this.position.copy(latest.position).addScaledVector(latest.velocity, seconds);
      this.quaternion.copy(latest.quaternion);
      return;
    }
    const seconds = (b.time - a.time) / 1000;
    const t = (time - a.time) / (b.time - a.time), t2 = t * t, t3 = t2 * t;
    for (const axis of ["x", "y", "z"] as const) {
      const distance = b.position[axis] - a.position[axis];
      let start = a.velocity[axis] * seconds, end = b.velocity[axis] * seconds;
      // Monotone Hermite tangents prevent a stopped actor overshooting a wall.
      if (start * distance <= 0) start = 0;
      if (end * distance <= 0) end = 0;
      const magnitude = distance === 0 ? 0 : Math.hypot(start / distance, end / distance);
      if (magnitude > 3) { start *= 3 / magnitude; end *= 3 / magnitude; }
      this.position[axis] = (2 * t3 - 3 * t2 + 1) * a.position[axis] +
        (t3 - 2 * t2 + t) * start + (-2 * t3 + 3 * t2) * b.position[axis] + (t3 - t2) * end;
    }
    this.quaternion.slerpQuaternions(a.quaternion, b.quaternion, t);
  }
}
