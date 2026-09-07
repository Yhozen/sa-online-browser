#!/usr/bin/env python3
"""Exercise twenty real upstream player lifetimes against an already running fixture."""
import json
from pathlib import Path
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / '.runtime/Server/log.txt'


def observe(offset):
    with LOG.open() as stream:
        stream.seek(offset)
        result = []
        for line in stream:
            if 'POC ' in line:
                result.append(json.loads(line.split('POC ', 1)[1]))
        return result


def wait_for(check, label, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = check()
        if result:
            return result
        time.sleep(.025)
    raise RuntimeError(f'Timed out: {label}')


def main():
    results = []
    output = ROOT / 'artifacts/native-cycles.json'
    output.parent.mkdir(exist_ok=True)
    for index in range(20):
        name = f'Cycle_{index:02d}'
        start = time.monotonic()
        offset = LOG.stat().st_size
        events = []
        with (output.parent / f'{name}.stderr.log').open('w') as errors:
            process = subprocess.Popen([str(ROOT / 'native/build/poc-worker'), '--name', name],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True)
            def consume():
                for line in process.stdout:
                    events.append(json.loads(line))
            reader = threading.Thread(target=consume, daemon=True)
            reader.start()
            try:
                spawned = wait_for(lambda: next((e for e in events if e['type'] == 'spawn'), None), f'{name} worker spawn')
                connected = wait_for(lambda: next((e for e in observe(offset) if e['event'] == 'connect' and e['name'] == name), None), f'{name} server connect')
                player = connected['player']
                assert connected['npc'] == 0, f'{name} joined as NPC'
                wait_for(lambda: any(e['event'] == 'spawn' and e['player'] == player for e in observe(offset)), f'{name} server spawn')
                process.stdin.write('{"type":"disconnect"}\n')
                process.stdin.flush()
                assert process.wait(timeout=5) == 0
                disconnected = wait_for(lambda: next((e for e in observe(offset) if e['event'] == 'disconnect' and e['player'] == player), None), f'{name} server release')
                reader.join(timeout=1)
                results.append({'name': name, 'playerId': player, 'npc': connected['npc'], 'spawn': spawned['position'],
                                'serverConnectTick': connected['tick'], 'serverDisconnectTick': disconnected['tick'],
                                'durationSeconds': round(time.monotonic() - start, 3), 'status': 'passed'})
                print(f'{name}: spawned as normal player {player}; server slot released', flush=True)
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                process.stdin.close()
                reader.join(timeout=1)
                process.stdout.close()
                output.write_text(json.dumps({'status': 'passed' if len(results) == 20 else 'incomplete',
                                              'completedCycles': len(results), 'cycles': results}, indent=2) + '\n')


if __name__ == '__main__':
    main()
