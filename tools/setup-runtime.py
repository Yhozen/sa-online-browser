#!/usr/bin/env python3
"""Provision the checksum-pinned, unchanged open.mp release in .runtime only."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime'


def download(item):
    path = RUNTIME / 'downloads' / item['url'].rsplit('/', 1)[-1]
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        print('Downloading', item['url'], flush=True)
        with urllib.request.urlopen(item['url']) as response:
            path.write_bytes(response.read())
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != item['sha256']:
        raise RuntimeError(f'Checksum mismatch for {path}: {actual}')
    return path


def extract_deb(path, destination):
    data = path.read_bytes()
    if data[:8] != b'!<arch>\n':
        raise RuntimeError('Invalid Debian archive')
    offset = 8
    while offset + 60 <= len(data):
        header = data[offset:offset + 60]
        name = header[:16].decode().strip().rstrip('/')
        length = int(header[48:58])
        offset += 60
        if name.startswith('data.tar.'):
            with tarfile.open(fileobj=io.BytesIO(data[offset:offset + length])) as archive:
                # The entire package has already passed its pinned SHA256 check.
                archive.extractall(destination, filter='fully_trusted')
            return
        offset += length + length % 2
    raise RuntimeError(f'No data archive in {path}')


def loader_command(program):
    sysroot = RUNTIME / 'i386'
    libraries = [sysroot / 'lib/i386-linux-gnu', sysroot / 'usr/lib/i386-linux-gnu', RUNTIME / 'Server/qawno']
    return [str(sysroot / 'lib/ld-linux.so.2'), '--library-path', ':'.join(map(str, libraries)), str(program)]


def main():
    manifest = json.loads((ROOT / 'test-server/manifest.json').read_text())
    archive_path = download(manifest['openmp'])
    if not (RUNTIME / 'Server/omp-server').exists():
        with tarfile.open(archive_path) as archive:
            archive.extractall(RUNTIME, filter='fully_trusted')
    binary_hash = hashlib.sha256((RUNTIME / 'Server/omp-server').read_bytes()).hexdigest()
    if binary_hash != manifest['openmp']['binarySha256']:
        raise RuntimeError('The extracted official server binary has changed; remove .runtime/Server and rerun setup.')
    for package in manifest['debianPackages']:
        extract_deb(download(package), RUNTIME / 'i386')
    qemu_package = download(manifest['qemu'])
    emulator = RUNTIME / 'qemu/usr/bin/qemu-i386-static'
    if not emulator.exists():
        extract_deb(qemu_package, RUNTIME / 'qemu')
    if hashlib.sha256(emulator.read_bytes()).hexdigest() != manifest['qemu']['binarySha256']:
        raise RuntimeError('The extracted QEMU executable has changed; remove .runtime/qemu and rerun setup.')
    # Debian packages use an absolute loader symlink; keep it inside this sysroot.
    loader = RUNTIME / 'i386/lib/ld-linux.so.2'
    if loader.is_symlink():
        loader.unlink()
        loader.symlink_to('i386-linux-gnu/ld-linux.so.2')
    prepare_scene()
    print('Runtime ready. Launch: python3 tools/run-server.py', flush=True)


def prepare_scene():
    scene = os.environ.get('POC_SCENE', 'neighborhood')
    if scene not in ('yard', 'neighborhood'): raise ValueError('Invalid POC_SCENE')
    arena = json.loads((ROOT / f'packages/shared/scenes/{scene}.json').read_text())
    generated = ROOT / '.runtime/Server/gamemodes/arena.inc'
    spawns = arena['spawns']
    vehicle = arena['vehicle']
    generated.write_text('\n'.join([
        f'#define POC_SPAWN_X0 ({spawns[0][0]:.1f})',
        f'#define POC_SPAWN_X1 ({spawns[1][0]:.1f})',
        f'#define POC_SPAWN_Y ({spawns[0][1]:.1f})',
        f'#define POC_SPAWN_Z ({spawns[0][2]:.1f})',
        f'#define POC_TELEPORT_X ({arena["teleport"][0]:.1f})',
        f'#define POC_TELEPORT_Y ({arena["teleport"][1]:.1f})',
        f'#define POC_CAR_MODEL {vehicle["model"]}',
        f'#define POC_CAR_X ({vehicle["position"][0]:.1f})',
        f'#define POC_CAR_Y ({vehicle["position"][1]:.1f})',
        f'#define POC_CAR_Z ({vehicle["position"][2]:.1f})',
        f'#define POC_CAR_HEADING ({vehicle["heading"]:.1f})',
    ]) + '\n')
    server = RUNTIME / 'Server'
    shutil.copy2(ROOT / 'test-server/poc.pwn', server / 'gamemodes/poc.pwn')
    subprocess.run(loader_command(server / 'qawno/pawncc') + [
        'gamemodes/poc.pwn', '-iqawno/include', '-igamemodes', '-ogamemodes/poc.amx', '-d3', '-;+', '-(+'], cwd=server, check=True)
    config = json.loads((server / 'config.json').read_text())
    config.update({'announce': False, 'enable_query': True, 'max_players': 8, 'max_bots': 0, 'name': 'Browser PoC fixture', 'password': ''})
    config['artwork']['enable'] = False
    config['network'].update({'bind': '127.0.0.1', 'port': int(os.environ.get('POC_GAME_PORT', '7777')), 'allow_037_clients': True, 'use_omp_encryption': False, 'minimum_connection_time': 0})
    config['pawn'].update({'main_scripts': ['poc 1'], 'side_scripts': [], 'legacy_plugins': []})
    config['rcon']['enable'] = False
    config['logging'].update({'file': 'log.txt', 'use_timestamp': False, 'use_prefix': False})
    (server / 'config.json').write_text(json.dumps(config, indent=2) + '\n')


if __name__ == '__main__':
    main()
