// SPDX-License-Identifier: GPL-3.0-or-later
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const version='4.5.13', archive=`blender-${version}-linux-x64.tar.xz`, hash='da4e69b06b75b9e642d106496c50e7e240218b411d2f6e18271c1d1d819cef91';
const binary=`.runtime/blender-${version}-linux-x64/blender`;
function run(c,a){const r=spawnSync(c,a,{stdio:'inherit'});if(r.status!==0)throw Error(`${c} failed`);}
if(!existsSync(binary)){
 mkdirSync('.runtime/downloads',{recursive:true});const file=`.runtime/downloads/${archive}`;
 if(!existsSync(file)){const r=await fetch(`https://mirror.blender.org/release/Blender4.5/${archive}`);if(!r.ok)throw Error(`Blender download: ${r.status}`);writeFileSync(file,Buffer.from(await r.arrayBuffer()));}
 if(createHash('sha256').update(readFileSync(file)).digest('hex')!==hash)throw Error('Blender SHA256 mismatch');
 run('tar',['-xf',file,'-C','.runtime']);
}
run(binary,['--background','--python-exit-code','1','--python','tools/assets/build.py']);
copyFileSync('assets/textures/neighborhood-atlas.png','apps/browser/public/assets/neighborhood-atlas.png');

run(process.execPath,['tools/asset-inventory.mjs']);
