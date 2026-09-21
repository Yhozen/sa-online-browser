/** Original PoC code: GPL-3.0-or-later. Coordinates are GTA world X,Y,Z; quaternion W,X,Y,Z. */
export type Vec3 = [
    number,
    number,
    number
];
export type Rotation = [
    number,
    number,
    number,
    number
];
export type PlayerMode = 'onFoot' | 'driver' | 'passenger';
export interface PlayerState {
    position: Vec3;
    rotation: Rotation;
    velocity: Vec3;
    mode: PlayerMode;
    vehicleId: number;
    seat: number;
    keys: number;
}
export type ClientMessage = {
    type: 'join';
    name: string;
    scene: {id:string;revision:string};
    version: 1;
} | ({
    type: 'state';
    epoch: number;
    seq: number;
    controlRevision: number;
} & PlayerState) | {
    type: 'chat' | 'command';
    text: string;
    epoch: number;
} | {
    type: 'disconnect';
    epoch: number;
};
export interface ServerMessage {
    type: string;
    epoch?: number;
    seq?: number;
    controlRevision?: number;
    id?: number;
    playerId?: number;
    name?: string;
    text?: string;
    message?: string;
    reason?: string;
    position?: Vec3;
    rotation?: Rotation;
    velocity?: Vec3;
    mode?: PlayerMode;
    vehicleId?: number;
    seat?: number;
    heading?: number;
    model?: number;
    onFootRate?: number;
    inCarRate?: number;
    keys?: number;
}

/** Fixture activity state received through unchanged open.mp ClientMessage RPCs. */
export interface ChallengeState {
    version: 1;
    generation: number;
    phase: 'idle' | 'countdown' | 'running' | 'finished' | 'cancelled';
    driverId: number;
    passengerId: number;
    vehicleId: number;
    checkpointIndex: number;
    checkpointCount: number;
    elapsedMs: number;
    countdownMs: number;
    bestMs: number;
    serverTick: number;
    reason: 'none' | 'driver_exit' | 'passenger_exit' | 'driver_disconnect' | 'passenger_disconnect' | 'reset' | 'cancelled' | 'left_start' | 'timeout' | 'teleport' | 'seat_change';
}
export interface RaceCheckpoint {
    checkpointType: number;
    position: Vec3;
    nextPosition: Vec3;
    radius: number;
}
export interface ChallengeScore {
    generation: number;
    rank: number;
    timeMs: number;
    driverName: string;
    passengerName: string;
}
