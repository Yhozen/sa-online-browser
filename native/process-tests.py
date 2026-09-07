#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Exercise local worker teardown without connecting to the fixture server."""
import json, signal, subprocess, sys, time
worker=sys.argv[1]
for action in ('eof','SIGTERM','SIGINT'):
 proc=subprocess.Popen([worker,'--host','127.0.0.1','--port','65530','--name','Teardown'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  time.sleep(0.1)
  if action=='eof':proc.stdin.close();proc.stdin=None
  else:proc.send_signal(getattr(signal,action))
  output,errors=proc.communicate(timeout=3)
  if proc.returncode!=0:raise RuntimeError(f'{action} returned {proc.returncode}: {errors}')
  for line in output.splitlines():json.loads(line)
 finally:
  if proc.poll() is None:proc.kill();proc.wait()
print('PASS: EOF, SIGTERM, SIGINT teardown; stdout remains JSONL')
