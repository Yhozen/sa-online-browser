# SPDX-License-Identifier: GPL-3.0-or-later
"""One original roadside-oak low-wood deformation; retained crown is untouched."""
import argparse, hashlib, json, math, pathlib, sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

p=argparse.ArgumentParser();p.add_argument('--project-root',type=pathlib.Path,required=True);p.add_argument('--output-root',type=pathlib.Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);ROOT=a.project_root.resolve();OUT=a.output_root.resolve();OUT.mkdir(parents=True,exist_ok=True)
assert bpy.app.version[:3]==(5,2,1)
sha=lambda path:hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
source=ROOT/'assets/source/canopy-base/roadside-oak.blend';base_record=json.loads((ROOT/'assets/source/canopy-base/base.json').read_text())['models']['roadside-oak']
assert sha(source)==base_record['blend']['sha256'];source_hash=sha(source)
bpy.ops.wm.open_mainfile(filepath=str(source),use_scripts=False);bpy.context.preferences.filepaths.save_version=0;bpy.context.view_layer.update()
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
wood=[o for o in objects if all(m.name=='wood' for m in o.data.materials)];assert len(wood)==1;wood=wood[0]
def fields(o):
 m=o.data
 return {'position':[tuple(v.co) for v in m.vertices], 'normal':[tuple(n.vector) for n in m.corner_normals],
         'loops':[l.vertex_index for l in m.loops], 'polygons':[(tuple(f.vertices),f.material_index,f.use_smooth) for f in m.polygons],
         'uv':{u.name:[tuple(v.uv) for v in u.data] for u in m.uv_layers},
         'colors':{c.name:[tuple(v.color) for v in c.data] for c in m.color_attributes},
         'materials':[m.name for m in m.materials], 'matrix':[list(row) for row in o.matrix_world]}
before={o.name:fields(o) for o in objects};m=wood.data;world=wood.matrix_world.copy();inverse=world.inverted();old=[world@v.co for v in m.vertices]
# Actual authored trunk center stations, with the already-accepted mature lift.
# A common horizontal deformation also moves the intersecting root flares, so
# their original physical attachment is retained instead of narrowing one shell.
lift=lambda z:z+3*(1-math.exp(-(z-2.1)/.5)) if z>2.1 else z
stations=[Vector((x,y,lift(z))) for x,y,z in [(0,0,0),(.035,-.04,.8),(.11,.015,1.65),(.15,.06,2.45),(.26,.07,3.10)]]
def center(z):
 if z<=stations[0].z:return stations[0]
 for lo,hi in zip(stations,stations[1:]):
  if z<=hi.z:return lo.lerp(hi,(z-lo.z)/(hi.z-lo.z))
 return stations[-1]
def scale(z):
 t=max(0,min(1,(z-1.65)/(3.55-1.65)));return .55+.45*t*t*(3-2*t)
changed=[]
for i,(vertex,q) in enumerate(zip(m.vertices,old)):
 if q.z>=3.55:continue
 c=center(q.z);r=q.copy();s=scale(q.z);r.x=c.x+(q.x-c.x)*s;r.y=c.y+(q.y-c.y)*s
 vertex.co=inverse@r;changed.append(i)
m.update();assert not m.has_custom_normals,'Wood must use its actual smooth geometric normals, not an old custom field'
after={o.name:fields(o) for o in objects}
for o in objects:
 if o!=wood:assert after[o.name]==before[o.name],('Every nonwood native field must remain exact',o.name)
for key in ['loops','polygons','uv','colors','materials','matrix']:assert after[wood.name][key]==before[wood.name][key],key
new=[world@v.co for v in m.vertices]
assert changed and all(abs(old[i].z-new[i].z)<1e-6 for i in range(len(old)))
assert all(old[i]==new[i] for i in range(len(old)) if old[i].z>=3.55)
low=[q for q in new if q.z<2.1];assert max(abs(q.x) for q in low)<=.35 and max(abs(q.y) for q in low)<=.35
assert max(math.hypot(q.x,q.y) for q in low)<.28
for i in changed:
 if old[i].z<=1.65:
  c=center(old[i].z);r0=math.hypot(old[i].x-c.x,old[i].y-c.y);r1=math.hypot(new[i].x-c.x,new[i].y-c.y)
  assert abs(r1-.55*r0)<1e-6
# Check original physical root and scaffold contacts against actual triangles.
adj=[set() for _ in m.vertices]
for e in m.edges:
 u,v=e.vertices;adj[u].add(v);adj[v].add(u)
components=[];seen=set()
for i in range(len(m.vertices)):
 if i in seen:continue
 todo=[i];group=[]
 while todo:
  k=todo.pop()
  if k in seen:continue
  seen.add(k);group.append(k);todo.extend(adj[k]-seen)
 components.append(group)
m.calc_loop_triangles();membership={v:i for i,g in enumerate(components) for v in g};faces=[[] for _ in components]
for t in m.loop_triangles:
 group=membership[t.vertices[0]];assert all(membership[v]==group for v in t.vertices);faces[group].append(tuple(t.vertices))
trunk=max((i for i,g in enumerate(components) if min(old[v].z for v in g)<.1),key=lambda i:max(old[v].z for v in components[i]))
assert max(old[v].z for v in components[trunk])>5
near=[i for i,g in enumerate(components) if i!=trunk and min(old[v].z for v in g)<4.35]
def tree(points,group):return BVHTree.FromPolygons(points,faces[group],all_triangles=True)
old_trunk=tree(old,trunk);new_trunk=tree(new,trunk);contacts=[]
for group in near:
 old_overlap=len(old_trunk.overlap(tree(old,group)));new_overlap=len(new_trunk.overlap(tree(new,group)))
 if old_overlap:assert new_overlap>0,('Retain original root/scaffold contact',group)
 contacts.append({'component':group,'minimumHeight':min(old[v].z for v in components[group]),'originalIntersections':old_overlap,'candidateIntersections':new_overlap})
assert sum(c['minimumHeight']<.1 and c['originalIntersections']>0 for c in contacts)==6
assert any(c['minimumHeight']>3 and c['originalIntersections']>0 for c in contacts)
minimum_area=math.inf;min_orientation=1
for t in m.loop_triangles:
 aa,bb,cc=[new[i] for i in t.vertices];n=(bb-aa).cross(cc-aa);area=n.length/2;minimum_area=min(minimum_area,area);assert area>1e-9
 aa,bb,cc=[old[i] for i in t.vertices];prior=(bb-aa).cross(cc-aa)
 alignment=n.normalized().dot(prior.normalized());min_orientation=min(min_orientation,alignment);assert alignment>0
blend=OUT/'roadside-oak.blend';glb=OUT/'roadside-oak.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_materials='EXPORT',export_yup=True,export_attributes=True,export_gpu_instances=False)
assert sha(source)==source_hash
bounds=lambda points:{'min':[min(v[k] for v in points) for k in range(3)],'max':[max(v[k] for v in points) for k in range(3)]}
report={'method':'55% horizontal radial scale about the retained bent shaft through1.65m, smoothstep return to100%at3.55m, exactabove; no crown/leaf edit or added topology',
 'oldSource':base_record,'authorRecipeSha256':sha(__file__),'blender':bpy.app.version_string,'changedWoodVertices':len(changed),'woodVertices':len(m.vertices),
 'lowWoodBefore':bounds([v for v in old if v.z<2.1]),'lowWoodAfter':bounds(low),'maximumLowRadius':max(math.hypot(q.x,q.y) for q in low),
 'nonwoodFieldsExact':True,'woodTopologyUVColorBindingsExact':True,'upperWoodPositionsExactAbove':3.55,'allHeightsExact':True,
 'contacts':contacts,'minimumTriangleArea':minimum_area,'minimumFaceOrientationDot':min_orientation,
 'source':{'bytes':blend.stat().st_size,'sha256':sha(blend)},'glb':{'bytes':glb.stat().st_size,'sha256':sha(glb)}}
(OUT/'native-authoring.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
