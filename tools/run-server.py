#!/usr/bin/env python3
"""Exec the stock server, preserving signals and its lifetime for the supervisor."""
import importlib.util
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('setup_runtime', ROOT / 'tools/setup-runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
server = ROOT / '.runtime/Server'
if not (server / 'gamemodes/poc.amx').exists():
    raise SystemExit('Run npm run setup:poc before starting the server.')
runtime.prepare_scene()
os.chdir(server)
command = [str(ROOT / '.runtime/qemu/usr/bin/qemu-i386-static')] + runtime.loader_command(server / 'omp-server')
os.execv(command[0], command)
