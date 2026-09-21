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

// One shared, server-scored time trial. Numeric phases/reasons are the
// bounded ARROYO_RACE_V1 ClientMessage schema decoded by the native worker.
#define RACE_IDLE 0
#define RACE_COUNTDOWN 1
#define RACE_RUNNING 2
#define RACE_FINISHED 3
#define RACE_CANCELLED 4
#define RACE_SCORE_LIMIT 5

new bool:RaceEnabled = POC_CHALLENGE_ENABLED != 0;
new RaceGeneration;
new RacePhase;
new RaceDriver = INVALID_PLAYER_ID;
new RacePassenger = INVALID_PLAYER_ID;
new RaceIndex;
new RaceCountdownAt;
new RaceStartedAt;
new RaceElapsed;
new RaceReason;
new RaceBroadcastAt;
new Float:RaceCountdownPosition[3];
new RaceScoreCount;
new RaceScoreTimes[RACE_SCORE_LIMIT];
new RaceScoreDrivers[RACE_SCORE_LIMIT][MAX_PLAYER_NAME + 1];
new RaceScorePassengers[RACE_SCORE_LIMIT][MAX_PLAYER_NAME + 1];

stock bool:RaceActive()
{
    return RacePhase == RACE_COUNTDOWN || RacePhase == RACE_RUNNING;
}

stock RaceSendState(playerid = INVALID_PLAYER_ID)
{
    if (!RaceEnabled) return;
    new now = GetTickCount();
    new elapsed = RacePhase == RACE_RUNNING ? now - RaceStartedAt : RaceElapsed;
    new countdown = RacePhase == RACE_COUNTDOWN ? POC_RACE_COUNTDOWN_MS - (now - RaceCountdownAt) : 0;
    if (countdown < 0) countdown = 0;
    new notice[144];
    format(notice, sizeof notice, "ARROYO_RACE_V1 %d %d %d %d %d %d %d %d %d %d %d %d", RaceGeneration, RacePhase, RaceDriver, RacePassenger, Car, RaceIndex, POC_RACE_COUNT, elapsed, countdown, RaceScoreTimes[0], now, RaceReason);
    if (playerid == INVALID_PLAYER_ID)
    {
        SendClientMessageToAll(0xA8D57BFF, notice);
        RaceBroadcastAt = now;
        printf("POC {\"event\":\"challenge\",\"generation\":%d,\"phase\":%d,\"driver\":%d,\"passenger\":%d,\"checkpoint\":%d,\"total\":%d,\"elapsedMs\":%d,\"countdownMs\":%d,\"bestMs\":%d,\"reason\":%d,\"tick\":%d}", RaceGeneration, RacePhase, RaceDriver, RacePassenger, RaceIndex, POC_RACE_COUNT, elapsed, countdown, RaceScoreTimes[0], RaceReason, now);
    }
    else SendClientMessage(playerid, 0xA8D57BFF, notice);
}

stock RaceCheckpointFor(playerid)
{
    if (!RaceEnabled) return;
    if (RacePhase != RACE_RUNNING || RaceIndex >= POC_RACE_COUNT)
    {
        DisablePlayerRaceCheckpoint(playerid);
        return;
    }
    new next = RaceIndex + 1;
    new CP_TYPE:type = CP_TYPE_GROUND_NORMAL;
    if (next == POC_RACE_COUNT)
    {
        next = RaceIndex;
        type = CP_TYPE_GROUND_FINISH;
    }
    SetPlayerRaceCheckpoint(playerid, type, POC_RACE_POINTS[RaceIndex][0], POC_RACE_POINTS[RaceIndex][1], POC_RACE_POINTS[RaceIndex][2], POC_RACE_POINTS[next][0], POC_RACE_POINTS[next][1], POC_RACE_POINTS[next][2], POC_RACE_RADIUS);
}

stock RaceRefreshCheckpoints()
{
    for (new id; id < MAX_PLAYERS; id++) if (IsPlayerConnected(id)) RaceCheckpointFor(id);
}

stock RaceSendScores(playerid = INVALID_PLAYER_ID)
{
    if (!RaceEnabled) return;
    new notice[144];
    format(notice, sizeof notice, "ARROYO_SCORES_V1 %d %d", RaceGeneration, RaceScoreCount);
    if (playerid == INVALID_PLAYER_ID) SendClientMessageToAll(0xA8D57BFF, notice);
    else SendClientMessage(playerid, 0xA8D57BFF, notice);
    for (new rank; rank < RaceScoreCount; rank++)
    {
        format(notice, sizeof notice, "ARROYO_SCORE_V1 %d %d %d %s %s", RaceGeneration, rank + 1, RaceScoreTimes[rank], RaceScoreDrivers[rank], RaceScorePassengers[rank]);
        if (playerid == INVALID_PLAYER_ID) SendClientMessageToAll(0xA8D57BFF, notice);
        else SendClientMessage(playerid, 0xA8D57BFF, notice);
    }
}

stock RaceRecordScore()
{
    new rank;
    while (rank < RaceScoreCount && RaceScoreTimes[rank] <= RaceElapsed) rank++;
    if (rank >= RACE_SCORE_LIMIT) return;
    for (new move = RACE_SCORE_LIMIT - 1; move > rank; move--)
    {
        RaceScoreTimes[move] = RaceScoreTimes[move - 1];
        format(RaceScoreDrivers[move], MAX_PLAYER_NAME + 1, "%s", RaceScoreDrivers[move - 1]);
        format(RaceScorePassengers[move], MAX_PLAYER_NAME + 1, "%s", RaceScorePassengers[move - 1]);
    }
    RaceScoreTimes[rank] = RaceElapsed;
    GetPlayerName(RaceDriver, RaceScoreDrivers[rank], MAX_PLAYER_NAME + 1);
    if (RacePassenger == INVALID_PLAYER_ID) format(RaceScorePassengers[rank], MAX_PLAYER_NAME + 1, "-");
    else GetPlayerName(RacePassenger, RaceScorePassengers[rank], MAX_PLAYER_NAME + 1);
    if (RaceScoreCount < RACE_SCORE_LIMIT) RaceScoreCount++;
    printf("POC {\"event\":\"challengeScore\",\"generation\":%d,\"rank\":%d,\"elapsedMs\":%d,\"driver\":%d,\"passenger\":%d,\"tick\":%d}", RaceGeneration, rank + 1, RaceElapsed, RaceDriver, RacePassenger, GetTickCount());
}

stock RaceCancel(reason)
{
    if (!RaceActive()) return;
    RaceElapsed = RacePhase == RACE_RUNNING ? GetTickCount() - RaceStartedAt : 0;
    RacePhase = RACE_CANCELLED;
    RaceReason = reason;
    RaceSendState();
    RaceRefreshCheckpoints();
}

stock RaceReject(playerid, const reason[])
{
    SendClientMessage(playerid, 0xFF9999FF, reason);
    new escaped[200];
    EscapeJSON(reason, escaped, sizeof escaped);
    printf("POC {\"event\":\"challengeRejected\",\"player\":%d,\"reason\":\"%s\",\"generation\":%d,\"tick\":%d}", playerid, escaped, RaceGeneration, GetTickCount());
}

stock RaceStart(playerid)
{
    if (!RaceEnabled)
    {
        SendClientMessage(playerid, 0xFF9999FF, "The checkpoint challenge is available in Arroyo neighborhood.");
        return;
    }
    if (RaceActive()) { RaceReject(playerid, "A run is already active. Its crew can use /cancel."); return; }
    if (ResetPending) { RaceReject(playerid, "Wait for the vehicle reset before starting a run."); return; }
    if (Driver != playerid || GetPlayerState(playerid) != PLAYER_STATE_DRIVER || GetPlayerVehicleID(playerid) != Car)
    {
        RaceReject(playerid, "Take the driver seat before starting the Arroyo Loop.");
        return;
    }
    if (Passenger != INVALID_PLAYER_ID && (GetPlayerState(Passenger) != PLAYER_STATE_PASSENGER || GetPlayerVehicleID(Passenger) != Car))
    {
        RaceReject(playerid, "Wait for your passenger to finish entering the car.");
        return;
    }
    new Float:x, Float:y, Float:z;
    GetVehiclePos(Car, x, y, z);
    if (floatsqroot((x - POC_RACE_START_X) * (x - POC_RACE_START_X) + (y - POC_RACE_START_Y) * (y - POC_RACE_START_Y) + (z - POC_RACE_START_Z) * (z - POC_RACE_START_Z)) > POC_RACE_START_RADIUS)
    {
        RaceReject(playerid, "Return the coupe to the start marker before starting a run.");
        return;
    }
    RaceGeneration++;
    RacePhase = RACE_COUNTDOWN;
    RaceDriver = Driver;
    RacePassenger = Passenger;
    RaceIndex = 0;
    RaceReason = 0;
    RaceElapsed = 0;
    RaceCountdownAt = GetTickCount();
    RaceCountdownPosition[0] = x;
    RaceCountdownPosition[1] = y;
    RaceCountdownPosition[2] = z;
    RaceSendState();
    RaceRefreshCheckpoints();
    SendClientMessageToAll(0xFFD17AFF, "Arroyo Loop: stay still for the countdown, then follow each checkpoint.");
}

stock RaceObserve()
{
    if (!RaceActive()) return;
    if (!IsPlayerConnected(RaceDriver)) { RaceCancel(3); return; }
    if (Driver != RaceDriver || GetPlayerState(RaceDriver) != PLAYER_STATE_DRIVER || GetPlayerVehicleID(RaceDriver) != Car) { RaceCancel(1); return; }
    if (RacePassenger != INVALID_PLAYER_ID && !IsPlayerConnected(RacePassenger)) { RaceCancel(4); return; }
    if (Passenger != RacePassenger || (RacePassenger != INVALID_PLAYER_ID && (GetPlayerState(RacePassenger) != PLAYER_STATE_PASSENGER || GetPlayerVehicleID(RacePassenger) != Car))) { RaceCancel(10); return; }
    new now = GetTickCount();
    if (RacePhase == RACE_COUNTDOWN)
    {
        new Float:x, Float:y, Float:z;
        GetVehiclePos(Car, x, y, z);
        if (floatsqroot((x - RaceCountdownPosition[0]) * (x - RaceCountdownPosition[0]) + (y - RaceCountdownPosition[1]) * (y - RaceCountdownPosition[1]) + (z - RaceCountdownPosition[2]) * (z - RaceCountdownPosition[2])) > 0.75)
        {
            RaceCancel(7);
            SendClientMessageToAll(0xFF9999FF, "Run cancelled: the car moved before the countdown finished.");
            return;
        }
        if (now - RaceCountdownAt >= POC_RACE_COUNTDOWN_MS)
        {
            RacePhase = RACE_RUNNING;
            RaceStartedAt = now;
            RaceSendState();
            RaceRefreshCheckpoints();
        }
        else RaceSendState();
    }
    else if (now - RaceStartedAt >= POC_RACE_MAX_MS) RaceCancel(8);
    else if (now - RaceBroadcastAt >= 1000) RaceSendState();
}

public OnPlayerEnterRaceCheckpoint(playerid)
{
    if (!RaceEnabled || RacePhase != RACE_RUNNING || playerid != RaceDriver || Driver != RaceDriver || GetPlayerState(playerid) != PLAYER_STATE_DRIVER || GetPlayerVehicleID(playerid) != Car) return 1;
    // The server detects entry from received player sync. Check the actual next
    // point again before changing the index; no browser checkpoint RPC is trusted.
    if (!IsPlayerInRangeOfPoint(playerid, POC_RACE_RADIUS, POC_RACE_POINTS[RaceIndex][0], POC_RACE_POINTS[RaceIndex][1], POC_RACE_POINTS[RaceIndex][2])) return 1;
    RaceObserve();
    if (RacePhase != RACE_RUNNING) return 1;
    RaceIndex++;
    printf("POC {\"event\":\"challengeCheckpoint\",\"generation\":%d,\"player\":%d,\"checkpoint\":%d,\"elapsedMs\":%d,\"tick\":%d}", RaceGeneration, playerid, RaceIndex, GetTickCount() - RaceStartedAt, GetTickCount());
    if (RaceIndex == POC_RACE_COUNT)
    {
        RaceElapsed = GetTickCount() - RaceStartedAt;
        RacePhase = RACE_FINISHED;
        printf("POC {\"event\":\"challengeFinished\",\"generation\":%d,\"elapsedMs\":%d,\"driver\":%d,\"passenger\":%d,\"tick\":%d}", RaceGeneration, RaceElapsed, RaceDriver, RacePassenger, GetTickCount());
        RaceRecordScore();
        SendClientMessageToAll(0xA8D57BFF, "Arroyo Loop complete! Use /scores for this session's fastest runs.");
    }
    RaceSendState();
    RaceRefreshCheckpoints();
    if (RacePhase == RACE_FINISHED) RaceSendScores();
    return 1;
}

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
    RaceCancel(5);
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
    RaceSendState(playerid);
    RaceCheckpointFor(playerid);
    RaceSendScores(playerid);
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
    if (!strcmp(cmdtext, "/race", true)) { RaceStart(playerid); return 1; }
    if (!strcmp(cmdtext, "/scores", true))
    {
        RaceSendScores(playerid);
        if (!RaceScoreCount) SendClientMessage(playerid, 0xFFD17AFF, "No completed runs yet. Drive to the start marker and use /race.");
        return 1;
    }
    if (!strcmp(cmdtext, "/cancel", true))
    {
        if (RaceActive() && playerid != RaceDriver && playerid != RacePassenger) RaceReject(playerid, "Only the active crew can cancel its run.");
        else RaceCancel(6);
        return 1;
    }
    if (!strcmp(cmdtext, "/exit", true))
    {
        if (playerid == RaceDriver) RaceCancel(1);
        else if (playerid == RacePassenger) RaceCancel(2);
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
        if (playerid == RaceDriver || playerid == RacePassenger) RaceCancel(9);
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
    if (RaceActive()) RaceCancel(10);
    ClearSeat(playerid);
    if (seat == 0) Driver = playerid;
    else Passenger = playerid;
    PutPlayerInVehicle(playerid, Car, seat);
    printf("POC {\"event\":\"seatGranted\",\"player\":%d,\"vehicle\":%d,\"seat\":%d,\"tick\":%d}", playerid, Car, seat, GetTickCount());
    return 1;
}

public OnPlayerStateChange(playerid, PLAYER_STATE:newstate, PLAYER_STATE:oldstate)
{
    if (newstate == PLAYER_STATE_ONFOOT)
    {
        if (playerid == RaceDriver) RaceCancel(1);
        else if (playerid == RacePassenger) RaceCancel(2);
        ClearSeat(playerid);
    }
    printf("POC {\"event\":\"state\",\"player\":%d,\"state\":%d,\"oldState\":%d,\"vehicle\":%d,\"tick\":%d}", playerid, _:newstate, _:oldstate, GetPlayerVehicleID(playerid), GetTickCount());
    return 1;
}

public OnPlayerExitVehicle(playerid, vehicleid)
{
    if (playerid == RaceDriver) RaceCancel(1);
    else if (playerid == RacePassenger) RaceCancel(2);
    ClearSeat(playerid);
    printf("POC {\"event\":\"exit\",\"player\":%d,\"vehicle\":%d,\"tick\":%d}", playerid, vehicleid, GetTickCount());
    return 1;
}

public OnPlayerDisconnect(playerid, reason)
{
    if (playerid == RaceDriver) RaceCancel(3);
    else if (playerid == RacePassenger) RaceCancel(4);
    new wasDriver = Driver == playerid;
    ClearSeat(playerid);
    if (wasDriver) ResetFixture(playerid);
    printf("POC {\"event\":\"disconnect\",\"player\":%d,\"reason\":%d,\"tick\":%d}", playerid, reason, GetTickCount());
    return 1;
}

public Observe()
{
    TryFinishReset();
    RaceObserve();
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
