// SPDX-License-Identifier: GPL-3.0-or-later
import { Quaternion, Vector3 } from "three";
import type { Rotation, Vec3 } from "../../../packages/shared/protocol";

type Pose = { position: Vec3; rotation: Rotation };

/** Render-only history: never write the interpolated pose back to simulation. */
export class InterpolatedPose {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  private readonly previousPosition = new Vector3();
  private readonly previousQuaternion = new Quaternion();
  private readonly olderPosition = new Vector3();
  private readonly olderQuaternion = new Quaternion();
  private readonly currentQuaternion = new Quaternion();

  constructor(pose: Pose) { this.reset(pose); }

  /** Capture before each fixed step, including every step of a catch-up frame. */
  capture(pose: Pose) {
    this.olderPosition.copy(this.previousPosition);
    this.olderQuaternion.copy(this.previousQuaternion);
    this.previousPosition.set(...pose.position);
    this.readRotation(this.previousQuaternion, pose.rotation);
  }

  /** Corrections and transitions cut immediately, without replaying old motion. */
  reset(pose: Pose) {
    this.capture(pose);
    this.olderPosition.copy(this.previousPosition);
    this.olderQuaternion.copy(this.previousQuaternion);
    this.position.copy(this.previousPosition);
    this.quaternion.copy(this.previousQuaternion);
  }

  sample(pose: Pose, alpha: number) {
    // The input/publish timer may already have stepped beyond a queued rAF.
    // Retain one extra interval to sample that display timestamp, not timer time.
    if (alpha < 0) {
      const fraction = Math.max(0, 1 + alpha);
      this.position.lerpVectors(this.olderPosition, this.previousPosition, fraction);
      this.quaternion.slerpQuaternions(this.olderQuaternion, this.previousQuaternion, fraction);
      return;
    }
    this.position.set(...pose.position).lerp(this.previousPosition, 1 - alpha);
    this.readRotation(this.currentQuaternion, pose.rotation);
    this.quaternion.slerpQuaternions(this.previousQuaternion, this.currentQuaternion, alpha);
  }

  private readRotation(target: Quaternion, rotation: Rotation) {
    // Native protocol quaternions use the conjugate of the render orientation.
    target.set(-rotation[1], -rotation[2], -rotation[3], rotation[0]);
  }
}
