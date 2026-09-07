#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Check the real demo supervisor's startup, admission, and signal cleanup."""
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import time
import urllib.request

root = Path(__file__).resolve().parents[1]
os.chdir(root)
output = root / 'artifacts/verification'
output.mkdir(parents=True, exist_ok=True)
pid_file = root / '.runtime/poc-processes.json'
interrupt_group = '--interrupt-group' in sys.argv
record_name = 'supervisor-sigint' if interrupt_group else 'supervisor'
if pid_file.exists():
    raise RuntimeError('Stop the existing dev:poc supervisor before this check.')

with (output / f'{record_name}.log').open('w') as log:
    supervisor = subprocess.Popen(['node', 'tools/dev.mjs'], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    worker = None
    pids = None
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if supervisor.poll() is not None:
                raise RuntimeError('Supervisor exited during startup; inspect supervisor.log')
            try:
                with urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=1) as response:
                    health = json.load(response)
                if pid_file.exists() and health == {'ok': True, 'sessions': 0, 'workers': 0}:
                    pids = json.loads(pid_file.read_text())
                    break
            except OSError:
                pass
            time.sleep(0.1)
        if not pids:
            raise RuntimeError('Demo did not become ready')
        worker = subprocess.Popen(['native/build/poc-worker', '--name', 'SupervisorProbe'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log)
        spawned = False
        buffer = b''
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if not select.select([worker.stdout], [], [], 0.5)[0]:
                continue
            chunk = os.read(worker.stdout.fileno(), 4096)
            if not chunk:
                break
            buffer += chunk
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                if json.loads(line)['type'] == 'spawn':
                    spawned = True
            if spawned:
                break
        if not spawned:
            raise RuntimeError('Real worker failed to spawn through the demo server')
        worker.stdin.write(b'{"type":"disconnect"}\n')
        worker.stdin.flush()
        worker.communicate(timeout=3)
        if worker.returncode != 0:
            raise RuntimeError('Probe did not disconnect cleanly')
        if interrupt_group:
            os.killpg(supervisor.pid, signal.SIGINT)
        else:
            supervisor.send_signal(signal.SIGTERM)
        supervisor.wait(timeout=10)
        if supervisor.returncode != 0 or pid_file.exists():
            raise RuntimeError('Supervisor did not cleanly remove its PID record')
        for pid in pids.values():
            if Path(f'/proc/{pid}').exists():
                raise RuntimeError(f'Supervised process still exists: {pid}')
        if 'Aborted' in (output / f'{record_name}.log').read_text():
            raise RuntimeError('The upstream server aborted during normal demo shutdown')
        tested_signal = 'process-group SIGINT' if interrupt_group else 'SIGTERM'
        (output / f'{record_name}.json').write_text(json.dumps({'startup': True, 'normalWorkerSpawn': spawned, 'signal': tested_signal, 'exitCode': supervisor.returncode, 'pidFileRemoved': True, 'allSupervisedProcessesExited': True, 'upstreamAbort': False}, indent=2) + '\n')
        print(f'PASS: demo startup, real worker admission, {tested_signal} cleanup, no remaining supervised processes')
    finally:
        if worker and worker.poll() is None:
            worker.kill()
            worker.wait()
        if supervisor.poll() is None:
            supervisor.send_signal(signal.SIGTERM)
            try:
                supervisor.wait(timeout=10)
            except subprocess.TimeoutExpired:
                supervisor.kill()
                supervisor.wait()
