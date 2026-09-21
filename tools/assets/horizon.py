# SPDX-License-Identifier: GPL-3.0-or-later
"""Regenerate the retained original envelope, never overwrite packed v4 terrain.
Run in native Blender; then run build:horizon to remesh/bake the retained input.
"""
import argparse, json, pathlib, runpy, shutil, sys, tempfile
ROOT = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-root', type=pathlib.Path, default=ROOT)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
with tempfile.TemporaryDirectory(prefix='arroyo-envelope-') as scratch:
    original_argv = sys.argv
    try:
        sys.argv = [str(ROOT/'tools/assets/horizon-envelope-v3.py'), '--', '--output-root', scratch]
        runpy.run_path(str(ROOT/'tools/assets/horizon-envelope-v3.py'), run_name='__main__')
    finally:
        sys.argv = original_argv
    folder = args.output_root.resolve()/'assets/source'
    staged = pathlib.Path(scratch)
    record = json.loads((staged/'assets/source/horizon-build.json').read_text())
    record['recipe'] = 'tools/assets/horizon-envelope-v3.py'
    record['relief'] = 'assets/source/horizon-envelope-v3.json'
    record['source'] = 'assets/source/horizon-envelope-v3.blend'
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(staged/'assets/horizon-relief.json', folder/'horizon-envelope-v3.json')
    shutil.copyfile(staged/'assets/source/horizon.blend', folder/'horizon-envelope-v3.blend')
    (folder/'horizon-envelope-v3-build.json').write_text(json.dumps(record, indent=2)+'\n')
