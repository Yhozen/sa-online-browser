# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Arroyo architecture and vegetation, executed by build.py after base exports.
All dimensions are meters, Z up; house fronts face -Y. No downloaded geometry.
The lot envelope, front door, driveway and trunk origins match the shared fixture.
"""

# These swatches also provide semantically named hooks for runtime texture binding.
palmgreen=material('palm-frond',(.055,.115,.028),.90)
palmlight=material('palm-frond-light',(.115,.175,.045),.92)
interior=material('window-interior',(.028,.045,.045),.92)
windowglass=material('window-glazing',(.022,.035,.038),.20,.12)
roofedge=material('roof-edge',(.17,.18,.16),.89)
soil=material('garden-soil',(.18,.14,.075),1)
brick=material('terracotta',(.40,.22,.13),.94)
flower=material('bougainvillea',(.47,.12,.18),.88)
from mathutils import noise
import bmesh
from mathutils.bvhtree import BVHTree


def env_uv(o,scale=1.0):
 """Box-project in world meters, preserving authored leaves' dedicated UVs."""
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for polygon in o.data.polygons:
  normal=polygon.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
  coords=[i for i in range(3) if i!=axis]
  for loop in polygon.loop_indices:
   p=o.matrix_world @ o.data.vertices[o.data.loops[loop].vertex_index].co
   uv.data[loop].uv=(p[coords[0]]/scale,p[coords[1]]/scale)
 return o


def leafcard(name,center,width,length,angle,tilt,mat):
 """A bent branch card, not a sphere: alpha image has foliage and visible gaps."""
 center=Vector(center);u=Vector((math.cos(angle),math.sin(angle),0))*width*.5
 v=Vector((-math.sin(angle)*math.cos(tilt),math.cos(angle)*math.cos(tilt),math.sin(tilt)))*length*.5
 verts=[center-u-v,center-v+Vector((0,0,.07)),center+u-v,center-u+v,center+v+Vector((0,0,.07)),center+u+v]
 o=mesh(name,verts,[(0,1,4,3),(1,2,5,4)],mat)
 uv=o.data.uv_layers.new(name='UVMap');mapping=[(0,0),(.5,0),(1,0),(0,1),(.5,1),(1,1)]
 for p in o.data.polygons:
  for loop in p.loop_indices:uv.data[loop].uv=mapping[o.data.loops[loop].vertex_index]
 return o


def house_ao_sampler(meshes):
 """Bake real cosine-weighted hemisphere visibility into vertices, without lighting.

 Only solid geometry occludes: alpha foliage cards and window glazing are excluded.
 Rays cover 2.4m so porch roofs and eaves create localized depth, not globally darker
 elevations. Deterministic samples and cached face-normal/position pairs keep this
 reproducible; the resulting runtime COLOR_0 adds no additional shader or RPC cost.
 """
 verts=[];polys=[]
 for o in meshes:
  if o.name.startswith('leaf-card') or o.data.materials[0] in [windowglass,glass]:continue
  offset=len(verts);verts.extend(o.matrix_world @ v.co for v in o.data.vertices)
  polys.extend(tuple(offset+i for i in p.vertices) for p in o.data.polygons)
 # The known level ground plane also occludes lower wall/column hemisphere samples.
 offset=len(verts);verts.extend([(-30,-30,0),(30,-30,0),(30,30,0),(-30,30,0)]);polys.append(tuple(offset+i for i in range(4)))
 tree=BVHTree.FromPolygons(verts,polys,all_triangles=False,epsilon=.0001)
 samples=[]
 for i in range(48):
  r=math.sqrt((i+.5)/48);a=i*2.399963229728653
  samples.append(Vector((r*math.cos(a),r*math.sin(a),math.sqrt(1-r*r))))
 cache={};ao_values=[]
 def visibility(position,normal):
  key=tuple(round(x,4) for x in (*position,*normal))
  if key in cache:return cache[key]
  n=normal.normalized();axis=Vector((0,0,1)) if abs(n.z)<.95 else Vector((0,1,0))
  tangent=axis.cross(n).normalized();bitangent=n.cross(tangent)
  origin=position+n*.012;blocked=0
  for p in samples:
   direction=tangent*p.x+bitangent*p.y+n*p.z
   hit,_,_,distance=tree.ray_cast(origin,direction,2.4)
   if hit is not None:
    # Nearby eaves/corners are strong, distant roof edges fade out continuously.
    blocked+=(1-(min(distance,2.4)/2.4)**2)
  factor=1-.64*blocked/len(samples)
  cache[key]=factor;ao_values.append(factor);return factor
 return visibility,ao_values


def env_finish(name):
 bpy.context.view_layer.update()
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];used=set()
 # Vertex AO needs surface samples away from existing box corners. Only surfaces
 # that show spatially varying contact shade are tessellated; decorative parts stay light.
 for o in meshes:
  cuts=15 if o.name.startswith('stucco walls') else 7 if o.name.startswith(('porch soffit','porch slab','porch roof')) else 3 if o.name.startswith(('window cavity','window reflective pane','painted door','driveway slab')) else 0
  if cuts:
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=cuts,use_grid_fill=True);bm.to_mesh(o.data);bm.free()
 ao,ao_values=house_ao_sampler(meshes) if name.startswith('house') else (None,[])
 for o in meshes:
  mat=o.data.materials[0];used.add(mat)
  if not o.name.startswith('leaf-card'):env_uv(o,2 if mat in [stucco,white,concrete] else 1)
  normal_matrix=o.matrix_world.to_3x3().inverted().transposed()
  color=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  o.data.color_attributes.active_color=color
  for polygon in o.data.polygons:
   for loop in polygon.loop_indices:
    v=o.matrix_world @ o.data.vertices[o.data.loops[loop].vertex_index].co
    n=noise.noise(Vector((v.x*.71,v.y*.71,v.z*.92)))
    shade=.91+.075*n
    if name.startswith('house'):
     if mat in [stucco,white,concrete,trim,wood,brick]:
      # Dust splash at the base, eave shade, and rain trails under the sills.
      shade-=.26*math.exp(-max(0,v.z-.18)*2.8)
      if o.name.startswith('stucco walls'):
       if v.y < -5.95:
        shade-=sum(.105*math.exp(-((v.x-x)/.70)**2)*math.exp(-abs(v.z-1.18)*2.2) for x in [-6,0,2.6])
        shade-=.12*max(0,noise.noise(Vector((v.x*4.3,0,v.z*.13))))
       if abs(v.x)>7.98:shade-=.045
     elif mat in [roof,roofedge]:shade=.74+.19*(.5+.5*n)
    elif o.name.startswith('leaf-card'):shade=.78+.16*(.5+.5*n)
    elif mat in [palmgreen,palmlight]:shade=.78+.18*(.5+.5*n)
    if ao and not o.name.startswith('leaf-card') and mat not in [roof,roofedge,palmgreen,palmlight,leaf,leaf2]:
     shade*=ao(v,normal_matrix @ polygon.normal)
    color.data[loop].color=(max(.20,shade),max(.20,shade*.987),max(.20,shade*.960),1)
 if ao_values:print(f'{name}: baked {len(ao_values)} hemisphere AO samples, visibility {min(ao_values):.3f}–{max(ao_values):.3f}')
 # The glTF exporter recognizes VertexColor × constant base color as COLOR_0.
 for mat in used:
  nodes=mat.node_tree.nodes;p=nodes.get('Principled BSDF')
  attr=nodes.get('Arroyo baked weathering') or nodes.new('ShaderNodeVertexColor');attr.name='Arroyo baked weathering';attr.layer_name='Color'
  mul=nodes.get('Arroyo weathering tint') or nodes.new('ShaderNodeMix');mul.name='Arroyo weathering tint';mul.data_type='RGBA';mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[6].default_value=mat.diffuse_color
  mat.node_tree.links.new(attr.outputs['Color'],mul.inputs[7]);mat.node_tree.links.new(mul.outputs[2],p.inputs['Base Color'])
 export(name)


def shrub(x,y,size=1):
 cyl('shrub woody stem',(x,y,.08),(x,y,.65*size),.035,wood,5,.012)
 for i in range(24):
  a=i*2.399;r=size*.45*math.sqrt((i+.5)/24);h=.30+size*(.38+.26*math.sin(i*1.7))
  leafcard('leaf-card shrub',(x+math.cos(a)*r,y+math.sin(a)*r,h),size*.89,size*.88,a,.25+(i%4)*.43,leaf if i%3 else leaf2)


def agave(x,y,size=1):
 for i in range(18):
  a=i*2.399;r=size*(.40+.16*(i%3));root=Vector((x,y,.08));tip=Vector((x+math.cos(a)*r,y+math.sin(a)*r,.35+size*(.3+.10*(i%4))))
  middle=root.lerp(tip,.58)+Vector((0,0,.18));side=Vector((-math.sin(a),math.cos(a),0))*.095*size
  mesh('agave blade',[root,middle-side,middle+Vector((0,0,.027)),middle+side,tip],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],palmgreen if i%3 else palmlight)


def window(x,y,z,w,h,paint,side=False):
 # Deep frames sit 13cm forward of opaque inner rooms, with a reflective glazing inset.
 prior=set(bpy.context.scene.objects)
 box('window cavity',(x,y,z),(w+.15,.07,h+.15),interior)
 box('window reflective pane',(x,y-.055,z),(w-.10,.015,h-.10),windowglass)
 for xx in [x-w/2,x+w/2]:box('window jamb',(xx,y-.12,z),(.085,.21,h+.15),paint,.008)
 for zz in [z-h/2,z+h/2]:box('window header',(x,y-.12,zz),(w+.1,.21,.085),paint,.008)
 box('window mullion',(x,y-.145,z),(.042,.09,h),white)
 box('window sash',(x,y-.15,z-.1),(w,.07,.04),white)
 box('window sill',(x,y-.19,z-h/2-.045),(w+.27,.36,.085),paint,.012)
 # A subtle curtain stripe reads as occupied home without an interior render.
 for xx in [x-w*.37,x+w*.37]:box('window curtain',(xx,y-.067,z),(w*.10,.01,h-.20),wood)
 if side:
  for o in set(bpy.context.scene.objects)-prior:
   o.location=Vector((o.location.y,-o.location.x,o.location.z));o.rotation_euler.z=-math.pi/2


def roof_shell(v,paint):
 if v==2:
  box('flat roof coping',(0,0,3.86),(16.45,12.45,.24),roof)
  for y in [-6.08,6.08]:box('plaster parapet',(0,y,4.03),(16.5,.32,.62),stucco);box('coping stone',(0,y,4.37),(16.6,.43,.10),white)
  for x in [-8.08,8.08]:box('side parapet',(x,0,4.03),(.32,12,.62),stucco);box('side coping',(x,0,4.37),(.43,12,.10),white)
  return
 ridge=5.5 if v==3 else 4.55 if v==1 else 5.05
 if v==1:
  # Hipped low ranch roof gives the kit a distinct silhouette.
  roofverts=[(-8.55,-6.55,3.72),(8.55,-6.55,3.72),(8.55,6.55,3.72),(-8.55,6.55,3.72),(-3.4,0,ridge),(3.4,0,ridge)]
  mesh('hip roof',roofverts,[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4)],roof)
  for a,b in [(0,4),(1,5),(2,5),(3,4),(4,5)]:cyl('hip ridge cap',roofverts[a],roofverts[b],.07,roofedge,6)
 else:
  mesh('gable infill',[(-8,-6,3.65),(8,-6,3.65),(0,-6,ridge-.14),(-8,6,3.65),(8,6,3.65),(0,6,ridge-.14)],[(0,1,2),(3,5,4)],stucco if v==0 else paint)
  mesh('roof underlay',[(-8.55,-6.6,3.72),(0,-6.6,ridge),(8.55,-6.6,3.72),(-8.55,6.6,3.72),(0,6.6,ridge),(8.55,6.6,3.72)],[(0,3,4,1),(1,4,5,2)],roofedge)
  # Offset shingle faces provide real layered edges and differentiated silhouettes.
  for sign in [-1,1]:
   verts=[];faces=[]
   for row in range(26):
    lo=row*8.55/26;hi=min(8.55,lo+.39);height=lambda x:ridge-(ridge-3.72)*x/8.55
    for col in range(25):
     y0=-6.6+col*.55-(row%2)*.275;y1=min(6.6,y0+.535);y0=max(-6.6,y0)
     if y1<=y0:continue
     n=len(verts);verts += [(sign*lo,y0,height(lo)+.02),(sign*hi,y0,height(hi)+.04),(sign*hi,y1,height(hi)+.04),(sign*lo,y1,height(lo)+.02)];faces.append((n,n+1,n+2,n+3))
   mesh('layered roof shingles',verts,faces,roof)
  cyl('roof ridge cap',(0,-6.67,ridge+.025),(0,6.67,ridge+.025),.095,roofedge,8)
  for y in [-6.62,6.62]:
   for x in [-8.56,8.56]:cyl('painted gable fascia',(x,y,3.7),(0,y,ridge),.10,paint,4)
   if v==3:
    for x in [-5,0,5]:box('decorative rafter',(x,y,3.58),(.10,.60,.19),paint)
 for x in [-8.55,8.55]:
  box('fascia',(x,0,3.65),(.15,13.3,.22),white)
  cyl('gutter',(x, -6.55,3.61),(x,6.55,3.61),.07,paint,8)
  for y in [-5.8,5.8]:
   cyl('downspout',(x,y,3.57),(x,y,.25),.045,paint,6)
   cyl('downspout shoe',(x,y,.25),(x,y-.24,.15),.045,paint,6)


def detailed_house(v):
 start();paint=[trim,white,white,wood][v];wall=white if v==2 else stucco
 box('foundation',(0,0,.18),(16.4,12.4,.36),concrete)
 box('stucco walls',(0,0,1.95),(16,12,3.5),wall)
 if v==1:
  # Shallow overlapping clapboard, with genuine shadow lines rather than painted bands.
  for i in range(20):box('ranch clapboard',(0,-6.025,.42+i*.16),(16,.055,.145),trim)
 if v==3:
  for x in [-7.9,7.9]:box('craftsman corner trim',(x,-6.04,1.95),(.20,.14,3.55),paint)
 roof_shell(v,paint)
 # The original covered porch occupies its exact existing collision-safe envelope.
 box('porch slab',(-3,-7,.22),(6,2.3,.44),concrete)
 for z,y in [(.08,-8.8),(.16,-8.45)]:box('porch step',(-3,y,z),(3,.5,z*2),concrete,.025)
 for x in [-5.8,-.2]:
  if v==3:box('porch masonry plinth',(x,-7.9,.62),(.5,.5,.8),brick,.02)
  box('porch column',(x,-7.9,1.75),(.20 if v!=2 else .34,.20 if v!=2 else .34,3.1),paint,.012)
  box('column foot',(x,-7.9,.48),(.3,.3,.12),white)
  box('column capital',(x,-7.9,3.12),(.35,.35,.15),white)
 box('porch soffit',(-3,-7,3.23),(6.5,2.8,.17),white)
 box('porch roof',(-3,-7,3.37),(6.7,2.9,.15),roof if v!=2 else brick)
 for x in [-5.8,-4.8,-1.2,-.2]:box('porch ceiling rafter',(x,-7.0,3.12),(.08,2.5,.12),paint)
 for x0,x1 in [(-5.7,-4.5),(-1.5,-.3)]:
  for z in [.72,1.23]:box('porch rail',((x0+x1)/2,-8.04,z),(x1-x0,.07,.08),paint)
  for i in range(6):box('porch baluster',(x0+(x1-x0)*i/5,-8.04,.98),(.045,.045,.48),paint)
 box('door frame',(-3,-6.07,1.41),(1.32,.15,2.53),white)
 box('door recess',(-3,-6.16,1.39),(1.14,.045,2.38),interior)
 box('painted door',(-3,-6.19,1.39),(1.05,.04,2.3),paint,.018)
 for x in [-3.25,-2.75]:
  for z in [.64,1.35,2.10]:box('raised door panel',(x,-6.225,z),(.34,.018,.48),paint,.009)
 sphere('door knob',(-2.58,-6.29,1.28),(.042,.048,.042),chrome)
 # Separate glazing material prevents the vehicle's transparent glass settings affecting windows.
 for x in [-6,0,2.6]:window(x,-6.09,2.0,1.65 if x!=2.6 else 1.30,1.43,white)
 for x in [-3.5,2.6]:window(x,-8.035,2,1.65,1.43,white,True)
 # Louvered shutters, corner boards and a small gable vent break broad clean facades.
 if v in [0,1,3]:
  for x in [-6,0,2.6]:
   w=1.65 if x!=2.6 else 1.3
   for side in [-1,1]:
    xx=x+side*(w/2+.24)
    box('shutter back',(xx,-6.13,2.0),(.31,.08,1.56),trim)
    for z in [1.29,2.71]:box('shutter cross rail',(xx,-6.22,z),(.34,.07,.08),trim)
    for i in range(12):
     louver=box('shutter louver',(xx,-6.22,1.37+i*.112),(.27,.10,.045),trim);louver.rotation_euler.x=.34
 if v in [0,3]:
  box('gable vent dark',(0,-6.018,4.05),(.62,.07,.44),interior)
  for i in range(5):box('gable vent slat',(0,-6.075,3.88+i*.086),(.67,.10,.045),white)
 for x in [-7.96,7.96]:box('wall corner edging',(x,-6.035,1.93),(.10,.075,3.45),white)

 box('garage outer trim',(5.8,-6.10,1.5),(3.87,.18,2.90),white)
 box('garage dark jamb',(5.8,-6.20,1.48),(3.61,.05,2.72),interior)
 for row in range(5):
  z=.31+row*.51
  box('garage sectional panel',(5.8,-6.24,z),(3.48,.035,.49),trim if v!=3 else white)
  for x in [4.51,5.37,6.23,7.09]:box('garage embossed inset',(x,-6.265,z),(.68,.018,.30),trim if v!=3 else white,.015)
 box('garage handle',(5.8,-6.30,1.12),(.22,.05,.025),chrome)
 for x in [-4.05,3.65,7.9]:
  box('porch light bracket',(x,-6.2,2.62),(.12,.16,.08),dark)
  box('porch light lantern',(x,-6.29,2.48),(.16,.17,.21),white,.025)
 if v==3:
  box('dormer',(0,-2.2,4.65),(2.5,2.4,1.4),wall)
  window(0,-3.43,4.72,1.5,.90,white)
  mesh('dormer pitched cap',[(-1.45,-3.62,5.26),(1.45,-3.62,5.26),(0,-3.62,5.85),(-1.45,-.86,5.26),(1.45,-.86,5.26),(0,-.86,5.85)],[(0,3,5,2),(2,5,4,1)],roof)
 box('chimney',(5,3,4.55),(.90,.90,1.85),brick)
 for zz in [3.9,4.18,4.46,4.74,5.02,5.3]:box('chimney mortar line',(5,3,zz),(.918,.918,.026),concrete)
 box('chimney cap',(5,3,5.52),(1.16,1.16,.12),concrete)
 # Segmented driveway adds expansion joints without changing physical footprint.
 for y in [-10.5,-7.5]:box('driveway slab',(6,y,.025),(3.97,2.98,.05),concrete)
 # All bed geometry is beside the covered porch and entirely clear of the door/driveway.
 for x,w in [(-7.05,1.40),(1.5,3.55)]:
  box('front planting soil',(x,-6.72,.035),(w,1.18,.055),soil)
  for y in [-7.30,-6.12]:box('garden edging',(x,y,.11),(w,.11,.15),brick)
 for x in [-7.4,-6.7,.25,1.2,2.2,3.05]:
  if (int(x*10)+v)%3==0:agave(x,-6.85,1.0)
  else:shrub(x,-6.72,1.16)
 # Street-facing planting extends the original bed, never crossing porch access or garage.
 for x in [-7.5,-6.8,.45,1.30,2.15,3.05]:
  shrub(x,-7.18,.78)
  if (int(x*10)+v)%2==0:
   for f in range(8):
    a=f*2.4;xx=x+math.cos(a)*.26;yy=-7.14+math.sin(a)*.26;zz=.73+.13*math.sin(f*1.4)
    # Small folded five-petal blooms, intentionally accents within green bushes.
    verts=[(xx,yy,zz+.027)]+[(xx+.058*math.cos(k*math.tau/5),yy+.058*math.sin(k*math.tau/5),zz) for k in range(5)]
    mesh('garden bloom',verts,[(0,k+1,(k+1)%5+1) for k in range(5)],flower)

 env_finish(f'house-{v}')


for variant in range(4):detailed_house(variant)

# Ringed, softly curved palm with articulated feather fronds; no billboard star crown.
start();centers=[]
for j in range(31):
 t=j/30;centers.append(Vector((.20*t+.35*math.sin(t*math.pi),.12*math.sin(t*math.pi*.8),10*t)))
verts=[];faces=[]
for j,c in enumerate(centers):
 r=.235-.092*j/30
 for i in range(12):
  a=math.tau*i/12;verts.append(c+Vector((math.cos(a)*r,math.sin(a)*r,0)))
 if j:
  for i in range(12):faces.append(((j-1)*12+i,(j-1)*12+(i+1)%12,j*12+(i+1)%12,j*12+i))
trunk=mesh('curved palm trunk',verts,faces,wood)
for p in trunk.data.polygons:p.use_smooth=True
for j in range(1,50):
 t=j/50;c=Vector((.20*t+.35*math.sin(t*math.pi),.12*math.sin(t*math.pi*.8),10*t));r=.242-.092*t
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.018,major_segments=12,minor_segments=4,location=c);add(bpy.context.object,'palm growth ring',wood)
base=centers[-1]
for i in range(28):
 a=i*2.399;direction=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0));length=2.85+(i%5)*.25
 points=[]
 for j in range(13):
  t=j/12;points.append(base+direction*(length*t)+Vector((0,0,.16+1.28*math.sin(t*math.pi*.90)-t*(2.65 if i<10 else 1.45 if i<20 else .22))))
 for j in range(12):cyl('palm frond rib',points[j],points[j+1],.028*(1-j/14),palmgreen,5,.018*(1-j/13))
 for j in range(1,25):
  t=j/25;f=t*12;k=min(11,int(f));root=points[k].lerp(points[k+1],f-k);blade_length=(.24+.84*math.sin(t*math.pi))*(.91+(i%3)*.08)
  for sign in [-1,1]:
   tip=root+side*(sign*blade_length)+direction*(.15+.30*t)+Vector((0,0,-.12-.25*t));mid=root.lerp(tip,.48)+Vector((0,0,.045));width=direction*(.060+.042*math.sin(t*math.pi))
   mesh('feather leaflet',[root,mid-width,mid+Vector((0,0,.018)),mid+width,tip],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],palmgreen if i%3 else palmlight)
# A small brown crownshaft makes the crown transition botanical, not a star glued to a pole.
for i in range(12):
 a=i*math.tau/12;cyl('old frond base',base+Vector((math.cos(a)*.17,math.sin(a)*.17,-.30)),base+Vector((math.cos(a)*.43,math.sin(a)*.43,.16)),.055,wood,5,.025)
env_finish('palm')

# Broadleaf street tree: trunk forks, visible secondary limbs, irregular layered foliage.
start();cyl('tree trunk',(0,0,0),(.1,.03,3.1),.32,wood,12,.19)
for root_angle in range(0,360,60):
 a=math.radians(root_angle);cyl('root flare',(math.cos(a)*.30,math.sin(a)*.30,.035),(0,0,.65),.11,wood,6,.075)
for branch in range(10):
 a=branch*2.399;reach=1.15+(branch%3)*.27;end=Vector((math.cos(a)*reach,math.sin(a)*reach,4.5+(branch%4)*.43))
 junction=Vector((.1,.03,2.3+(branch%3)*.25));mid=junction.lerp(end,.55)+Vector((0,0,.40))
 cyl('fork limb',junction,mid,.13,wood,8,.075);cyl('upper limb',mid,end,.076,wood,7,.025)
 for twig in range(4):
  ta=a+(twig-1.5)*.7;tip=end+Vector((math.cos(ta)*(.75+twig*.09),math.sin(ta)*(.75+twig*.09),.40+(twig%2)*.36))
  cyl('branchlet',end,tip,.027,wood,5,.009)
  for card in range(10):
   ca=card*2.399+branch*.7;rad=.20+.50*math.sqrt((card+.5)/10)
   center=tip+Vector((math.cos(ca)*rad,math.sin(ca)*rad,.33*math.sin(card*1.7)))
   leafcard('leaf-card canopy',center,1.03+(card%3)*.15,.99+(card%4)*.13,ca,.35+(card%4)*.47,leaf if (card+branch)%4 else leaf2)
env_finish('tree')
print('Detailed original architecture and vegetation exported.')
