# SPDX-License-Identifier: GPL-3.0-or-later
"""Bake raw alpha-aware diffuse accessibility from declared original oak sources."""
import argparse, hashlib, json, math, pathlib, sys, time
import bpy, numpy as np
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree

parser=argparse.ArgumentParser()
parser.add_argument('--project-root',type=pathlib.Path,required=True)
parser.add_argument('--models',default='tree,roadside-oak')
parser.add_argument('--blender-version',default='5.2.1')
parser.add_argument('--output-root',type=pathlib.Path,required=True)
parser.add_argument('--samples',type=int,default=256)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
assert args.blender_version=='5.2.1', 'Retained oak source and visibility bake require verified Blender5.2.1'
assert bpy.app.version[:3]==tuple(map(int,args.blender_version.split('.')))
assert args.samples==256
ROOT=args.project_root.resolve();OUT=args.output_root.resolve()/'assets/source/canopy';OUT.mkdir(parents=True,exist_ok=True)
BASE=ROOT/'assets/source/canopy-base'
models=args.models.split(',');assert models and len(models)==len(set(models)) and all(n in ['tree','roadside-oak'] for n in models)
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
base=json.loads((BASE/'base.json').read_text());assert base['version']==1 and base['blenderVersion']==args.blender_version
for name in models:
 for kind in ['blend','glb']:
  entry=base['models'][name][kind];assert entry['path']==f'assets/source/canopy-base/{name}.{kind}';p=ROOT/entry['path'];assert sha(p)==entry['sha256'] and p.stat().st_size==entry['bytes']
inputs={str(p.relative_to(ROOT)):sha(p) for p in [BASE/'base.json',*[BASE/f'{name}.{kind}' for name in models for kind in ['blend','glb']],ROOT/'assets/textures/arroyo-foliage.webp',pathlib.Path(__file__).resolve()]}
directions=[]
for i in range(args.samples):
 z=1-2*(i+.5)/args.samples;a=i*2.399963229728653;r=math.sqrt(1-z*z)
 directions.append(Vector((math.cos(a)*r,math.sin(a)*r,z)))
results=[]
for name in models:
 started=time.time();bpy.ops.wm.open_mainfile(filepath=str(BASE/f'{name}.blend'),use_scripts=False)
 bpy.context.preferences.filepaths.save_version=0
 image=bpy.data.images.load(str(ROOT/'assets/textures/arroyo-foliage.webp'),check_existing=False)
 width,height=image.size;pixels=np.empty(width*height*4,dtype=np.float32);image.pixels.foreach_get(pixels)
 alpha=pixels.reshape(height,width,4)[:,:,3]
 ys,xs=np.nonzero(alpha>=115/255)
 opaque_uv=np.column_stack(((xs+.5)/width,(ys+.5)/height))
 nearest={}
 for u in [0,.5,1]:
  for v in [0,.5,1]:
   nearest[(u,v)]=tuple(opaque_uv[np.argmin(np.sum((opaque_uv-np.array((u,v)))**2,axis=1))])
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.context.view_layer.update()
 triangles=[];bvh_vertices=[];bvh_indices=[];leaf_data=[]
 for o in objects:
  m=o.data;m.calc_loop_triangles();normal_matrix=o.matrix_world.to_3x3().inverted().transposed()
  is_leaf=all(mat.name.startswith('foliage') for mat in m.materials)
  uv=m.uv_layers.active
  for tri in m.loop_triangles:
   points=[o.matrix_world@m.vertices[i].co for i in tri.vertices]
   tex=[Vector((*uv.data[i].uv,0)) for i in tri.loops] if is_leaf else None
   index=len(triangles);triangles.append((points,tex,is_leaf,o,tuple(tri.vertices)))
   begin=len(bvh_vertices);bvh_vertices.extend(points);bvh_indices.append((begin,begin+1,begin+2))
  if is_leaf:leaf_data.append((o,normal_matrix))
 bvh=BVHTree.FromPolygons(bvh_vertices,bvh_indices,all_triangles=True)
 ray_count=0;transparent_steps=0
 def visible(point,direction):
  global ray_count,transparent_steps
  ray_count+=1;origin=point+direction*.005;remaining=32.
  for step in range(512):
   hit,_,index,distance=bvh.ray_cast(origin,direction,remaining)
   if hit is None:return 1.
   points,tex,is_leaf,_,_=triangles[index]
   if not is_leaf:return 0.
   mapped=geometry.barycentric_transform(hit,*points,*tex)
   x=min(width-1,max(0,int(mapped.x*width)));y=min(height-1,max(0,int(mapped.y*height)))
   if alpha[y,x]>=115/255:return 0.
   transparent_steps+=1;remaining-=distance+.00002
   if remaining<=0:return 1.
   origin=hit+direction*.00002
  raise RuntimeError('Transparent ray traversal exceeded its guarded bound')
 cache={};sample_cache={};displacements=[];values=[];components_total=0
 for o,normal_matrix in leaf_data:
  m=o.data;adj=[set() for _ in m.vertices]
  for e in m.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
  component={};groups=[]
  for i in range(len(m.vertices)):
   if i in component:continue
   pending=[i];group=[];ci=len(groups)
   while pending:
    k=pending.pop()
    if k in component:continue
    component[k]=ci;group.append(k);pending.extend(adj[k])
   assert len(group)==9, (o.name,len(group));groups.append(group)
  components_total+=len(groups)
  local_tris={ci:[] for ci in range(len(groups))}
  for points,tex,is_leaf,owner,indices in triangles:
   if owner==o:local_tris[component[indices[0]]].append((points,tex))
  attribute=m.attributes.new('_CANOPY_VISIBILITY','FLOAT2','CORNER')
  uv=m.uv_layers.active
  for loop in m.loops:
   point=o.matrix_world@m.vertices[loop.vertex_index].co
   normal=(normal_matrix@m.corner_normals[loop.index].vector).normalized()
   coord=tuple(round(float(x),7) for x in uv.data[loop.index].uv)
   assert coord in nearest,coord
   equivalence=tuple(round(float(x),8) for x in (*point,*normal,*coord))
   if equivalence not in cache:
    ck=(o.name,component[loop.vertex_index],coord)
    if ck not in sample_cache:
     target=Vector((*nearest[coord],0));sample=None
     for points,tex in local_tris[component[loop.vertex_index]]:
      if geometry.intersect_point_tri_2d(target,tex[0],tex[1],tex[2]):
       sample=geometry.barycentric_transform(target,*tex,*points);break
     assert sample is not None,ck
     displacements.append((sample-point).length)
     openness=np.array([visible(sample,d) for d in directions],dtype=np.float64)
     sample_cache[ck]=openness
    weights=np.array([normal.dot(d) for d in directions],dtype=np.float64)
    forward=np.maximum(weights,0);backward=np.maximum(-weights,0);openness=sample_cache[ck]
    value=(float(openness@forward/forward.sum()),float(openness@backward/backward.sum()))
    assert all(math.isfinite(v) and 0<=v<=1 for v in value),value
    cache[equivalence]=value;values.append(value)
   attribute.data[loop.index].vector=cache[equivalence]
  print(json.dumps({'model':name,'mesh':o.name,'groups':len(groups),'cachedOpaqueOrigins':len(sample_cache),'elapsedSeconds':time.time()-started}),flush=True)
 assert components_total==630
 source=OUT/f'{name}.blend';glb=OUT/f'{name}.glb'
 bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
 bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_materials='EXPORT',export_yup=True,export_attributes=True)
 result={'model':name,'samples':args.samples,'sourceSha256':sha(source),'glbSha256':sha(glb),'sprays':components_total,'equivalenceClasses':len(cache),'opaqueOrigins':len(sample_cache),'rays':ray_count,'transparentSteps':transparent_steps,'atlasSize':[width,height],'nearestOpaqueUv':{str(k):v for k,v in nearest.items()},'originDisplacementMetres':{'maximum':max(displacements),'p90':float(np.quantile(displacements,.9)),'mean':float(np.mean(displacements))},'rawAccessibility':{'minimum':float(np.min(values)),'maximum':float(np.max(values)),'mean':float(np.mean(values))},'elapsedSeconds':time.time()-started}
 results.append(result);print(json.dumps(result),flush=True)
for p,h in inputs.items():assert sha(ROOT/p)==h,p
(OUT/'native.json').write_text(json.dumps({'inputs':inputs,'blender':bpy.app.version_string,'rows':results,'method':'Original retained native meshes, unchanged folded geometry/UV/normals/materials. Every ray origin lies on an actual original-alpha opaque texel in the same connected spray. Raw cosine-weighted two-sided diffuse accessibility, no strength/gain/floor/clamp;512 transparent-hit traversal guard raises on exhaustion. Geometry and all original GLB fields require separate byte-exact export verification before use.'},indent=2)+'\n')
