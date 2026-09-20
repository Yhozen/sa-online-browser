#!/usr/bin/env python3
"""Exercise the unchanged server challenge using ordinary native legacy players.

This is a protocol/state-machine test: deliberately positioned native sync is
not browser driving evidence and makes no client-side anti-cheat claim.
"""
import asyncio
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / os.environ.get('POC_CHALLENGE_ARTIFACTS', 'artifacts/challenge-native')
PORT = int(os.environ.get('POC_CHALLENGE_PORT', '17779'))


async def wait(predicate, label, seconds=15):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        await asyncio.sleep(.03)
    raise AssertionError(f'Timed out: {label}')


class Player:
    def __init__(self, name):
        self.name = name
        self.events = []
        self.player_id = None
        self.spawned = False
        self.revision = 0
        self.car = [0, 6, 10]
        self.follow_vehicle = True
        self.state = dict(type='state', position=[0, 0, 10], rotation=[1, 0, 0, 0], velocity=[0, 0, 0], keys=0, mode='onFoot', vehicleId=0, seat=-1, controlRevision=0)

    async def start(self):
        self.err = (ARTIFACTS / f'{self.name}.stderr.log').open('wb')
        self.log = (ARTIFACTS / f'{self.name}.jsonl').open('w')
        self.process = await asyncio.create_subprocess_exec(str(ROOT / 'native/build/poc-worker'), '--host', '127.0.0.1', '--port', str(PORT), '--name', self.name, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=self.err)
        self.reader = asyncio.create_task(self.read())
        self.sender = asyncio.create_task(self.sync())
        await wait(lambda: self.spawned, f'{self.name} spawn')
        return self

    async def read(self):
        async for line in self.process.stdout:
            event = json.loads(line)
            self.events.append(event)
            self.log.write(json.dumps(event) + '\n')
            self.log.flush()
            self.revision = event.get('controlRevision', self.revision)
            kind = event['type']
            if kind == 'init':
                self.player_id = event['playerId']
            if kind == 'spawn':
                self.spawned = True
            if kind in ('spawn', 'selfPosition'):
                self.state['position'] = event['position']
            if kind == 'seat':
                self.state.update(mode='driver' if event['seat'] == 0 else 'passenger', vehicleId=event['vehicleId'], seat=event['seat'], position=self.car[:])
            if kind == 'exitVehicle':
                self.state.update(mode='onFoot', vehicleId=0, seat=-1, position=[self.car[0] + 3, self.car[1], self.car[2]])
            if kind in ('vehicle', 'vehicleState') and 'position' in event:
                self.car = event['position']
                if self.state['mode'] != 'onFoot' and self.follow_vehicle:
                    self.state['position'] = self.car[:]

    async def sync(self):
        while True:
            if self.spawned:
                self.state['controlRevision'] = self.revision
                self.send(self.state)
            await asyncio.sleep(.04)

    def send(self, message):
        if self.process.returncode is None:
            self.process.stdin.write((json.dumps(message) + '\n').encode())

    def command(self, command):
        self.send(dict(type='command', text=command))

    def move(self, point):
        self.state['position'] = list(point)
        if self.state['mode'] == 'driver':
            self.car = list(point)

    def latest(self, kind):
        return next((event for event in reversed(self.events) if event['type'] == kind), None)

    async def close(self):
        if self.process.returncode is None:
            self.send(dict(type='disconnect'))
        try:
            await asyncio.wait_for(self.process.wait(), 4)
        except asyncio.TimeoutError:
            self.process.kill()
            await self.process.wait()
        self.sender.cancel()
        await asyncio.gather(self.sender, self.reader, return_exceptions=True)
        self.err.close()
        self.log.close()


async def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / 'summary.json').unlink(missing_ok=True)
    spec = importlib.util.spec_from_file_location('runtime', ROOT / 'tools/setup-runtime.py')
    runtime = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runtime)
    os.environ['POC_SCENE'] = 'neighborhood'
    os.environ['POC_GAME_PORT'] = str(PORT)
    fixture = ROOT / '.runtime/Server'
    isolated = ARTIFACTS / 'server'
    isolated.mkdir(exist_ok=True)
    for name in ['components', 'qawno']:
        link = isolated / name
        if not link.exists():
            link.symlink_to(fixture / name, target_is_directory=True)
    (isolated / 'gamemodes').mkdir(exist_ok=True)
    shutil.copy2(fixture / 'config.json', isolated / 'config.json')
    runtime.prepare_scene(isolated)
    source_paths = ['native/worker.cpp', 'native/tests.cpp', 'native/challenge-integration.py', 'test-server/poc.pwn', 'packages/shared/protocol.ts', 'tools/setup-runtime.py']
    hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in source_paths}
    worker_hash = hashlib.sha256((ROOT / 'native/build/poc-worker').read_bytes()).hexdigest()
    server_hash = hashlib.sha256((fixture / 'omp-server').read_bytes()).hexdigest()
    expected_server = json.loads((ROOT / 'test-server/manifest.json').read_text())['openmp']['binarySha256']
    assert server_hash == expected_server, 'upstream server binary must remain unchanged'
    fixture_hash = hashlib.sha256((isolated / 'gamemodes/poc.amx').read_bytes()).hexdigest()
    generated_include = (isolated / 'gamemodes/arena.inc').read_text()
    command = [str(ROOT / '.runtime/qemu/usr/bin/qemu-i386-static')] + runtime.loader_command(fixture / 'omp-server')
    server = await asyncio.create_subprocess_exec(*command, cwd=isolated, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    observations = []
    server_log = (ARTIFACTS / 'server.log').open('w')

    async def read_server():
        async for raw in server.stdout:
            line = raw.decode(errors='replace').rstrip()
            server_log.write(line + '\n')
            server_log.flush()
            if 'POC {' in line:
                observations.append(json.loads(line[line.index('POC ') + 4:]))

    server_reader = asyncio.create_task(read_server())
    players = []
    checks = []

    async def check_phase(player, phase, generation=None):
        return await wait(lambda: (event := player.latest('challenge')) and event['phase'] == phase and (generation is None or event['generation'] == generation) and event, f'{player.name} {phase}')

    async def reset_and_seat(driver, passenger=None):
        driver.command('/reset')
        reset_count = sum(o['event'] == 'reset' for o in observations)
        await wait(lambda: sum(o['event'] == 'reset' for o in observations) > reset_count, 'server reset')
        await asyncio.sleep(.2)
        driver.command('/drive')
        await wait(lambda: driver.state['mode'] == 'driver', 'driver placement')
        if passenger:
            passenger.command('/passenger')
            await wait(lambda: passenger.state['mode'] == 'passenger', 'passenger placement')
        await wait(lambda: any(o['event'] == 'player' and o['player'] == driver.player_id and o['state'] == 2 for o in observations[-20:]), 'server driver state')
        await asyncio.sleep(.25)

    try:
        await wait(lambda: any(o['event'] == 'ready' for o in observations), 'server ready')
        a = await Player('Race_A').start()
        players.append(a)
        b = await Player('Race_B').start()
        players.append(b)
        spectator = await Player('Race_C').start()
        players.append(spectator)
        assert len({p.player_id for p in players}) == 3
        assert all(o['npc'] == 0 for o in observations if o['event'] == 'connect')
        a.command('/race')
        await wait(lambda: any(o['event'] == 'challengeRejected' for o in observations), 'on-foot start rejected')
        checks.append('on-foot start rejected by server')
        await reset_and_seat(a, b)
        a.state['keys'] = 2
        await wait(lambda: any(event['type'] == 'playerState' and event['id'] == a.player_id and event.get('keys', 0) & 2 for event in b.events[-10:]), 'server-relayed driver horn key')
        a.state['keys'] = 0
        await wait(lambda: (event := next((event for event in reversed(b.events) if event['type'] == 'playerState' and event['id'] == a.player_id), None)) and event.get('keys') == 0, 'server-relayed horn release')
        checks.append('driver horn key and release arrive through ordinary server sync')
        a.command('/race')
        first = await check_phase(a, 'countdown')
        await check_phase(b, 'countdown', first['generation'])
        a.move([0, 8, 10])
        cancelled = await check_phase(a, 'cancelled', first['generation'])
        assert cancelled['reason'] == 'left_start'
        checks.append('movement during countdown cancels both peers')
        await reset_and_seat(a, b)
        a.command('/race')
        await check_phase(a, 'countdown', first['generation'] + 1)
        active = await check_phase(a, 'running', first['generation'] + 1)
        await check_phase(b, 'running', active['generation'])
        await wait(lambda: a.latest('raceCheckpoint'), 'ordinary RPC38 marker')
        late = await Player('Race_Late').start()
        players.append(late)
        await check_phase(late, 'running', active['generation'])
        await wait(lambda: late.latest('raceCheckpoint'), 'late join marker')
        assert late.latest('challengeScoresClear')['count'] == 0
        checks.append('late join receives running generation, checkpoint and bounded score batch')
        await late.close()
        players.remove(late)
        before = len([o for o in observations if o['event'] == 'challengeRejected'])
        spectator.command('/cancel')
        await wait(lambda: len([o for o in observations if o['event'] == 'challengeRejected']) > before, 'spectator cancellation rejected')
        assert a.latest('challenge')['phase'] == 'running'
        checks.append('spectator cannot cancel active crew')
        # Spoofed player chat resembles the fixture notice but stays player chat.
        a.send(dict(type='chat', text='ARROYO_RACE_V1 99 3 0 1 1 9 9 1 0 1 1 0'))
        await wait(lambda: any(e['type'] == 'chat' and 'ARROYO_RACE_V1 99' in e.get('text', '') for e in b.events), 'spoof stays chat')
        assert b.latest('challenge')['generation'] == active['generation']
        checks.append('chat cannot forge challenge finish')
        # Reach a later point first; only the current point can advance server state.
        a.move([30, 12, 10])
        await asyncio.sleep(.8)
        assert a.latest('challenge')['checkpointIndex'] == 0
        # Passenger-only position at the target cannot score while driver is elsewhere.
        b.follow_vehicle = False
        b.move([0, 12, 10])
        # open.mp relays the raw passenger packet but stores its authoritative
        # player position at the vehicle (player_pool.hpp PlayerPassengerSync).
        await wait(lambda: any(e['type'] == 'playerState' and e['id'] == b.player_id and e['position'] == [0, 12, 10] for e in a.events[-20:]), 'server-relayed passenger spoof position')
        assert any(o['event'] == 'vehicle' and abs(o['x'] - 30) < .1 and abs(o['y'] - 12) < .1 for o in observations[-15:])
        await asyncio.sleep(.7)
        b.follow_vehicle = True
        b.move(a.state['position'])
        assert a.latest('challenge')['checkpointIndex'] == 0
        checks.append('out-of-order and passenger positions do not advance checkpoints')
        scene = json.loads((ROOT / 'packages/shared/scenes/neighborhood.json').read_text())
        for index, point in enumerate(scene['challenge']['checkpoints']):
            await wait(lambda: (marker := a.latest('raceCheckpoint')) and marker['position'] == point and marker['checkpointType'] == (1 if index == len(scene['challenge']['checkpoints']) - 1 else 0), f'standard checkpoint marker {index + 1}')
            a.move(point)
            await wait(lambda: (e := a.latest('challenge')) and e['generation'] == active['generation'] and e['checkpointIndex'] == index + 1, f'checkpoint {index + 1}')
            await asyncio.sleep(.15)
        finished = await check_phase(a, 'finished', active['generation'])
        await check_phase(b, 'finished', active['generation'])
        await wait(lambda: b.latest('challengeScore'), 'server leaderboard')
        rows = [o for o in observations if o['event'] == 'challengeCheckpoint' and o['generation'] == active['generation']]
        assert [o['checkpoint'] for o in rows] == list(range(1, len(scene['challenge']['checkpoints']) + 1))
        assert finished['elapsedMs'] == next(o['elapsedMs'] for o in observations if o['event'] == 'challengeScore' and o['generation'] == active['generation'])
        assert b.latest('challengeScore')['driverName'] == 'Race_A'
        assert b.latest('challengeScore')['passengerName'] == 'Race_B'
        await asyncio.sleep(.4)
        assert len([o for o in observations if o['event'] == 'challengeScore' and o['generation'] == active['generation']]) == 1
        assert a.latest('raceCheckpointClear') and b.latest('raceCheckpointClear')
        checks.append('all ordered checkpoints produce exactly one server-timed crew result')
        await reset_and_seat(b, a)
        b.command('/race')
        rematch = await check_phase(b, 'countdown', active['generation'] + 1)
        a.command('/exit')
        cancellation = await check_phase(b, 'cancelled', rematch['generation'])
        assert cancellation['reason'] == 'passenger_exit'
        checks.append('role swap rematch and passenger exit cancellation')
        await reset_and_seat(b, a)
        b.command('/race')
        rematch = await check_phase(b, 'countdown', rematch['generation'] + 1)
        b.command('/teleport')
        cancellation = await check_phase(a, 'cancelled', rematch['generation'])
        assert cancellation['reason'] == 'teleport'
        checks.append('teleport cancels run before correction')
        await reset_and_seat(b, a)
        b.command('/race')
        rematch = await check_phase(b, 'countdown', rematch['generation'] + 1)
        b.command('/reset')
        cancellation = await check_phase(a, 'cancelled', rematch['generation'])
        assert cancellation['reason'] == 'reset'
        checks.append('reset cancels run before fixture reset')
        await reset_and_seat(b, a)
        b.command('/race')
        rematch = await check_phase(b, 'countdown', rematch['generation'] + 1)
        await b.close()
        players.remove(b)
        cancellation = await check_phase(a, 'cancelled', rematch['generation'])
        assert cancellation['reason'] == 'driver_disconnect'
        checks.append('driver disconnect cancels and clears vehicle ownership')
        await wait(lambda: any(o['event'] == 'vehicle' and o['driver'] == 65535 and o['passenger'] == 65535 for o in observations[-10:]), 'ownership cleared')
        assert not [e for p in players for e in p.events if e['type'] == 'error']
        for p in players[:]:
            await p.close()
            players.remove(p)
        await wait(lambda: len([o for o in observations if o['event'] == 'disconnect']) == 4, 'all players released')
        # Restart the unchanged server with the same local runtime. Neither the
        # previous generation nor the in-memory leaderboard survives restart.
        server.stdin.write(b'exit\n')
        await server.stdin.drain()
        await asyncio.wait_for(server.wait(), 6)
        await server_reader
        ready_count = len([o for o in observations if o['event'] == 'ready'])
        server = await asyncio.create_subprocess_exec(*command, cwd=isolated, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        server_reader = asyncio.create_task(read_server())
        await wait(lambda: len([o for o in observations if o['event'] == 'ready']) > ready_count, 'restarted server ready')
        fresh = await Player('Race_Restart').start()
        players.append(fresh)
        initial = await check_phase(fresh, 'idle', 0)
        assert initial['bestMs'] == 0
        assert fresh.latest('challengeScoresClear')['count'] == 0
        checks.append('server restart clears old generations and session leaderboard')
        if os.environ.get('POC_CHALLENGE_EXTENDED') == '1':
            await reset_and_seat(fresh)
            fresh.command('/race')
            run = await check_phase(fresh, 'running', 1)
            timeout = await wait(lambda: (event := fresh.latest('challenge')) and event['phase'] == 'cancelled' and event, 'actual three-minute server timeout', 195)
            assert timeout['reason'] == 'timeout' and 180000 <= timeout['elapsedMs'] < 182000
            assert fresh.latest('challengeScoresClear')['count'] == 0
            checks.append('actual 180-second run timeout cancels without a score')
            for attempt in range(6):
                fresh.command('/race')
                run = await check_phase(fresh, 'running', attempt + 2)
                await asyncio.sleep(.1 * (5 - attempt))
                for index, point in enumerate(scene['challenge']['checkpoints']):
                    fresh.move(point)
                    await wait(lambda: (event := fresh.latest('challenge')) and event['generation'] == run['generation'] and event['checkpointIndex'] == index + 1, f'leaderboard run {attempt + 1} checkpoint {index + 1}')
                await check_phase(fresh, 'finished', run['generation'])
                await wait(lambda: (event := fresh.latest('challengeScoresClear')) and event['generation'] == run['generation'] and event['count'] == min(attempt + 1, 5), 'bounded leaderboard batch')
            fresh.command('/scores')
            await asyncio.sleep(.3)
            batch = fresh.latest('challengeScoresClear')
            offset = fresh.events.index(batch)
            scores = [event for event in fresh.events[offset + 1:] if event['type'] == 'challengeScore']
            assert batch['count'] == 5 and len(scores) == 5
            assert [event['rank'] for event in scores] == [1, 2, 3, 4, 5]
            assert [event['timeMs'] for event in scores] == sorted(event['timeMs'] for event in scores)
            assert all(event['driverName'] == 'Race_Restart' and event['passengerName'] == '' for event in scores)
            checks.append('six completed solo rematches retain sorted top-five score batch')
        await fresh.close()
        players.remove(fresh)
        summary = dict(passed=True, checks=checks, sources=hashes, changedSourcesDuringRun=[name for name, digest in hashes.items() if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest], workerSha256=worker_hash, serverSha256=server_hash, pawnAmxSha256=fixture_hash, generatedFixture=generated_include, port=PORT, server='unchanged open.mp v1.5.8.3079', serverObservations=len(observations), finished=finished, limitation='Native protocol/state-machine test with deliberately positioned sync; browser driving verified separately.')
        (ARTIFACTS / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
        print(json.dumps(summary, indent=2))
    except Exception as error:
        (ARTIFACTS / 'summary.json').write_text(json.dumps(dict(passed=False, checks=checks, error=str(error), serverObservations=len(observations)), indent=2) + '\n')
        raise
    finally:
        for p in players:
            await p.close()
        if server.returncode is None:
            server.stdin.write(b'exit\n')
            await server.stdin.drain()
            try:
                await asyncio.wait_for(server.wait(), 6)
            except asyncio.TimeoutError:
                server.kill()
                await server.wait()
        await server_reader
        server_log.close()


if __name__ == '__main__':
    asyncio.run(main())
