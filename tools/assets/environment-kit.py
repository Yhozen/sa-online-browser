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


def attached_leaf_spray(root,direction,length,roll,mat,canopy=None,spread=1.0,minimum_z=None):
 """Anchor the atlas's lower-left stem to the actual twig, not a random card center.
 The image's main bough runs diagonally UV (0,0)→(1,1). Align that diagonal with
 the growing branch so every leaf group has a visible botanical attachment.
 """
 root=Vector(root);direction=Vector(direction).normalized()
 axis=Vector((0,0,1)) if abs(direction.z)<.94 else Vector((0,1,0))
 side=direction.cross(axis).normalized();normal=side.cross(direction).normalized()
 side=side*math.cos(roll)+normal*math.sin(roll)
 normal=direction.cross(side).normalized()
 # Mature oak shoots carry broad lateral branchlets. Widen their horizontal
 # spread while retaining the authored vertical growth and branch attachment;
 # other plants keep the original spray and complete atlas UV coordinates.
 broadside=Vector((side.x*spread,side.y*spread,side.z))
 u=(direction+broadside)*length*.5;v=(direction-broadside)*length*.5
 verts=[]
 for iy in range(3):
  for ix in range(3):
   x=ix*.5;y=iy*.5
   # The live twig arches in depth and the two leaf-bearing sides cup around it.
   # This is a folded botanical spray, not a planar square floating in the crown.
   along=(x+y)*.5;across=x-y
   bend=(math.sin(math.pi*along)*.13-across*across*.055)*length
   verts.append(root+u*x+v*y+normal*bend)
 if minimum_z is not None:
  lowest=min(v.z for v in verts)
  if lowest<minimum_z:
   # Shorten the whole young shoot about its attached stem, preserving its fold
   # and botanical connection instead of clipping a flat underside into leaves.
   scale=(root.z-minimum_z)/(root.z-lowest)
   assert 0<scale<=1, 'oak spray stem must remain above pedestrian clearance'
   verts=[root+(v-root)*scale for v in verts]
 o=mesh('leaf-card attached oak spray',verts,[(j*3+i,j*3+i+1,(j+1)*3+i+1,(j+1)*3+i) for j in range(2) for i in range(2)],mat)
 uv=o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  for loop in p.loop_indices:
   vi=o.data.loops[loop].vertex_index;uv.data[loop].uv=((vi%3)*.5,(vi//3)*.5)
 if canopy:
  o['canopy_center']=canopy[0];o['canopy_radius']=canopy[1]
 return o


def woody_curve(name,points,radius):
 """Continuous tapered bough with nonuniform bends, shared rings and smooth bark."""
 points=[Vector(p) for p in points];verts=[];faces=[]
 for j,p in enumerate(points):
  tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
  side=tangent.cross(Vector((0,0,1)))
  if side.length<.1:side=tangent.cross(Vector((0,1,0)))
  side.normalize();normal=tangent.cross(side).normalized();r=radius*(1-.81*j/(len(points)-1))
  for k in range(8):
   a=k*math.tau/8;verts.append(p+(side*math.cos(a)+normal*math.sin(a))*r)
  if j:
   for k in range(8):faces.append(((j-1)*8+k,(j-1)*8+(k+1)%8,j*8+(k+1)%8,j*8+k))
 o=mesh(name,verts,faces,wood)
 for f in o.data.polygons:f.use_smooth=True
 return o


def sculpt_canopy_normals():
 """Canopy lighting normals, independent of each alpha card's arbitrary plane.

 The shared ellipsoid gives the entire tree a lit shoulder and a shaded underside;
 a restrained branch-volume field adds connected local shoulders within the crown.
 Preserve the folded leaf normal, exact positions/UVs and opaque branch geometry.
 Runtime foliage shading must retain this outward field on backfaces as well.
 """
 bpy.context.view_layer.update()
 center=Vector((0,0,6.05));radius=Vector((3.85,3.75,2.25))
 count=0
 for o in bpy.context.scene.objects:
  if o.type!='MESH' or not o.name.startswith('leaf-card'):continue
  normal_matrix=o.matrix_world.to_3x3().inverted().transposed()
  world_to_local_normal=normal_matrix.inverted()
  lobe_center=Vector(o.get('canopy_center',center));lobe_radius=Vector(o.get('canopy_radius',radius))
  # Cache the actual folded normals before enabling smooth custom interpolation.
  normals=[]
  for polygon in o.data.polygons:
   real=(normal_matrix @ polygon.normal).normalized()
   for loop in polygon.loop_indices:
    position=o.matrix_world @ o.data.vertices[o.data.loops[loop].vertex_index].co
    delta=position-center
    radial=Vector((delta.x/(radius.x*radius.x),delta.y/(radius.y*radius.y),delta.z/(radius.z*radius.z)))
    if radial.length_squared<1e-8:radial=Vector((0,0,1))
    radial.normalize()
    local_delta=position-lobe_center
    local=Vector((local_delta.x/lobe_radius.x**2,local_delta.y/lobe_radius.y**2,local_delta.z/lobe_radius.z**2))
    local=local.normalized() if local.length_squared>1e-8 else radial
    blended=(radial*.78+local*.15+real*.07).normalized()
    normals.append((world_to_local_normal @ blended).normalized())
   polygon.use_smooth=True
  o.data.normals_split_custom_set(normals);o.data.update();count+=len(normals)
 print(f'Sculpted canopy lighting field on {count} leaf corners; positions/UVs unchanged.')


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
 if name not in SELECTED:return
 bpy.context.view_layer.update()
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];used=set()
 # Vertex AO needs surface samples away from existing box corners. Only surfaces
 # that show spatially varying contact shade are tessellated; decorative parts stay light.
 for o in meshes:
  cuts=7 if o.name.startswith('stucco walls') else 7 if o.name.startswith(('porch soffit','porch slab','porch roof')) else 3 if o.name.startswith(('window cavity','window reflective pane','painted door','driveway slab')) else 0
  if cuts:
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=cuts,use_grid_fill=True);bm.to_mesh(o.data);bm.free()
 ao,ao_values=house_ao_sampler(meshes) if name.startswith('house') else (None,[])
 for o in meshes:
  mat=o.data.materials[0];used.add(mat)
  if not o.name.startswith('leaf-card'):env_uv(o,.30 if o.name.startswith('foundation') else 2 if mat in [stucco,white,concrete] else 1)
  normal_matrix=o.matrix_world.to_3x3().inverted().transposed()
  color=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  o.data.color_attributes.active_color=color
  for polygon in o.data.polygons:
   for loop in polygon.loop_indices:
    v=o.matrix_world @ o.data.vertices[o.data.loops[loop].vertex_index].co
    kit_phase=(int(name[-1])*7.31 if name.startswith('house-') and name[-1].isdigit() else 0)
    n=noise.noise(Vector((v.x*.71+kit_phase,v.y*.71,v.z*.92)))
    shade=.91+.075*n
    if name.startswith('house'):
     if mat in [stucco,white,concrete,trim,wood,brick]:
      # Dust splash at the base, eave shade, and rain trails under the sills.
      # Irregular splash/grime height, not a uniform repeating horizontal band.
      grime_height=.14+.28*(.5+.5*noise.noise(Vector((v.x*.82+kit_phase,v.y*.82,0))))
      shade-=.27*math.exp(-max(0,v.z-grime_height)*3.7)
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
 # Attached multi-stem foliage follows the same texture-aligned branch construction
 # as the oak. Varied shoot heights keep planted beds from reading as hovering cards.
 base=Vector((x,y,.06));cyl('shrub woody stem',base,base+Vector((0,0,.37*size)),.035,wood,5,.018)
 for i in range(8):
  a=i*2.399;rad=size*(.18+.055*(i%3));tip=base+Vector((math.cos(a)*rad,math.sin(a)*rad,size*(.42+.10*(i%3))))
  mid=base.lerp(tip,.52)+Vector((0,0,.055))
  woody_curve('shrub branched shoot',[base,mid,tip],.013)
  for spray in range(3):
   t=.42+spray*.28;anchor=base.lerp(mid,t*2) if t<.5 else mid.lerp(tip,(t-.5)*2)
   direction=Vector((math.cos(a)*.44,math.sin(a)*.44,.74-.10*spray)).normalized()
   attached_leaf_spray(anchor,direction,size*(.65+.06*(i%2)),(spray-1)*.87,leaf2 if i%5==0 else leaf)


def agave(x,y,size=1):
 for i in range(18):
  a=i*2.399;r=size*(.40+.16*(i%3));root=Vector((x,y,.08));tip=Vector((x+math.cos(a)*r,y+math.sin(a)*r,.35+size*(.3+.10*(i%4))))
  middle=root.lerp(tip,.58)+Vector((0,0,.18));side=Vector((-math.sin(a),math.cos(a),0))*.095*size
  mesh('agave blade',[root,middle-side,middle+Vector((0,0,.027)),middle+side,tip],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],palmgreen if i%3 else palmlight)


def carve_recess(center,size,side=False):
 """Real shallow masonry opening; the server's solid shell collision is unchanged."""
 if 'house_shell' not in globals() or house_shell.name not in bpy.context.scene.objects:return
 # Newer Blender Boolean exports retain the cutter's face material. The recess
 # is masonry, so make that invariant explicit instead of relying on slot order.
 cutter=box('temporary window masonry cutter',center,size,house_shell.data.materials[0])
 if side:
  cutter.location=Vector((cutter.location.y,-cutter.location.x,cutter.location.z));cutter.rotation_euler.z=-math.pi/2
  if side<0:cutter.location.x*=-1;cutter.location.y*=-1;cutter.rotation_euler.z+=math.pi
 bpy.context.view_layer.objects.active=house_shell
 modifier=house_shell.modifiers.new('Recessed masonry opening','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
 bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(cutter,do_unlink=True)


def window(x,y,z,w,h,paint,side=False):
 # Carved reveal places the glass behind the actual wall face, not on an applied box.
 carve_recess((x,y+.16,z),(w+.13,.64,h+.13),side)
 prior=set(bpy.context.scene.objects)
 box('window cavity',(x,y+.39,z),(w+.15,.04,h+.15),interior)
 box('window reflective pane',(x,y+.24,z),(w-.10,.015,h-.10),windowglass)
 for xx in [x-w/2,x+w/2]:box('window jamb',(xx,y+.06,z),(.11,.42,h+.16),paint,.022)
 for zz in [z-h/2,z+h/2]:box('window header',(x,y+.06,zz),(w+.12,.42,.11),paint,.022)
 box('window mullion',(x,y+.22,z),(.042,.065,h),white)
 box('window sash',(x,y+.22,z-.1),(w,.055,.04),white)
 box('window sill',(x,y-.18,z-h/2-.055),(w+.31,.46,.11),paint,.024)
 # A subtle curtain stripe reads as occupied home without an interior render.
 for xx in [x-w*.37,x+w*.37]:box('window curtain',(xx,y+.29,z),(w*.10,.01,h-.20),wood)
 if side:
  for o in set(bpy.context.scene.objects)-prior:
   o.location=Vector((o.location.y,-o.location.x,o.location.z));o.rotation_euler.z=-math.pi/2
   if side<0:o.location.x*=-1;o.location.y*=-1;o.rotation_euler.z+=math.pi


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
  box('fascia',(x,0,3.65),(.15,13.3,.22),white,.025)
  cyl('gutter',(x, -6.55,3.61),(x,6.55,3.61),.07,paint,8)
  for y in [-5.8,5.8]:
   cyl('downspout',(x,y,3.57),(x,y,.25),.045,paint,6)
   cyl('downspout shoe',(x,y,.25),(x,y-.24,.15),.045,paint,6)


def detailed_house(v):
 if f'house-{v}' not in SELECTED:return
 global house_shell
 start();paint=[trim,white,white,wood][v];wall=white if v==2 else stucco
 box('foundation',(0,0,.18),(16.4,12.4,.36),concrete)
 house_shell=box('stucco walls',(0,0,1.95),(16,12,3.5),wall)
 if v==1:
  # Shallow overlapping clapboard, with genuine shadow lines rather than painted bands.
  for i in range(20):
   z=.42+i*.16;intervals=[(-8,8)]
   openings=[(-3.62,-2.38)] if z<2.65 else []
   if z<2.88:openings.append((3.85,7.75))
   if 1.16<z<2.84:openings += [(-6.93,-5.07),(-.93,.93),(1.85,3.35)]
   for lo,hi in openings:
    pieces=[]
    for a,b in intervals:
     if hi<=a or lo>=b:pieces.append((a,b))
     else:
      if lo>a:pieces.append((a,lo))
      if hi<b:pieces.append((hi,b))
    intervals=pieces
   for a,b in intervals:box('ranch clapboard',((a+b)/2,-6.025,z),(b-a,.055,.145),trim)

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
 carve_recess((-3,-5.88,1.40),(1.16,.55,2.38))
 box('door frame',(-3,-6.07,1.41),(1.32,.15,2.53),white)
 box('door recess',(-3,-5.73,1.39),(1.14,.045,2.38),interior)
 box('painted door',(-3,-5.81,1.39),(1.05,.04,2.3),paint,.018)
 for x in [-3.25,-2.75]:
  for z in [.64,1.35,2.10]:box('raised door panel',(x,-5.845,z),(.34,.018,.48),paint,.009)
 sphere('door knob',(-2.58,-5.91,1.28),(.042,.048,.042),chrome)
 # Separate glazing material prevents the vehicle's transparent glass settings affecting windows.
 for x in [-6,0,2.6]:window(x,-6.09,2.0,1.65 if x!=2.6 else 1.30,1.43,white)
 for x in [-3.5,2.6]:
  window(x,-8.035,2,1.65,1.43,white,True)
  window(x,-8.035,2,1.65,1.43,white,-1)
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
  main_shell=house_shell;house_shell=box('dormer',(0,-2.2,4.65),(2.5,2.4,1.4),wall)
  window(0,-3.43,4.72,1.5,.90,white);house_shell=main_shell
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

def detailed_palm():
 if 'palm' not in SELECTED:return
 start()
 # Growth rings are sculpted into the trunk skin. Separate torus collars looked
 # like stacked washers and cost more triangles than the entire feather crown.
 centers=[];verts=[];faces=[]
 for j in range(91):
  t=j/90;c=Vector((.20*t+.35*math.sin(t*math.pi),.12*math.sin(t*math.pi*.8),10*t));centers.append(c)
  radius=.235-.092*t+(.013 if j%2==0 else -.005)
  for k in range(12):
   a=k*math.tau/12;scar=1+.027*math.sin(k*4.1+j*.7)
   verts.append(c+Vector((math.cos(a)*radius*scar,math.sin(a)*radius*scar,0)))
  if j:
   for k in range(12):faces.append(((j-1)*12+k,(j-1)*12+(k+1)%12,j*12+(k+1)%12,j*12+k))
 trunk=mesh('sculpted fibrous palm trunk',verts,faces,wood)
 for face in trunk.data.polygons:face.use_smooth=True
 base=centers[-1]
 # Persistent, overlapping leaf bases give the head an actual botanical junction.
 # Each narrow folded sheath leans into the new leaves, with irregular torn tips.
 for i in range(27):
  a=i*2.399;radial=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0))
  bottom=base+radial*.12+Vector((0,0,-.60+(i%5)*.08))
  shoulder=base+radial*(.30+.045*(i%3))+Vector((0,0,-.12+(i%4)*.08))
  tip=base+radial*(.49+.05*math.sin(i))+Vector((0,0,.23+.09*math.sin(i*2)))
  mesh('palm torn overlapping leaf base',[bottom-side*.045,bottom+side*.045,shoulder-side*.063,shoulder+side*.063,shoulder+radial*.035,tip],[(0,1,4),(0,4,2),(1,3,4),(2,4,5),(4,3,5)],wood)
 # Three age cohorts form an asymmetric crown: hanging old leaves, spreading
 # photosynthetic feathers and upright young growth. The outer leaves are long
 # continuous arches rather than separate radial blades glued to a pole.
 # Keep established arch directions and the outer silhouette, while removing
 # nearly coincident feathers between age cohorts. Layering all 34 crowns filled
 # every gap in the light projection even after individual leaflets were thinned.
 fronds=[0,1,2,3,4,5,6,7,11,12,14,15,16,17,18,19,20,21,25,26,28,29,30,31]
 leaflet_shapes=[];accepted_crown=[]
 for i in fronds:
  a=i*2.399+.13*math.sin(i*1.3);direction=Vector((math.cos(a),math.sin(a),0));side=Vector((-math.sin(a),math.cos(a),0))
  age=0 if i<14 else 1 if i<28 else 2
  length=(3.25+.44*math.sin(i*1.77)) if age!=2 else (2.24+.30*math.sin(i))
  points=[]
  for j in range(13):
   t=j/12
   z=.16+(1.28 if age<2 else 1.77)*math.sin(t*math.pi*.81)-t*(3.18 if age==0 else 1.60 if age==1 else .12)
   # The oldest rachises turn down after the shoulder: they form a full hanging
   # skirt around the trunk instead of ending as straight horizontal spokes.
   reach=t*(1-.24*t*t) if age==0 else t
   points.append(base+direction*(length*reach)+side*(.19*math.sin(t*math.pi)*math.sin(i))+Vector((0,0,z)))
  # One connected tapered rachis mesh, with four sides because its silhouette is
  # already thinner than a pixel at street scale. This saves a third of rib cost.
  ribs=[];ribfaces=[]
  for j,p in enumerate(points):
   tangent=(points[min(j+1,12)]-points[max(j-1,0)]).normalized();up=tangent.cross(side).normalized();r=.028*(1-.89*j/12)
   for k in range(4):
    angle=k*math.tau/4;ribs.append(p+side*math.cos(angle)*r+up*math.sin(angle)*r)
   if j:
    for k in range(4):ribfaces.append(((j-1)*4+k,(j-1)*4+(k+1)%4,j*4+(k+1)%4,j*4+k))
  rib=mesh('connected tapered palm rachis',ribs,ribfaces,palmgreen)
  accepted_crown.extend(ribs)
  for face in rib.data.polygons:face.use_smooth=True
  for j in range(1,24):
   for sign in [-1,1]:
    # Alternating pairs and small phase changes prevent a comb-like silhouette.
    t=(j+.20*math.sin(i*3.1+j*1.7)+sign*.26)/25;f=t*12;k=min(11,int(f));root=points[k].lerp(points[k+1],f-k)
    leaf_length=1.12*(.12+1.00*math.sin(t*math.pi)**.76)*(.88+.13*math.sin(i*1.7+j*.71))
    tip=root+side*(sign*leaf_length)+direction*(.18+.35*t)+Vector((0,0,-.20-.27*t))
    # A longitudinal fold catches a narrow highlight; tapered ends and downward
    # curling tips leave clean feathers at distance without alpha edge artefacts.
    bladeverts=[root];original=[root]
    for q in [.32,.72]:
     center=root.lerp(tip,q)+Vector((0,0,.15*math.sin(q*math.pi)))
     # Twist a wider folded cross-section along the neighborhood's incident
     # sunlight. This is actual hanging leaf geometry: moving its edges along
     # the light ray retains their ground projection while widening the camera
     # silhouette. Every root, tip and raised midrib stays on its existing arch.
     width=.6*(.0105+.052*math.sin(t*math.pi))*math.sin(math.pi*q)**.70
     sun_axis=Vector((-58,12,47)).normalized()
     tilt=math.copysign(2.5+.25*math.sin(i*1.9+j*.8),direction.dot(sun_axis))
     across=direction*width+sun_axis*(width*tilt)
     bladeverts.extend([center-across,center+Vector((0,0,.031*math.sin(q*math.pi))),center+across])
     original.extend([center-direction*width,center+Vector((0,0,.031*math.sin(q*math.pi))),center+direction*width])
    bladeverts.append(tip)
    original.append(tip);accepted_crown.extend(original)
    blade=mesh('folded tapered palm leaflet',bladeverts,[(0,1,2),(0,2,3),(1,4,5,2),(2,5,6,3),(4,7,5),(5,7,6)],palmgreen if (i+j)%7 else palmlight)
    leaflet_shapes.append((blade,original))
    for face in blade.data.polygons:face.use_smooth=True
 # Retain the established crown bounds. Shorten only an edge's new displacement
 # along the same light ray; never clip one coordinate and change its shadow.
 minimum=[min(v[k] for v in accepted_crown) for k in range(3)]
 maximum=[max(v[k] for v in accepted_crown) for k in range(3)]
 for blade,original in leaflet_shapes:
  for vertex,old in zip(blade.data.vertices,original):
   delta=vertex.co-old;amount=1.0
   for k in range(3):
    if delta[k]>1e-8:amount=min(amount,(maximum[k]-old[k])/delta[k])
    elif delta[k]<-1e-8:amount=min(amount,(minimum[k]-old[k])/delta[k])
   vertex.co=old+delta*max(0,amount)
  blade.data.update()
 env_finish('palm')



def grow_mature_oak():
 """Connected mature scaffold; preserve low trunk and transported leaf normals."""
 bpy.context.view_layer.update()
 for o in bpy.context.scene.objects:
  if o.type != 'MESH':continue
  world=o.matrix_world.copy();inverse=world.inverted()
  normal_to_world=world.to_3x3().inverted().transposed()
  normal_to_local=normal_to_world.inverted()
  old=[world @ v.co for v in o.data.vertices]
  leaf_normals=[n.vector.copy() for n in o.data.corner_normals] if o.name.startswith('leaf-card') else None
  for v,p in zip(o.data.vertices,old):
   if p.z <= 2.1:continue
   q=p.copy();q.z += 3.0*(1-math.exp(-(p.z-2.1)/.5));v.co=inverse @ q
  o.data.update()
  if leaf_normals is not None:
   transported=[]
   for loop,n in zip(o.data.loops,leaf_normals):
    z=old[loop.vertex_index].z
    derivative=1+6*math.exp(-(z-2.1)/.5) if z>2.1 else 1
    normal=normal_to_world @ n;normal.z/=derivative
    transported.append((normal_to_local @ normal.normalized()).normalized())
   o.data.normals_split_custom_set(transported);o.data.update()
 # Wood retains its existing smooth polygon flags and natural geometric normals.

def detailed_oak(name='tree'):
 if name not in SELECTED:return
 start()
 # Root envelope and the first branching height retain the gameplay clearance.
 woody_curve('oak trunk',[(0,0,0),(.035,-.04,.8),(.11,.015,1.65),(.15,.06,2.45),(.26,.07,3.10)],.32)
 for root_angle in range(0,360,60):
  a=math.radians(root_angle);cyl('root flare',(math.cos(a)*.30,math.sin(a)*.30,.035),(0,0,.65),.11,wood,6,.075)
 # Unequal, overlapping crown volumes with real vertical depth. The lower lobes
 # merge into the rising central leaders instead of forming isolated pancakes.
 lobes=[(-1.72,-.45,5.35,1.12,.96,1.05),(1.20,-1.38,5.30,1.03,1.05,1.01),
        (1.75,.45,5.65,1.08,.99,1.10),(-.42,1.67,5.65,1.08,1.05,1.05),
        (-.30,-.20,6.50,1.10,1.07,1.12),(-1.13,.91,6.37,.95,.93,1.02),
        (.78,.67,6.45,.96,.98,1.05),(-.49,-1.44,5.95,1.01,.97,1.00),
        (.11,.37,5.10,1.10,1.01,1.04)]
 for b,(cx,cy,cz,rx,ry,rz) in enumerate(lobes):
  cz+=.32
  center=Vector((cx,cy,cz));root=Vector((.15,.05,2.45+(b%3)*.18));delta=center-root
  points=[root,root+delta*.34+Vector((.12*math.sin(b),.14*math.cos(b),.30)),root+delta*.69+Vector((-.10*math.sin(b),.05,.18)),center]
  woody_curve('oak continuous scaffold',points,.115 if b%3 else .16)
  for leader in range(10):
   # Spherical phyllotaxis samples the upper and lower hemispheres evenly. Every
   # bough has shoots growing out in depth, including the previously empty core.
   a=leader*2.399+b*.81;elevation=-.83+1.73*(leader+.5)/10
   planar=math.sqrt(1-elevation*elevation);axis=Vector((math.cos(a)*planar,math.sin(a)*planar,elevation))
   forkroot=points[2].lerp(center,.46+(leader%3)*.14)
   tip=center+Vector((axis.x*rx*.69,axis.y*ry*.69,axis.z*rz*.67))
   mid=forkroot.lerp(tip,.53)+Vector((0,0,.065))
   woody_curve('oak leaf-bearing bough',[forkroot,mid,tip],.031+.004*(leader%3))
   for spray in range(8):
    # Start foliage farther inside each connected lobe. Overlapping inner and
    # outer shoots hide the scaffold core without adding opaque filler shells.
    t=.16+.115*spray
    anchor=forkroot.lerp(mid,t*2) if t<.5 else mid.lerp(tip,(t-.5)*2)
    # Opposed side shoots avoid coincident cards while the final shoot follows
    # the botanical branch end. Deep roll differences retain canopy density from
    # walking, driving and free-orbit camera angles, not only the hero screenshot.
    orbit=a+(.55 if spray%2 else -.55)*(1-.07*spray)
    pitch=math.asin(elevation)+.27*math.sin(spray*2.12+b)
    growing=Vector((math.cos(orbit)*math.cos(pitch),math.sin(orbit)*math.cos(pitch),math.sin(pitch)))
    length=.96+.105*((spray+leader+b)%4)
    attached_leaf_spray(anchor,growing,length,(spray%3-1)*1.04+.27*math.sin(b+leader),leaf2 if (b+leader+spray)%6==0 else leaf,(tuple(center),(rx*1.60,ry*1.60,rz*1.60)),spread=1.40,minimum_z=4.11+.035*(b%3))
 # Canonical crown bounds stay around 4.1–8.4m; local-volume shading is blended
 # into the common outward field so all copies retain a coherent lit shoulder.
 sculpt_canopy_normals()
 if name == 'roadside-oak':grow_mature_oak()
 env_finish(name)


detailed_palm()
detailed_oak()
detailed_oak('roadside-oak')
print('Original connected botanical oak and feather palm exported.')
