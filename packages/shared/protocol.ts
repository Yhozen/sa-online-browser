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
}
