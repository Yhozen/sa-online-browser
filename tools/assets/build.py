# SPDX-License-Identifier: GPL-3.0-or-later
"""Original editable neighborhood kit. Run with the pinned Blender, no addons required."""
import bpy, math, json, pathlib, random
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'apps/browser/public/assets'; OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'assets/source'; SOURCE.mkdir(exist_ok=True)
assert bpy.app.version[:3]==(4,5,13), bpy.app.version_string
random.seed(73)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
materials={}
def material(name,color,rough=.8,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 materials[name]=m;return m
stucco=material('stucco',(.72,.66,.51));trim=material('sage',(.23,.33,.26));roof=material('shingle',(.16,.18,.16));concrete=material('concrete',(.52,.50,.43));wood=material('wood',(.27,.20,.13));dark=material('rubber',(.025,.035,.037));glass=material('glass',(.18,.31,.34),.18,.2);glass.diffuse_color=(.18,.31,.34,.22);glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.22;glass.surface_render_method='DITHERED'
white=material('ivory',(.86,.84,.71));coral=material('coral',(.60,.19,.12),.27,.28);chrome=material('chrome',(.54,.58,.57),.25,.8);red=material('tail',(.6,.035,.015),.3);leaf=material('foliage',(.20,.29,.105));leaf2=material('foliage-light',(.32,.39,.16));skin=material('skin',(.39,.22,.135));shirt=material('outfit',(.07,.31,.30));denim=material('denim',(.055,.085,.10));hair=material('hair',(.035,.026,.018));objects=[]
def add(o,name,mat):
 o.name=name;o.data.materials.append(mat);objects.append(o);return o
def box(name,p,s,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=add(bpy.context.object,name,mat);o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  b=o.modifiers.new('soft edges','BEVEL');b.width=bevel;b.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
 return o
def sphere(name,p,s,mat,segments=12,rings=8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=p);o=add(bpy.context.object,name,mat);o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in o.data.polygons:f.use_smooth=True
 return o
def cyl(name,a,b,r,mat,vertices=10,r2=None):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)/2);o=add(bpy.context.object,name,mat);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def mesh(name,verts,faces,mat):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);return add(o,name,mat)
def start():
 global objects
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);objects=[]
def export(name,merge=True):
 if merge:
  for mat in materials.values():
   group=[o for o in list(bpy.context.scene.objects) if o.type=='MESH' and o.data.materials[0]==mat and not (name=='coupe' and (o.name.startswith('wheel') or o.name.startswith('hub')))]
   if not group:continue
   bpy.ops.object.select_all(action='DESELECT')
   for o in group:o.select_set(True)
   bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name=mat.name
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{name}.blend'),compress=True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_materials='EXPORT',export_yup=True)

def house(v):
 start(); wall=[stucco,stucco,white,stucco][v]; paint=[trim,white,trim,wood][v]
 box('foundation',(0,0,.18),(16.4,12.4,.36),concrete)
 box('plaster',(0,0,1.95),(16,12,3.5),wall)
 if v==2:
  box('flat roof',(0,0,3.85),(16.6,12.6,.35),roof);box('parapet',(0,-6,4.15),(16.7,.35,.7),wall)
  for x in [-7.8,7.8]:box('parapet side',(x,0,4.05),(.3,12,.55),wall)
 else:
  ridge=5.8 if v==3 else 4.35 if v==1 else 5
  mesh('gable',[(-8.5,-6.5,3.7),(8.5,-6.5,3.7),(0,-6.5,ridge),(-8.5,6.5,3.7),(8.5,6.5,3.7),(0,6.5,ridge)],[(0,1,2),(3,5,4),(0,2,5,3),(2,1,4,5)],roof)
  for y in [-6.53,6.53]:
   cyl('fascia',(-8.5,y,3.7),(0,y,ridge),.10,paint,4);cyl('fascia',(0,y,ridge),(8.5,y,3.7),.10,paint,4)
  # Roof battens catch afternoon light and break the broad roof surface.
  for x in range(-8,9):
   z=3.7+(1-abs(x)/8.5)*(ridge-3.7)+.015;box('roof course',(x,0,z),(.035,13,.025),wood)
 box('porch slab',(-3,-7,.22),(6,2.3,.44),concrete)
 for x in [-5.8,-.2]:box('porch post',(x,-7.9,1.75),(.18,.18,3.1),paint)
 box('porch shade',(-3,-7,3.25),(6.5,2.8,.18),paint)
 for z,y,w in [(.08,-8.8,3),(.16,-8.45,3)]:box('step',(-3,y,z),(w,.5,z*2),concrete)
 box('door',(-3,-6.025,1.38),(1.1,.10,2.35),paint,.03);sphere('handle',(-2.58,-6.12,1.25),(.045,.05,.045),chrome)
 for x in [-6,0,3]:
  box('window trim',(x,-6.07,2),(1.95,.15,1.65),white)
  box('window',(x,-6.17,2),(1.7,.04,1.4),dark)
  box('mullion',(x,-6.21,2),(.055,.06,1.4),white);box('sill',(x,-6.2,1.28),(2,.25,.09),paint)
  for dx in [-1.12,1.12]:box('shutter',(x+dx,-6.10,2),(.23,.13,1.7),paint)
 # Garage bay visually part of the original house footprint.
 box('garage trim',(5.8,-6.07,1.5),(3.85,.15,2.85),white)
 box('garage door',(5.8,-6.18,1.48),(3.55,.08,2.65),paint)
 for z in [.35,.8,1.25,1.7,2.15,2.6]:box('garage seam',(5.8,-6.24,z),(3.5,.02,.025),wood)
 if v==3:
  box('dormer',(0,-2.5,4.5),(2.4,2,1.5),wall);box('dormer glass',(0,-3.52,4.6),(1.2,.04,.9),dark);box('dormer cap',(0,-2.5,5.35),(2.7,2.3,.2),roof)
 if v==1:
  box('side porch',(8.5,1,.2),(2,6,.4),concrete);box('side shade',(8.5,1,3.1),(2.5,6.3,.15),paint)
  for y in [-1.8,3.8]:box('side post',(9.5,y,1.5),(.16,.16,3),paint)
 box('chimney',(5,3,4.6),(1,1,2),wall);box('cap',(5,3,5.65),(1.25,1.25,.12),concrete)
 box('driveway',(6,-9,.025),(4,6,.05),concrete)
 export(f'house-{v}')

for v in range(4):house(v)
start();cyl('trunk',(0,0,0),(.2,0,10),.24,wood,9,.13)
for i in range(10):
 a=i*math.tau/10
 for j in range(4):
  r=.3+j*.65;z=10.3+.5*math.sin(j*.8)-j*.24
  p=Vector((math.cos(a)*r,math.sin(a)*r,z));q=Vector((math.cos(a)*(r+.9),math.sin(a)*(r+.9),z-.3));side=Vector((-math.sin(a)*.38,math.cos(a)*.38,0))
  mesh('frond',[p,p+side,q,p-side],[(0,1,2),(0,2,3)],leaf if i%2 else leaf2)
export('palm')
start();cyl('trunk',(0,0,0),(0,0,5),.32,wood,10,.15)
for i in range(9):
 a=i*2.4;r=1.5 if i else 0;p=(math.cos(a)*r,math.sin(a)*r,5+i%3*.7);cyl('branch',(0,0,3),p,.1,wood,6,.04);sphere('crown',p,(1.7,1.7,1.6),leaf if i%2 else leaf2,10,6)
export('tree')
start()
for x in [-2,2]:cyl('post',(x,0,0),(x,0,1.1),.04,chrome,6)
for z in [.1,1.05]:cyl('rail',(-2,0,z),(2,0,z),.025,chrome,6)
# Thin diamond-wire mesh, no alpha texture overdraw.
for i in range(-15,16):
 x=i*.2
 for direction in [-1,1]:
  a=max(0,(-2-x)/direction) if direction>0 else max(0,(2-x)/direction)
  b=min(1, (2-x)/direction) if direction>0 else min(1,(-2-x)/direction)
  if b>a:cyl('wire',(x+direction*a,0,.05+a),(x+direction*b,0,.05+b),.006,chrome,4)
export('fence')
start()
for x in [-2,2]:cyl('post',(x,0,0),(x,0,1.1),.04,chrome,4)
for z in [.1,1.05]:cyl('rail',(-2,0,z),(2,0,z),.025,chrome,4)
for x in [-1.5,-.5,.5,1.5]:cyl('wire',(x-.5,0,.1),(x+.5,0,1.05),.009,chrome,3);cyl('wire',(x+.5,0,.1),(x-.5,0,1.05),.009,chrome,3)
export('fence-low')
start();box('post',(0,0,.5),(.09,.09,1),wood);box('box',(0,.08,1.03),(.35,.55,.3),trim,.08);box('flag',(.2,0,1.12),(.025,.04,.2),red);export('mailbox')
start();box('bin',(0,0,.43),(.56,.62,.86),trim,.06);box('lid',(0,0,.9),(.63,.7,.08),dark,.02)
for x in [-.22,.22]:sphere('wheel',(x,.22,.12),(.10,.10,.10),dark)
export('bin')
start();cyl('pole',(0,0,0),(0,0,10),.16,wood,10,.10);box('crossbar',(0,0,9),(2.8,.15,.16),wood)
for x in [-1,0,1]:cyl('insulator',(x,0,9),(x,0,9.4),.09,white,8)
export('pole')
start();cyl('lamp',(0,0,0),(0,0,6.5),.075,dark,10);cyl('arm',(0,0,6.5),(1.4,0,6.5),.06,dark,8);box('housing',(1.4,0,6.45),(.8,.4,.18),chrome,.06);box('light',(1.4,0,6.35),(.65,.3,.02),white);export('lamp')

# Coupe in protocol origin: wheels meet ground at Z=-1.
start()
box('chassis',(0,0,-.43),(1.86,4.35,.44),coral,.14)
box('hood',(0,1.35,-.10),(1.80,1.45,.26),coral,.10)
box('trunk',(0,-1.6,-.05),(1.82,1.0,.28),coral,.10)
box('floor',(0,-.1,-.15),(1.5,2.2,.12),dark)
for x in [-.88,.88]:box('door',(x,-.05,.03),(.13,1.9,.55),coral,.045)
# Cabin only thin pillars and glass: both occupants can be seen.
for x in [-.78,.78]:
 cyl('A pillar',(x,.95,.12),(x*.84,.4,.90),.045,coral,8)
 cyl('C pillar',(x,-1.05,.12),(x*.84,-.6,.90),.055,coral,8)
 box('mirror',(x*1.23,.6,.35),(.25,.27,.15),coral,.04)
mesh('windshield',[(-.78,.95,.15),(.78,.95,.15),(.65,.4,.88),(-.65,.4,.88)],[(0,1,2,3)],glass)
mesh('rear glass',[(-.78,-1.05,.15),(-.65,-.6,.88),(.65,-.6,.88),(.78,-1.05,.15)],[(0,1,2,3)],glass)
for x in [-.78,.78]:mesh('side window',[(x,.9,.22),(x*.84,.38,.85),(x*.84,-.58,.85),(x,-1,.22)],[(0,1,2,3)],glass)
box('roof',(0,-.1,.92),(1.4,1.15,.10),coral,.07)
for x in [-.42,.42]:
 box('seat cushion',(x,-.1,-.04),(.59,.58,.17),dark,.07);box('seat back',(x,-.44,.27),(.58,.15,.6),dark,.06);box('headrest',(x,-.43,.66),(.30,.12,.22),dark,.06)
 e=bpy.data.objects.new('seat_driver' if x<0 else 'seat_passenger',None);bpy.context.collection.objects.link(e);e.location=(x,-.12,.05)
box('dashboard',(0,.6,.27),(1.5,.28,.25),dark,.03)
bpy.ops.mesh.primitive_torus_add(major_segments=16,minor_segments=6,location=(-.42,.43,.45),major_radius=.19,minor_radius=.025,rotation=(math.pi/2.5,0,0));add(bpy.context.object,'steering',dark)
for x in [-.62,.62]:
 box('headlight',(x,2.19,-.14),(.48,.055,.18),white,.025);box('tail light',(x,-2.19,-.11),(.48,.06,.16),red,.025)
for y in [-2.19,2.19]:box('bumper',(0,y,-.4),(1.7,.08,.13),dark,.02);box('plate',(0,y*1.025,-.27),(.35,.025,.12),white)
for x in [-.96,.96]:
 for y in [-1.38,1.38]:
  wheel=cyl('wheel', (x-.12,y,-.59),(x+.12,y,-.59),.41,dark,20)
  cyl('hub',(x-.14,y,-.59),(x+.14,y,-.59),.24,chrome,12)
box('spoiler',(0,-1.91,.30),(1.7,.28,.08),coral,.03)
# Lower the glasshouse into sports-coupe proportions; retain wheel radius and ground contact.
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and not (o.name.startswith('wheel') or o.name.startswith('hub')):
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  for vertex in o.data.vertices:vertex.co.z=vertex.co.z*.75-.2
 if o.name.startswith('seat_') and o.type=='EMPTY':o.location.z=-.30
export('coupe',True)

# Human authored as smoothly shaded weighted parts; bone weights are explicit and editable.
start();parts=[]
def part(o,b):parts.append((o,b));return o
part(sphere('hips',(0,0,.90),(.23,.14,.19),denim),'hips')
verts=[];faces=[]
for z,w,d in [(.96,.20,.13),(1.12,.23,.15),(1.35,.265,.15),(1.44,.27,.13),(1.53,.085,.075)]:
 for i in range(16):a=i*math.tau/16;verts.append((math.cos(a)*w,math.sin(a)*d,z))
for j in range(4):
 for i in range(16):faces.append((j*16+i,j*16+(i+1)%16,(j+1)*16+(i+1)%16,(j+1)*16+i))
body=part(mesh('overshirt',verts,faces,shirt),'spine')
for f in body.data.polygons:f.use_smooth=True
part(box('undershirt',(0,.144,1.26),(.19,.018,.38),white,.025),'spine')
part(cyl('neck',(0,0,1.48),(0,0,1.59),.08,skin,12),'head')
part(sphere('head',(0,0,1.72),(.135,.13,.19),skin,16,10),'head')
part(sphere('hair',(0,-.025,1.83),(.14,.125,.10),hair,14,8),'head')
part(sphere('beard',(0,.025,1.63),(.108,.105,.06),hair),'head')
part(sphere('nose',(0,.13,1.72),(.032,.045,.045),skin),'head')
for x in [-.055,.055]:
 part(sphere('eye',(x,.119,1.77),(.022,.016,.013),white),'head');part(sphere('iris',(x,.133,1.77),(.010,.005,.011),hair),'head')
for side,x in [('L',-.15),('R',.15)]:
 part(cyl('thigh',(x,0,.46),(x,0,.91),.10,denim,12,.125),f'thigh{side}')
 part(cyl('calf',(x,0,.09),(x,0,.48),.075,denim,12,.10),f'shin{side}')
 part(box('sneaker',(x,.055,.07),(.19,.34,.14),white,.045),f'shin{side}')
 armx= -.31 if side=='L' else .31
 part(cyl('sleeve',(armx,0,1.09),(armx,0,1.41),.075,shirt,12,.105),f'arm{side}');part(sphere('shoulder',(armx,0,1.41),(.10,.10,.075),shirt),f'arm{side}')
 part(sphere('forearm',(armx,0,.99),(.068,.075,.18),skin),f'forearm{side}')
 part(sphere('hand',(armx,0,.81),(.065,.07,.09),skin),f'forearm{side}')
bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='NeighborRig';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
bones=[('hips',(0,0,.85),(0,0,1.0),None),('spine',(0,0,1),(0,0,1.5),'hips'),('head',(0,0,1.5),(0,0,1.9),'spine')]
for side,x in [('L',-.15),('R',.15)]:
 ax=-.31 if side=='L' else .31
 bones += [(f'thigh{side}',(x,0,.85),(x,0,.46),'hips'),(f'shin{side}',(x,0,.46),(x,0,.07),f'thigh{side}'),(f'arm{side}',(ax,0,1.45),(ax,0,1.12),'spine'),(f'forearm{side}',(ax,0,1.12),(ax,0,.81),f'arm{side}')]
for name,head,tail,parent in bones:
 b=rig.data.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for o,bone in parts:
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('skin','ARMATURE');mod.object=rig;o.parent=rig
# Join all parts to a single skinned mesh with shared armature, preserving weight groups.
bpy.ops.object.select_all(action='DESELECT')
for o,b in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0][0];bpy.ops.object.join();parts[0][0].name='Neighbor'
rig.animation_data_create();bpy.context.scene.render.fps=30
for name,duration in [('idle',60),('walk',30),('jump',30),('seated',60)]:
 action=bpy.data.actions.new(name);rig.animation_data.action=action
 for frame in range(1,duration+2,5):
  phase=(frame-1)/duration*math.tau
  for p in rig.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0)
  if name=='idle':rig.pose.bones['spine'].rotation_euler.x=.025*math.sin(phase)
  if name=='walk':
   for side,sign in [('L',1),('R',-1)]:
    rig.pose.bones[f'thigh{side}'].rotation_euler.x=sign*.55*math.sin(phase)
    rig.pose.bones[f'shin{side}'].rotation_euler.x=-max(0,sign*.65*math.sin(phase))
    rig.pose.bones[f'arm{side}'].rotation_euler.x=-sign*.38*math.sin(phase)
  if name=='jump':
   for side in ['L','R']:rig.pose.bones[f'thigh{side}'].rotation_euler.x=.45;rig.pose.bones[f'shin{side}'].rotation_euler.x=-.7;rig.pose.bones[f'arm{side}'].rotation_euler.x=-.7
  if name=='seated':
   for side in ['L','R']:rig.pose.bones[f'thigh{side}'].rotation_euler.x=math.pi/2;rig.pose.bones[f'shin{side}'].rotation_euler.x=-math.pi/2;rig.pose.bones[f'arm{side}'].rotation_euler.x=.55;rig.pose.bones[f'forearm{side}'].rotation_euler.x=.6
  for p in rig.pose.bones:p.keyframe_insert('rotation_euler',frame=frame);p.keyframe_insert('location',frame=frame)
 track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,action)
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0)
export('neighbor',False)
print('Original asset kit exported with Blender',bpy.app.version_string)
