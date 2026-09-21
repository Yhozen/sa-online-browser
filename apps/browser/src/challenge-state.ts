// SPDX-License-Identifier: GPL-3.0-or-later
import type { ChallengeState, ChallengeScore, RaceCheckpoint } from "../../../packages/shared/protocol";

export type ActivityCue = "countdown" | "start" | "checkpoint" | "finish" | "reset";
const phases = new Set(["idle", "countdown", "running", "finished", "cancelled"]);
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const vector = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 20000);

/** A presentation replica. Only received upstream notices can advance or finish a run. */
export class ChallengeReplica {
  state: ChallengeState | null = null;
  checkpoint: RaceCheckpoint | null = null;
  scores: ChallengeScore[] = [];
  receivedAt = 0;
  private scoreGeneration = -1;
  private scoreCount = 0;
  private pendingScores = new Map<number, ChallengeScore>();
  private countdownSecond = -1;

  clear() {
    this.state = null; this.checkpoint = null; this.scores = [];
    this.receivedAt = 0; this.scoreGeneration = -1; this.scoreCount = 0;
    this.pendingScores.clear(); this.countdownSecond = -1;
  }

  accept(event: Record<string, unknown>, now: number): ActivityCue | undefined {
    if (event.type === "raceCheckpointClear") { this.checkpoint = null; return; }
    if (event.type === "raceCheckpoint") {
      if (vector(event.position) && vector(event.nextPosition) &&
          typeof event.radius === "number" && event.radius > 0 && event.radius <= 100 &&
          integer(event.checkpointType, 0, 8)) {
        this.checkpoint = { position: [...event.position], nextPosition: [...event.nextPosition],
          radius: event.radius, checkpointType: event.checkpointType };
      }
      return;
    }
    if (event.type === "challengeScoresClear") {
      if (!integer(event.generation, 0, 2147483647) || !integer(event.count, 0, 5) ||
          event.generation < (this.state?.generation ?? 0) || event.generation < this.scoreGeneration) return;
      this.scoreGeneration = event.generation; this.scoreCount = event.count;
      this.pendingScores.clear();
      if (event.count === 0) this.scores = [];
      return;
    }
    if (event.type === "challengeScore") {
      if (event.generation !== this.scoreGeneration || !integer(event.rank, 1, this.scoreCount) ||
          !integer(event.timeMs, 1, 3600000) || typeof event.driverName !== "string" ||
          typeof event.passengerName !== "string" ||
          !/^[A-Za-z0-9_\[\]()$@.=\-]{1,24}$/.test(event.driverName) || !/^[A-Za-z0-9_\[\]()$@.=\-]{0,24}$/.test(event.passengerName)) return;
      const score: ChallengeScore = { generation: this.scoreGeneration, rank: event.rank,
        timeMs: event.timeMs, driverName: event.driverName, passengerName: event.passengerName };
      this.pendingScores.set(score.rank, score);
      if (this.pendingScores.size === this.scoreCount)
        this.scores = [...this.pendingScores.values()].sort((a, b) => a.rank - b.rank);
      return;
    }
    if (event.type !== "challenge" || event.version !== 1 || !phases.has(String(event.phase)) ||
        !integer(event.generation, 0, 2147483647) || event.generation < (this.state?.generation ?? 0) ||
        !integer(event.driverId, 0, 65535) || !integer(event.passengerId, 0, 65535) ||
        !integer(event.vehicleId, 0, 65535) || !integer(event.checkpointCount, 1, 64) ||
        !integer(event.checkpointIndex, 0, event.checkpointCount) ||
        !integer(event.elapsedMs, 0, 3600000) || !integer(event.countdownMs, 0, 60000) ||
        !integer(event.bestMs, 0, 3600000) || !integer(event.serverTick, -2147483648, 2147483647)) return;
    const old = this.state;
    this.state = { version: 1, generation: event.generation,
      phase: event.phase as ChallengeState["phase"], driverId: event.driverId,
      passengerId: event.passengerId, vehicleId: event.vehicleId,
      checkpointIndex: event.checkpointIndex, checkpointCount: event.checkpointCount,
      elapsedMs: event.elapsedMs, countdownMs: event.countdownMs, bestMs: event.bestMs,
      serverTick: event.serverTick, reason: (event.reason ?? "none") as ChallengeState["reason"] };
    this.receivedAt = now;
    if (!["running", "countdown"].includes(this.state.phase)) this.checkpoint = null;
    if (this.state.phase === "countdown") {
      const second = Math.ceil(this.state.countdownMs / 1000);
      if (second > 0 && (second !== this.countdownSecond || old?.generation !== this.state.generation)) {
        this.countdownSecond = second; return "countdown";
      }
    } else this.countdownSecond = -1;
    if (this.state.phase === "running" && old?.phase !== "running") return "start";
    if (this.state.phase === "finished" && (old?.phase !== "finished" || old.generation !== this.state.generation)) return "finish";
    if (this.state.phase === "cancelled" && old?.phase !== "cancelled") return "reset";
    if (this.state.phase === "running" && old && this.state.checkpointIndex > old.checkpointIndex) return "checkpoint";
  }

  display(now: number) {
    const state = this.state;
    // This small interpolation is display-only and stops when upstream notices stop.
    const age = Math.max(0, now - this.receivedAt);
    return {
      elapsedMs: (state?.elapsedMs ?? 0) + (state?.phase === "running" ? Math.min(age, 1500) : 0),
      countdown: state?.phase === "countdown" ? Math.max(0, Math.ceil((state.countdownMs - Math.min(age, 1500)) / 1000)) : 0,
      stale: !!state && ["running", "countdown"].includes(state.phase) && age > 2500,
    };
  }
}

export function formatRaceTime(milliseconds: number) {
  const hundredths = Math.floor(Math.max(0, milliseconds) / 10);
  return `${Math.floor(hundredths / 6000)}:${String(Math.floor(hundredths / 100) % 60).padStart(2, "0")}.${String(hundredths % 100).padStart(2, "0")}`;
}
