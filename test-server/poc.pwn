// SPDX-License-Identifier: GPL-3.0-or-later
#include <open.mp>
#include "arena.inc"

new Car;
new Driver = INVALID_PLAYER_ID;
new Passenger = INVALID_PLAYER_ID;
new SampleSequence;
new bool:ResetPending;
new bool:ResetTimeoutLogged;
new ResetRequestedAt;
new ResetDisconnectedPlayer = INVALID_PLAYER_ID;

forward Observe();

main() {}

stock SpawnPosition(playerid, &Float:x, &Float:y, &Float:z)
{
    x = playerid % 2 ? POC_SPAWN_X1 : POC_SPAWN_X0;
    y = POC_SPAWN_Y;
    z = POC_SPAWN_Z;
}

stock EscapeJSON(const source[], dest[], size)
{
    new cursor;
    for (new i; source[i] != '\0' && cursor < size - 2; i++)
    {
        if (source[i] == '"' || source[i] == '\\') dest[cursor++] = '\\';
        dest[cursor++] = source[i] < 32 ? ' ' : source[i];
    }
    dest[cursor] = '\0';
}

stock ClearSeat(playerid)
{
    if (Driver == playerid) Driver = INVALID_PLAYER_ID;
    if (Passenger == playerid) Passenger = INVALID_PLAYER_ID;
}

stock FinishReset()
{
    for (new id; id < MAX_PLAYERS; id++)
    {
        if (!IsPlayerConnected(id) || id == ResetDisconnectedPlayer) continue;
        new Float:x, Float:y, Float:z;
        SpawnPosition(id, x, y, z);
        SetPlayerPos(id, x, y, z);
        SetPlayerFacingAngle(id, 0.0);
    }
    SetVehiclePos(Car, POC_CAR_X, POC_CAR_Y, POC_CAR_Z);
    SetVehicleZAngle(Car, POC_CAR_HEADING);
    SetVehicleVelocity(Car, 0.0, 0.0, 0.0);
    SetVehicleHealth(Car, 1000.0);
    ResetPending = false;
    ResetDisconnectedPlayer = INVALID_PLAYER_ID;
    printf("POC {\"event\":\"reset\",\"tick\":%d}", GetTickCount());
}

stock ResetFixture(disconnectedPlayer = INVALID_PLAYER_ID)
{
    if (disconnectedPlayer != INVALID_PLAYER_ID) ResetDisconnectedPlayer = disconnectedPlayer;
    if (ResetPending) return;
    ResetPending = true;
    ResetTimeoutLogged = false;
    ResetRequestedAt = GetTickCount();
    Driver = INVALID_PLAYER_ID;
    Passenger = INVALID_PLAYER_ID;
    for (new id; id < MAX_PLAYERS; id++)
    {
        if (!IsPlayerConnected(id) || id == ResetDisconnectedPlayer) continue;
        // Also cancel a placement whose first vehicle synchronization is still pending.
        RemovePlayerFromVehicle(id);
    }
    printf("POC {\"event\":\"resetRequested\",\"tick\":%d}", ResetRequestedAt);
}

stock TryFinishReset()
{
    if (!ResetPending) return;
    for (new id; id < MAX_PLAYERS; id++)
    {
        if (!IsPlayerConnected(id) || id == ResetDisconnectedPlayer) continue;
        new PLAYER_STATE:playerState = GetPlayerState(id);
        if (playerState != PLAYER_STATE_ONFOOT && playerState != PLAYER_STATE_NONE)
        {
            if (!ResetTimeoutLogged && GetTickCount() - ResetRequestedAt >= 5000)
            {
                ResetTimeoutLogged = true;
                printf("POC {\"event\":\"resetWaiting\",\"player\":%d,\"state\":%d,\"tick\":%d}", id, _:playerState, GetTickCount());
                SendClientMessageToAll(0xFF9999FF, "Reset is waiting for players to leave the vehicle.");
            }
            return;
        }
    }
    // The received on-foot packet supersedes older vehicle packets on the same
    // unreliable-sequenced channel. Only now can the final vehicle correction stick.
    FinishReset();
}

public OnGameModeInit()
{
    SetGameModeText("Browser PoC");
    UsePlayerPedAnims();
    AddPlayerClass(0, POC_SPAWN_X0, POC_SPAWN_Y, POC_SPAWN_Z, 0.0, WEAPON_FIST, 0, WEAPON_FIST, 0, WEAPON_FIST, 0);
    Car = CreateVehicle(POC_CAR_MODEL, POC_CAR_X, POC_CAR_Y, POC_CAR_Z, POC_CAR_HEADING, 3, 3, -1);
    SetTimer("Observe", 200, true);
    printf("POC {\"event\":\"ready\",\"vehicle\":%d,\"tick\":%d}", Car, GetTickCount());
    return 1;
}

public OnPlayerConnect(playerid)
{
    new name[MAX_PLAYER_NAME + 1];
    GetPlayerName(playerid, name, sizeof name);
    SetPlayerColor(playerid, playerid % 2 ? 0xFFB74DFF : 0x4FC3F7FF);
    printf("POC {\"event\":\"connect\",\"player\":%d,\"name\":\"%s\",\"npc\":%d,\"tick\":%d}", playerid, name, IsPlayerNPC(playerid), GetTickCount());
    return 1;
}

public OnPlayerRequestClass(playerid, classid)
{
    #pragma unused classid
    new Float:x, Float:y, Float:z;
    SpawnPosition(playerid, x, y, z);
    SetSpawnInfo(playerid, NO_TEAM, 0, x, y, z, 0.0, WEAPON_FIST, 0, WEAPON_FIST, 0, WEAPON_FIST, 0);
    return 1;
}

public OnPlayerSpawn(playerid)
{
    new Float:x, Float:y, Float:z;
    SpawnPosition(playerid, x, y, z);
    SetPlayerPos(playerid, x, y, z);
    SetPlayerHealth(playerid, 100.0);
    printf("POC {\"event\":\"spawn\",\"player\":%d,\"x\":%.3f,\"y\":%.3f,\"z\":%.3f,\"tick\":%d}", playerid, x, y, z, GetTickCount());
    return 1;
}

public OnPlayerText(playerid, text[])
{
    new escaped[300];
    EscapeJSON(text, escaped, sizeof escaped);
    printf("POC {\"event\":\"chat\",\"player\":%d,\"text\":\"%s\",\"tick\":%d}", playerid, escaped, GetTickCount());
    return 1;
}

public OnPlayerCommandText(playerid, cmdtext[])
{
    if (!strcmp(cmdtext, "/exit", true))
    {
        ClearSeat(playerid);
        if (IsPlayerInAnyVehicle(playerid)) RemovePlayerFromVehicle(playerid);
        return 1;
    }
    if (!strcmp(cmdtext, "/reset", true))
    {
        ResetFixture();
        return 1;
    }
    if (!strcmp(cmdtext, "/teleport", true))
    {
        ClearSeat(playerid);
        if (IsPlayerInAnyVehicle(playerid)) RemovePlayerFromVehicle(playerid);
        SetPlayerPos(playerid, POC_TELEPORT_X, POC_TELEPORT_Y, POC_SPAWN_Z);
        printf("POC {\"event\":\"teleport\",\"player\":%d,\"tick\":%d}", playerid, GetTickCount());
        return 1;
    }
    new seat = -1;
    if (!strcmp(cmdtext, "/drive", true)) seat = 0;
    if (!strcmp(cmdtext, "/passenger", true)) seat = 1;
    if (seat == -1) return 0;
    if (ResetPending)
    {
        SendClientMessage(playerid, 0xFF9999FF, "Reset in progress. Wait before entering the car.");
        printf("POC {\"event\":\"seatRejected\",\"player\":%d,\"seat\":%d,\"reason\":\"reset\",\"tick\":%d}", playerid, seat, GetTickCount());
        return 1;
    }
    new Float:x, Float:y, Float:z;
    GetVehiclePos(Car, x, y, z);
    if (!IsPlayerInRangeOfPoint(playerid, 12.0, x, y, z))
    {
        SendClientMessage(playerid, 0xFF9999FF, "Move closer to the car.");
        printf("POC {\"event\":\"seatRejected\",\"player\":%d,\"seat\":%d,\"reason\":\"distance\",\"tick\":%d}", playerid, seat, GetTickCount());
        return 1;
    }
    new owner = seat == 0 ? Driver : Passenger;
    if (owner != INVALID_PLAYER_ID && owner != playerid)
    {
        SendClientMessage(playerid, 0xFF9999FF, "That seat is occupied.");
        printf("POC {\"event\":\"seatRejected\",\"player\":%d,\"seat\":%d,\"reason\":\"occupied\",\"tick\":%d}", playerid, seat, GetTickCount());
        return 1;
    }
    ClearSeat(playerid);
    if (seat == 0) Driver = playerid;
    else Passenger = playerid;
    PutPlayerInVehicle(playerid, Car, seat);
    printf("POC {\"event\":\"seatGranted\",\"player\":%d,\"vehicle\":%d,\"seat\":%d,\"tick\":%d}", playerid, Car, seat, GetTickCount());
    return 1;
}

public OnPlayerStateChange(playerid, PLAYER_STATE:newstate, PLAYER_STATE:oldstate)
{
    if (newstate == PLAYER_STATE_ONFOOT) ClearSeat(playerid);
    printf("POC {\"event\":\"state\",\"player\":%d,\"state\":%d,\"oldState\":%d,\"vehicle\":%d,\"tick\":%d}", playerid, _:newstate, _:oldstate, GetPlayerVehicleID(playerid), GetTickCount());
    return 1;
}

public OnPlayerExitVehicle(playerid, vehicleid)
{
    ClearSeat(playerid);
    printf("POC {\"event\":\"exit\",\"player\":%d,\"vehicle\":%d,\"tick\":%d}", playerid, vehicleid, GetTickCount());
    return 1;
}

public OnPlayerDisconnect(playerid, reason)
{
    new wasDriver = Driver == playerid;
    ClearSeat(playerid);
    if (wasDriver) ResetFixture(playerid);
    printf("POC {\"event\":\"disconnect\",\"player\":%d,\"reason\":%d,\"tick\":%d}", playerid, reason, GetTickCount());
    return 1;
}

public Observe()
{
    TryFinishReset();
    SampleSequence++;
    new count;
    for (new id; id < MAX_PLAYERS; id++)
    {
        if (!IsPlayerConnected(id)) continue;
        count++;
        new Float:x, Float:y, Float:z;
        GetPlayerPos(id, x, y, z);
        printf("POC {\"event\":\"player\",\"seq\":%d,\"player\":%d,\"state\":%d,\"vehicle\":%d,\"seat\":%d,\"x\":%.3f,\"y\":%.3f,\"z\":%.3f,\"tick\":%d}", SampleSequence, id, _:GetPlayerState(id), GetPlayerVehicleID(id), GetPlayerVehicleSeat(id), x, y, z, GetTickCount());
    }
    if (count)
    {
        new Float:x, Float:y, Float:z, Float:heading;
        GetVehiclePos(Car, x, y, z);
        GetVehicleZAngle(Car, heading);
        printf("POC {\"event\":\"vehicle\",\"seq\":%d,\"vehicle\":%d,\"driver\":%d,\"passenger\":%d,\"x\":%.3f,\"y\":%.3f,\"z\":%.3f,\"heading\":%.3f,\"tick\":%d}", SampleSequence, Car, Driver, Passenger, x, y, z, heading, GetTickCount());
    }
    return 1;
}
