# SPDX-License-Identifier: GPL-3.0-or-later
"""Original compact drought-tolerant planting, after environment-kit.py.

The paired agave/flowering shrub occupies an existing nonwalkable garden bed:
radius <= 0.70 m, height <= 0.65 m. No downloaded meshes or new collision shape.
"""


def detailed_garden_low():
 if 'garden-low' not in SELECTED:return
 start()
 wax=material('agave-waxy',(.255,.365,.285),.67)
 petals=material('garden-petals',(.73,.55,.20),.92)
 flowerheart=material('garden-flower-heart',(.33,.25,.09),.96)
 # Thick, cupped blue-green leaves curl out from overlapping basal sheaths. A
 # shallow central keel and convex back distinguish succulent flesh from grass.
 origin=Vector((-.235,-.035,.025))
 for i in range(27):
  angle=i*2.399;radial=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-math.sin(angle),math.cos(angle),0))
  age=i//9
  reach=(.39 if age==0 else .285 if age==1 else .15)*(1+.06*math.sin(i*1.31))
  height=(.18 if age==0 else .35 if age==1 else .54)+.022*math.sin(i*2.10)
  width=(.063 if age<2 else .046)*(1+.08*math.sin(i))
  tip=origin+radial*reach+Vector((0,0,height))
  verts=[origin];faces=[]
  for q in [.23,.52,.78]:
   middle=origin.lerp(tip,q)+Vector((0,0,(.105 if age==0 else .065)*math.sin(math.pi*q)))
   w=width*math.sin(math.pi*q)**.82
   ridge=.018*math.sin(math.pi*q);thickness=.012*math.sin(math.pi*q)
   # Three upper and three lower vertices share the leaf's botanical section.
   verts.extend([middle-side*w,middle+Vector((0,0,ridge)),middle+side*w,
                 middle-side*w-Vector((0,0,thickness)),middle-Vector((0,0,thickness)),middle+side*w-Vector((0,0,thickness))])
  verts.append(tip)
  faces.extend([(0,1,2),(0,2,3),(0,5,4),(0,6,5),(0,4,1),(0,3,6)])
  for row in range(2):
   a=1+row*6;b=a+6
   faces.extend([(a,b,b+1,a+1),(a+1,b+1,b+2,a+2),
                 (a+3,a+4,b+4,b+3),(a+4,a+5,b+5,b+4),
                 (a,a+3,b+3,b),(a+2,b+2,b+5,a+5)])
  a=13;end=19
  faces.extend([(a,end,a+1),(a+1,end,a+2),(a+3,a+4,end),(a+4,a+5,end),(a+3,end,a),(a+2,end,a+5)])
  blade=mesh('thick sculpted agave leaf',verts,faces,wax)
  for p in blade.data.polygons:p.use_smooth=True
 # Compact woody shrub with leafy shoots integrated into an uneven round mass.
 # The atlas stem remains anchored to a modeled branch at every growth point.
 base=Vector((.23,.035,.03))
 for shoot in range(12):
  a=shoot*2.399;reach=.11+.015*(shoot%4)
  tip=base+Vector((math.cos(a)*reach,math.sin(a)*reach,.20+.025*(shoot%4)))
  middle=base.lerp(tip,.54)+Vector((0,0,.025))
  woody_curve('garden shrub branched stem',[base,middle,tip],.008)
  for spray in range(4):
   t=.48+.145*spray;anchor=middle.lerp(tip,t)
   angle=a+(spray-1.5)*.56;pitch=.62+.20*math.sin(shoot+spray*2.2)
   direction=Vector((math.cos(angle)*math.cos(pitch),math.sin(angle)*math.cos(pitch),math.sin(pitch)))
   attached_leaf_spray(anchor,direction,.27+.014*(shoot%3),(.5 if spray%2 else -.5)+shoot*.33,leaf2 if (shoot+spray)%5==0 else leaf)
  # Sparse, physically folded flowers remain small color accents, with their
  # pedicels connected to living shoot tips rather than floating colored dots.
  if shoot%2==0:
   for bloom in range(3):
    center=tip+Vector((math.cos(a+bloom*1.3)*.049,math.sin(a+bloom*1.3)*.049,.115+.017*bloom))
    cyl('garden flower stem',tip,center,.0028,wood,4,.0016)
    for petal in range(5):
     angle=petal*math.tau/5+shoot;radial=Vector((math.cos(angle),math.sin(angle),.25));side=Vector((-math.sin(angle),math.cos(angle),0))
     stem=center+radial*.005;shoulder=center+radial*.014;end=center+radial*.024
     mesh('folded garden petal',[stem,shoulder-side*.009,shoulder+Vector((0,0,.004)),shoulder+side*.009,end],[(0,1,2),(0,2,3),(1,4,2),(2,4,3)],petals)
    sphere('flower pollen center',center+Vector((0,0,.005)),(.005,.005,.005),flowerheart,6,3)
 bpy.context.view_layer.update()
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  for vertex in o.data.vertices:
   p=o.matrix_world @ vertex.co
   assert p.xy.length <= .70+1e-5,(o.name,tuple(p))
   assert -.005 <= p.z <= .65,(o.name,tuple(p))
 env_finish('garden-low')


detailed_garden_low()


def detailed_garden_shrub():
 """Original connected three-lobe olive shrub for overlapping frontage planting."""
 if 'garden-shrub' not in SELECTED:return
 start()
 petals=material('garden-petals',(.73,.55,.20),.92)
 base=Vector((0,0,.025));blooms=[]
 lobes=[(Vector((-.19,-.025,.22)),.23,.24),
        (Vector((.175,.105,.24)),.26,.27),
        (Vector((.065,-.205,.205)),.22,.235)]
 for lobe,(center,reach,shoot_length) in enumerate(lobes):
  fork=base.lerp(center,.57)+Vector((0,0,.020))
  woody_curve('shrub connected basal leader',[base,fork,center],.013)
  for shoot in range(7):
   angle=shoot*2.399+lobe*1.41
   radial=Vector((math.cos(angle),math.sin(angle),0))
   # Every leafy shoot joins its lobe leader. Unequal crown shoulders overlap
   # without detached outer cards or three visible ball-shaped solid meshes.
   anchor=fork.lerp(center,.48+.07*(shoot%3))
   tip=center+radial*(reach*.43)+Vector((0,0,.023+.018*(shoot%3)))
   mid=anchor.lerp(tip,.56)+Vector((0,0,.016))
   woody_curve('shrub attached lateral shoot',[anchor,mid,tip],.0065)
   for spray in range(3):
    t=.32+.29*spray;root=mid.lerp(tip,t)
    heading=angle+(spray-1)*.60
    pitch=.34+.28*spray+.055*math.sin(shoot*1.71+lobe)
    direction=Vector((math.cos(heading)*math.cos(pitch),math.sin(heading)*math.cos(pitch),math.sin(pitch)))
    length=shoot_length*(.95+.055*((shoot+spray)%3))
    leaf_mesh=attached_leaf_spray(root,direction,length,shoot*.63+lobe*.47+spray*.71,
      leaf2 if (shoot+spray+lobe)%7==0 else leaf)
    # Lighting follows each low botanical crown, retaining a small folded-leaf
    # contribution. It does not borrow the tall oak's world-space normal field.
    normals=[]
    for polygon in leaf_mesh.data.polygons:
     real=polygon.normal.copy()
     for loop in polygon.loop_indices:
      position=leaf_mesh.data.vertices[leaf_mesh.data.loops[loop].vertex_index].co
      delta=position-center
      radial_normal=Vector((delta.x/.32**2,delta.y/.32**2,delta.z/.25**2))
      if radial_normal.length_squared<1e-10:radial_normal=Vector((0,0,1))
      normal=(radial_normal.normalized()*.76+Vector((0,0,.20))+real*.04).normalized()
      normals.append(normal)
     polygon.use_smooth=True
    leaf_mesh.data.normals_split_custom_set(normals)
   if (lobe,shoot) in [(0,2),(1,1),(1,5),(2,4)]:blooms.append((tip,angle))
 # Four tiny flowers are subordinate to the olive foliage; all attach to shoots.
 for tip,angle in blooms:
  center=tip+Vector((math.cos(angle)*.038,math.sin(angle)*.038,.10))
  cyl('shrub fine flower pedicel',tip,center,.0025,wood,4,.0014)
  for petal in range(5):
   a=petal*math.tau/5+angle;radial=Vector((math.cos(a),math.sin(a),.20));side=Vector((-math.sin(a),math.cos(a),0))
   stem=center+radial*.004;shoulder=center+radial*.012;end=center+radial*.021
   mesh('small folded shrub petal',[stem,shoulder-side*.007,shoulder+Vector((0,0,.003)),shoulder+side*.007,end],
     [(0,1,2),(0,2,3),(1,4,2),(2,4,3)],petals)
  sphere('subtle shrub flower heart',center+Vector((0,0,.004)),(.004,.004,.004),wood,6,3)
 bpy.context.view_layer.update();triangles=0
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
  for vertex in o.data.vertices:
   p=o.matrix_world @ vertex.co
   assert p.xy.length<=.65+1e-6,(o.name,tuple(p))
   assert -.005<=p.z<=.65,(o.name,tuple(p))
 assert 1200<=triangles<=1600,triangles
 print('garden-shrub:',triangles,'triangles within 0.65m radial/height limits')
 env_finish('garden-shrub')


detailed_garden_shrub()
