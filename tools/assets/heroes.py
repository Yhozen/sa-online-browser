# SPDX-License-Identifier: GPL-3.0-or-later
"""Original hero meshes, executed after the base kit by build.py.

All coordinates are authored in meters, Z up, +Y forward. The coupe shares the
fixture footprint and the character deliberately retains the base skeleton and
its exported animation names. No externally sourced mesh data is used.
"""

# Deliberately reuse the base script's materials; no duplicate outfit/glass names.
# Tinted automotive glazing remains transparent enough to inspect both seats.
# Lower roughness gives one coherent reflected sky instead of milky gray panes.
glass.diffuse_color=(.045,.070,.085,.30)
glass_shader=glass.node_tree.nodes.get('Principled BSDF')
glass_shader.inputs['Base Color'].default_value=(.045,.070,.085,1)
glass_shader.inputs['Alpha'].default_value=.30
glass_shader.inputs['Roughness'].default_value=.105
glass_shader.inputs['Metallic'].default_value=0
glass_shader.inputs['Specular IOR Level'].default_value=.24
glass_shader.inputs['IOR'].default_value=1.38
glass_shader.inputs['Coat Weight'].default_value=0
glass_shader.inputs['Coat Roughness'].default_value=.08
paint = material('paint', (.018, .105, .13), .23, .68)
paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .65
paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value = .16
leather = material('leather', (.055, .063, .061), .78)
stitch = material('stitch', (.37, .36, .30), .92)
alloy = material('alloy', (.33, .36, .37), .36, .75)
interior_metal=material('interior-metal',(.055,.063,.067),.72,.22)
tire_rubber=material('tire-rubber',(.011,.013,.014),.96)
brake = material('brake', (.17, .185, .19), .46, .7)
lampglass = material('lampglass', (.74, .83, .86), .12, .2)
indicator = material('indicator', (.80, .27, .025), .29)
sole = material('sole', (.12, .13, .12), .93)
eyebrown = material('eyebrown', (.16, .095, .045), .57)


def smooth(o):
    for face in o.data.polygons:
        face.use_smooth = True
    return o


def ring_mesh(name, rings, mat, axis='z', sides=24, caps=True):
    """Closed sculptural loft. Rings contain center, width, depth; no cylinders."""
    verts = []
    for center, width, depth in rings:
        for i in range(sides):
            a = i * math.tau / sides
            if axis == 'z':
                verts.append((center[0] + math.cos(a) * width,
                              center[1] + math.sin(a) * depth, center[2]))
            else:
                verts.append((center[0] + math.cos(a) * width, center[1],
                              center[2] + math.sin(a) * depth))
    faces = []
    for j in range(len(rings) - 1):
        for i in range(sides):
            faces.append((j * sides + i, j * sides + (i + 1) % sides,
                          (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i))
    if caps:
        faces += [tuple(reversed(range(sides))),
                  tuple((len(rings) - 1) * sides + i for i in range(sides))]
    if axis == 'y': faces = [tuple(reversed(f)) for f in faces]
    return smooth(mesh(name, verts, faces, mat))


def tube(name, points, radius, mat, sides=8, closed=False):
    """A smoothly shaded swept profile for window seals, seams and trim."""
    verts = []
    n = len(points)
    for j, p in enumerate(points):
        tangent = Vector(points[(j + 1) % n]) - Vector(points[j - 1 if j else (n - 1 if closed else 0)])
        tangent.normalize()
        up = Vector((0, 0, 1))
        if abs(tangent.dot(up)) > .94:
            up = Vector((0, 1, 0))
        u = tangent.cross(up).normalized()
        v = tangent.cross(u).normalized()
        for i in range(sides):
            off = (u * math.cos(i * math.tau / sides) + v * math.sin(i * math.tau / sides)) * radius
            verts.append(Vector(p) + off)
    faces = []
    for j in range(n if closed else n - 1):
        for i in range(sides):
            faces.append((j * sides + i, j * sides + (i + 1) % sides,
                          ((j + 1) % n) * sides + (i + 1) % sides, ((j + 1) % n) * sides + i))
    return smooth(mesh(name, verts, faces, mat))


def hero_uv(o):
    # Stable, meter-scaled dominant-axis UVs on every custom surface. Existing
    # sphere/torus UVs are retained; clothing normal maps can use these at runtime.
    if o.type != 'MESH' or o.data.uv_layers:
        return
    uv = o.data.uv_layers.new(name='UVMap')
    for polygon in o.data.polygons:
        axis = max(range(3), key=lambda k: abs(polygon.normal[k]))
        coords = [k for k in range(3) if k != axis]
        for loop in polygon.loop_indices:
            p = o.data.vertices[o.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (p[coords[0]], p[coords[1]])


def formed_pillar(name,points,width,depth,mat):
    verts=[];faces=[]
    for j,p in enumerate(points):
        p=Vector(p);d=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])
        d.normalize();side=Vector((1 if p.x>0 else -1,0,0));across=d.cross(side).normalized();out=across.cross(d).normalized()
        for u,v in [(-.5,-.35),(-.42,-.5),(.42,-.5),(.5,-.35),(.5,.35),(.42,.5),(-.42,.5),(-.5,.35)]:
            verts.append(p+across*(u*width)+out*(v*depth))
    for j in range(len(points)-1):
        for i in range(8):faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
    faces.extend([tuple(reversed(range(8))),tuple((len(points)-1)*8+i for i in range(8))])
    return mesh(name,verts,[tuple(reversed(f)) for f in faces],mat)


def empty(name, p):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = p
    return o


def rounded_panel(name, points, mat, thickness=.008, bevel=.008):
    o = mesh(name, points, [tuple(range(len(points)))], mat)
    s = o.modifiers.new('panel thickness', 'SOLIDIFY'); s.thickness = thickness
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=s.name)
    if bevel:
        b = o.modifiers.new('rolled edge', 'BEVEL'); b.width = bevel; b.segments = 3
        bpy.ops.object.modifier_apply(modifier=b.name)
    return smooth(o)


start()
# Exterior sheet geometry follows a dense continuous longitudinal profile.
# The wheel arches are real openings and the glasshouse shares its boundaries.
profiles = [
    (-2.20, .80, -.29), (-2.12, .835, -.235), (-1.92, .905, -.18),
    (-1.58, .951, -.14), (-1.28, .914, -.12), (-.90, .89, -.12),
    (-.25, .89, -.14), (.45, .89, -.15), (.95, .914, -.16),
    (1.38, .954, -.18), (1.78, .898, -.22), (2.04, .85, -.26),
    (2.20, .80, -.295),
]


def sheet_center(y):
    """Deliberate longitudinal sheet contour; wheel openings never drive it.

    Front is a single cubic descent from the cowl to the nose; the rear deck is
    a matching single descent toward the tail. The derivatives vanish at the
    cowl/deck joins, so reflected horizons cannot kink at profile knots.
    """
    if y >= .96:
        t=min(1,(y-.96)/1.24)
        return -.100-.145*t*t*t
    if y <= -1.205:
        t=min(1,(-y-1.205)/.995)
        return -.090-.165*t*t*t
    t=max(0,min(1,(y+1.205)/2.025))
    return -.090-.010*t*t*(3-2*t)


def width_slope(index):
    if index==0:return (profiles[1][1]-profiles[0][1])/(profiles[1][0]-profiles[0][0])
    if index==len(profiles)-1:return (profiles[-1][1]-profiles[-2][1])/(profiles[-1][0]-profiles[-2][0])
    a,b,c=profiles[index-1:index+2]
    left=(b[1]-a[1])/(b[0]-a[0]);right=(c[1]-b[1])/(c[0]-b[0])
    if left*right<=0:return 0
    # Shape-preserving harmonic tangent cannot overshoot authored widths.
    h0=b[0]-a[0];h1=c[0]-b[0]
    w0=2*h1+h0;w1=h1+2*h0
    return (w0+w1)/(w0/left+w1/right)


def body_profile(y):
    for j,(a,b) in enumerate(zip(profiles,profiles[1:])):
        if a[0]<=y<=b[0]:
            h=b[0]-a[0];t=(y-a[0])/h
            width=(2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*h*width_slope(j)
            width+=(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*h*width_slope(j+1)
            return width,sheet_center(y)-.012
    return profiles[-1][1],sheet_center(y)-.012


def sheet_height(x,y):
    width=body_profile(y)[0]-.115
    return sheet_center(y)-.014*(x/width)**2


def arch_bottom(y):
    for wy in [-1.38, 1.38]:
        dy = abs(y-wy)
        if dy < .445:
            return -.59 + math.sqrt(.445**2 - dy**2)
    return -.74


# One welded exterior shell: a shallow crowned hood/deck rolls into a
# continuously shaped fender shoulder. Wheel arches cut actual openings.
body_shells=[]
ys=sorted(set([round(-2.2+i*.025,6) for i in range(177)]+[.82,-1.205]+
 [round(wy+math.cos(i*math.pi/48)*.445,6) for wy in [-1.38,1.38] for i in range(49)]))
def shell_row(y,sign):
    w,_=body_profile(y);edge=sheet_height(w-.115,y);low=arch_bottom(y)
    # A real 115mm rolled shoulder replaces the former near-vertical plate.
    # Lower door skin has one subtle concavity rather than a balloon section.
    upper=[(w-.115,edge),(w-.075,edge-.003),(w-.035,edge-.014),
      (w-.008,edge-.036),(w,edge-.061)]
    shoulder_z=upper[-1][1]
    lower=[(w-.003,shoulder_z*.80+low*.20),(w-.011,shoulder_z*.50+low*.50),
      (w-.016,shoulder_z*.22+low*.78),(w-.018,low)]
    # At arch apices only the narrow folded sheet above the wheel remains.
    # Remap vertical depth monotonically to avoid self-intersections.
    if low>shoulder_z-.015:
        upper=[(x,edge+(low-edge)*i/12) for i,(x,z) in enumerate(upper)]
        shoulder_z=upper[-1][1]
        lower=[(w-.003,shoulder_z*.80+low*.20),(w-.011,shoulder_z*.50+low*.50),
          (w-.016,shoulder_z*.22+low*.78),(w-.018,low)]
    return [(sign*x,y,z) for x,z in upper+lower]
for sign in [-1,1]:
    verts=[p for y in ys for p in shell_row(y,sign)];faces=[]
    for j in range(len(ys)-1):
        for k in range(8):
            ids=(j*9+k,j*9+k+1,(j+1)*9+k+1,(j+1)*9+k)
            faces.append(ids if sign>0 else tuple(reversed(ids)))
    body_shells.append(smooth(mesh('continuous stamped side skin',verts,faces,paint)))
    for wy in [-1.38,1.38]:
        points=[]
        for i in range(65):
            a=i*math.pi/64;y=wy+math.cos(a)*.445;z=-.59+math.sin(a)*.445
            x=sign*(body_profile(y)[0]-.018)
            points.extend([(x,y,z),(x-sign*.032,y,z-.004),(x-sign*.160,y,z-.030)])
        # Folded arch return has a narrow painted edge and a black inner liner.
        smooth(mesh('folded wheel arch return',points,[(i*3,i*3+1,i*3+4,i*3+3) if sign>0 else (i*3+3,i*3+4,i*3+1,i*3) for i in range(64)],paint))
        smooth(mesh('deep wheel arch liner',points,[(i*3+1,i*3+2,i*3+5,i*3+4) if sign>0 else (i*3+4,i*3+5,i*3+2,i*3+1) for i in range(64)],dark))
    # Formed flat rocker with a rolled edge, not a tube along the door.
    verts=[]
    for y,end in [(-.925,.02),(-.83,0),(.83,0),(.925,.02)]:
        for x,z in [(.837,-.653),(.899-end,-.680),(.905-end,-.712),(.865-end,-.735)]:verts.append((sign*x,y,z))
    fs=[(j*4+i,j*4+i+1,(j+1)*4+i+1,(j+1)*4+i) for j in range(3) for i in range(3)]
    smooth(mesh('formed rocker panel',verts,fs if sign>0 else [tuple(reversed(f)) for f in fs],paint))

def body_top(name,y0,y1):
    rows=[y for y in ys if y0<=y<=y1];verts=[]
    for y in rows:
        w,_=body_profile(y)
        for i in range(33):
            x=(i/16-1)*(w-.115);verts.append((x,y,sheet_height(x,y)))
    fs=[(j*33+i,j*33+i+1,(j+1)*33+i+1,(j+1)*33+i) for j in range(len(rows)-1) for i in range(32)]
    o=smooth(mesh(name,verts,fs,paint));body_shells.append(o);return o
body_top('formed hood skin',.82,2.2)
body_top('formed rear deck',-2.2,-1.205)
# Weld matching side/hood vertices to produce actual continuous shared normals.
bpy.ops.object.select_all(action='DESELECT')
for o in body_shells:o.select_set(True)
bpy.context.view_layer.objects.active=body_shells[0];bpy.ops.object.join()
body_shell=body_shells[0];body_shell.name='welded exterior sheet metal'
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.00002);bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
# Precise rear sill closes the glazing base to the deck boundary.
sv=[]
for i in range(33):
    nx=i/16-1;x=nx*.79;sv.extend([(x,-1.205,sheet_height(x,-1.205)),
      (x,-1.17-.020*(1-nx*nx),-.105+.014*(1-nx*nx))])
smooth(mesh('rear glass sill flange',sv,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(32)],paint))
# Integrated deck trailing lip is a formed shallow blade, not an inflated ring.
sv=[]
for y,h in [(-2.12,.008),(-2.085,.027),(-2.05,.018)]:
    w=body_profile(y)[0]-.04
    for i in range(33):
        x=(i/16-1)*w;sv.append((x,y,sheet_height(x,y)+h))
smooth(mesh('formed deck trailing lip',sv,[(j*33+i,j*33+i+1,(j+1)*33+i+1,(j+1)*33+i) for j in range(2) for i in range(32)],paint))
for side in [-1,1]:
    # Continuous painted belt shoulder connects the fitted glass sill to
    # the main door skin, eliminating an open dark slot under the side window.
    belt_vertices=[]
    for j in range(25):
        t=j/24;y=-1.035+1.875*t
        w,z=body_profile(y);edge=sheet_height(w-.115,y)
        belt_vertices.extend([(side*(.78+.02*t),y,-.065-.01*t),
                              (side*(w-.115),y,edge)])
    belt_faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(24)]
    smooth(mesh('continuous door belt',belt_vertices,
        belt_faces if side>0 else [tuple(reversed(f)) for f in belt_faces],paint))
    # A real door shutline is dark and fine, not a protruding trim bar.
    tube('door shutline',[(side*.885,-.91,-.13),(side*.893,-.87,-.32),
         (side*.889,-.79,-.61),(side*.889,.59,-.61),(side*.894,.79,-.32),(side*.893,.81,-.15)], .0024, dark, 6)
    box('flush door handle',(side*.900,-.62,-.205),(.024,.18,.024),chrome,.01)
    # Door card sits inside the painted outer panel.
    box('inner door card',(side*.79,-.02,-.40),(.08,1.65,.37),leather,.035)
    box('door armrest',(side*.735,-.16,-.33),(.12,.45,.07),dark,.027)

# Front and rear fascias follow the outline of the continuous shell.
for y, facing in [(2.15,1),(-2.15,-1)]:
    # End cover uses exactly the same outer ring as the side shell: each
    # stamped return meets the hood, shoulder and lower side without gaps.
    ring=shell_row(facing*2.20,1);verts=[]
    for row,(width,_,z) in enumerate(ring):
        for i in range(49):
            nx=i/24-1;bow=.018*(1-nx*nx)
            verts.append((nx*width,facing*(2.20-bow),z+.014*(1-nx*nx)*(1-row/8)))
    fs=[(j*49+i,j*49+i+1,(j+1)*49+i+1,(j+1)*49+i) for j in range(8) for i in range(48)]
    smooth(mesh('continuous fitted end cover',verts,fs if facing>0 else [tuple(reversed(f)) for f in fs],paint))
    box('lower impact strip',(0,facing*2.210,-.626),(1.34,.028,.028),dark,.009)
    box('lower grille',(0,y+facing*.066,-.56),(.94,.018,.115),dark,.04)
    for i in (range(-6,7) if facing > 0 else [-5,0,5]):
        box('grille blades',(i*.064,y+facing*.08,-.56),(.016,.012,.09),brake,.004)
    box('license recess',(0,y+facing*.07,-.345),(.38,.016,.14),dark,.015)
    box('ivory plate',(0,y+facing*.081,-.345),(.335,.008,.108),white,.006)
    for x in [-.145,.145]:sphere('plate screw',(x,y+facing*.087,-.345),(.008,.005,.008),chrome,8,4)

for side in [-1,1]:
    # Recessed smoked surround, twin projector optics and narrow running strip.
    x=side*.59
    ring_mesh('headlamp housing',[((x,y,z),w,d) for y,z,w,d in
               [(2.140,-.32,.24,.077),(2.201,-.335,.205,.057)]],dark,'y',20)
    for dx in [-.093,.072]:
        cyl('projector surround',(x+dx,2.203,-.33),(x+dx,2.213,-.33),.050,chrome,20)
        sphere('projector lens',(x+dx,2.219,-.33),(.038,.018,.038),lampglass,16,8)
    box('running light',(x,2.211,-.285),(.30,.012,.012),white,.006)
    # Keep the complete fitted light assembly beyond the fascia at y=-2.20.
    # Lens / optic layering uses explicit 8–10 mm clearance, avoiding z fighting.
    box('tail smoked surround',(side*.60,-2.219,-.305),(.45,.018,.105),dark,.025)
    box('red tail lens',(side*.60,-2.234,-.298),(.40,.012,.058),red,.018)
    for dx in [-.11,-.04,.03,.10]:box('tail optic',(side*.60+dx,-2.244,-.298),(.025,.009,.035),red,.009)
    box('reverse lamp',(side*.42,-2.235,-.327),(.065,.009,.016),white,.004)
    cyl('exhaust metal',(side*.60,-2.15,-.70),(side*.60,-2.28,-.70),.055,chrome,16)
    cyl('exhaust dark bore',(side*.60,-2.283,-.70),(side*.60,-2.287,-.70),.043,dark,16)

# Glasshouse is authored from shared boundaries. Roof, glazing and stamped
# pillar patches share every edge; no freestanding tubes or visor overhang.
def car_interp(profile,y):
    for j,(a,b) in enumerate(zip(profile,profile[1:])):
        if a[0]<=y<=b[0]:
            h=b[0]-a[0];t=(y-a[0])/h;out=[]
            for k in range(1,len(a)):
                def slope(index):
                    if index==0:return (profile[1][k]-profile[0][k])/(profile[1][0]-profile[0][0])
                    if index==len(profile)-1:return (profile[-1][k]-profile[-2][k])/(profile[-1][0]-profile[-2][0])
                    p,q,r=profile[index-1:index+2];dl=(q[k]-p[k])/(q[0]-p[0]);dr=(r[k]-q[k])/(r[0]-q[0]);return 2*dl*dr/(dl+dr) if dl*dr>0 else 0
                out.append((2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*slope(j)+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*slope(j+1))
            return out
    return profile[0][1:] if y<profile[0][0] else profile[-1][1:]
roof_profile=[(-.68,.598,.419),(-.51,.637,.467),(-.28,.657,.490),(.02,.656,.490),(.25,.637,.465),(.42,.607,.413)]
def roof_edge(y,side):
    w,z=car_interp(roof_profile,y);return Vector((side*w,y,z))
def roof_point(y,u):
    w,z=car_interp(roof_profile,y);return Vector((u*w,y,z+.022*(1-u*u)))
verts=[]
ry=sorted(set([-.68+i*1.10/64 for i in range(65)]+[-.51,-.28,.02,.25,.42]))
for y in ry:
    for i in range(33):verts.append(roof_point(y,i/16-1))
faces=[(j*33+i,j*33+i+1,(j+1)*33+i+1,(j+1)*33+i) for j in range(len(ry)-1) for i in range(32)]
roof_skin=smooth(mesh('fitted compound roof sheet',verts,faces,paint))
mod=roof_skin.modifiers.new('inward roof skin','SOLIDIFY');mod.thickness=.022
bpy.context.view_layer.objects.active=roof_skin;bpy.ops.object.modifier_apply(modifier=mod.name)

def patch(name,left,right,mat,reverse=False,rows=32,columns=6,bulge=0):
    verts=[]
    for j in range(rows+1):
        t=j/rows;a=Vector(left(t));b=Vector(right(t))
        for i in range(columns+1):
            u=i/columns;p=a.lerp(b,u)
            p.x+= (1 if p.x>0 else -1)*bulge*math.sin(u*math.pi)*math.sin(t*math.pi)
            verts.append(p)
    fs=[]
    for j in range(rows):
        for i in range(columns):
            q=j*(columns+1)+i;f=(q,q+1,q+columns+2,q+columns+1);fs.append(tuple(reversed(f)) if reverse else f)
    return smooth(mesh(name,verts,fs,mat))

def glazing(name,bottom_y,bottom_z,bottom_w,top_y,front):
    def point(t,u):
        base=Vector((u*bottom_w,bottom_y+(.032 if front else -.020)*(1-u*u),bottom_z+.014*(1-u*u)))
        top=roof_point(top_y,u);p=base.lerp(top,t)
        p.y+=(.012 if front else -.010)*math.sin(t*math.pi)*(1-u*u)
        return p
    # Frit is assigned to boundary polygons in the same surface, never a
    # coplanar overlay. This removes a source of glass-edge depth fighting.
    cols=64;rows=40
    verts=[point(j/rows,i/cols*2-1) for j in range(rows+1) for i in range(cols+1)]
    fs=[(j*(cols+1)+i,j*(cols+1)+i+1,(j+1)*(cols+1)+i+1,(j+1)*(cols+1)+i) for j in range(rows) for i in range(cols)]
    pane=smooth(mesh(name,verts,[tuple(reversed(f)) for f in fs] if front else fs,glass))
    pane.data.materials.append(dark)
    for j in range(rows):
        for i in range(cols):
            if j in [0,rows-1] or i in [0,cols-1]:pane.data.polygons[j*cols+i].material_index=1
    return point
front_glass=glazing('fitted windshield',.91,-.105,.78,.42,True)
rear_glass=glazing('fitted rear glass',-1.17,-.105,.79,-.68,False)
for side in [-1,1]:
    def side_top(t):
        p=roof_edge(-.57+.87*t,side);p.x-=side*.006;p.z-=.035;return p
    def side_bottom(t):return Vector((side*(.790+.010*t),-1.01+1.80*t,-.065-.010*t))
    # Single convex side pane ends at the exact stamped pillar edges.
    patch('fitted side glazing',side_bottom,side_top,glass,reverse=side<0,rows=40,columns=8,bulge=.005)
    patch('stamped roof side rail',side_top,lambda t:roof_edge(-.57+.87*t,side),paint,reverse=side<0,rows=40,columns=3)
    # A/C pillars are broad curved sheet patches sharing the glass boundary.
    patch('continuous A pillar',lambda t:front_glass(t,side),lambda t:side_bottom(1).lerp(side_top(1),t),paint,reverse=side>0,rows=24,columns=8,bulge=.003)
    patch('continuous C pillar',lambda t:side_bottom(0).lerp(side_top(0),t),lambda t:rear_glass(t,side),paint,reverse=side>0,rows=24,columns=10,bulge=.007)
    # Close each rail's corner to the roof edge, a missing surface previously.
    patch('A pillar roof corner',lambda t:side_top(1).lerp(front_glass(1,side),t),lambda t:roof_edge(.30+.12*t,side),paint,reverse=side<0,rows=10,columns=3)
    patch('C pillar roof corner',lambda t:rear_glass(1,side).lerp(side_top(0),t),lambda t:roof_edge(-.68+.11*t,side),paint,reverse=side<0,rows=10,columns=3)
    # A flat 8mm sill seal gives a clean termination at the door belt.
    patch('flat side sill seal',side_bottom,lambda t:side_bottom(t)+Vector((side*.001,0,.008)),dark,reverse=side<0,rows=40,columns=1)
    # Shallow formed quarter divider, kept within the pane and painted body.
    q=.23
    patch('flat quarter divider',lambda t:side_bottom(q-.006).lerp(side_top(q-.006),t),lambda t:side_bottom(q+.006).lerp(side_top(q+.006),t),paint,reverse=side<0,rows=24,columns=1)
    # Existing mirror bounds are intentionally preserved.
    ring_mesh('mirror shell',[((side*x,y,z),w,d) for x,y,z,w,d in
       [(.81,.57,.04,.045,.023),(.99,.55,.068,.13,.061),(1.045,.44,.07,.11,.055)]],paint,'y',16)
    rounded_panel('mirror reflection',[(side*.95,.418,.027),(side*1.15,.418,.04),(side*1.14,.421,.106),(side*.95,.427,.115)],chrome,.004,.01)
# Wipers lie flush to the exact lower glazing surface.
for center in [-.38,.25]:
    points=[]
    for i in range(9):
        p=front_glass(.065,center-.19+i*.38/8);p.y+=.004;points.append(p)
    formed_pillar('flat wiper blade',points,.010,.007,dark)

# Finished cabin and two generous seat openings. Mesh origin conventions are
# unchanged, including the invariant floor and ceiling inspection anchors.
box('cabin floor',(0,-.05,-.835),(1.57,2.08,.035),dark,.02)
box('center tunnel',(0,-.07,-.64),(.22,1.43,.27),leather,.055)
for x,role in [(-.42,'driver'),(.42,'passenger')]:
    box('seat cushion',(x,-.12,-.64),(.53,.58,.13),leather,.075)
    for dx in [-.235,.235]:
        ring_mesh('seat bolsters',[((x+dx,y,-.585),w,d) for y,w,d in [(-.41,.037,.05),(-.32,.058,.075),(.13,.057,.055),(.20,.025,.025)]],leather,'y',12)
    back=box('seat back',(x,-.45,-.265),(.50,.15,.58),leather,.07);back.rotation_euler.x=-.11
    box('headrest',(x,-.474,.055),(.28,.12,.19),leather,.065)
    for sx in [-.16,.16]:
        tube('seat stitching',[(x+sx,.10,-.566),(x+sx,-.32,-.566),(x+sx,-.375,-.45),(x+sx,-.385,-.025)],.003,stitch,5)
    empty('seat_'+role,(x,-.12,-.45))
empty('cabin_ceiling',(0,0,.45));empty('cabin_floor',(0,0,-.85))
ring_mesh('sculpted dash',[((0,y,z),w,d) for y,z,w,d in [(.40,-.13,.74,.09),(.59,-.085,.78,.11),(.78,-.12,.75,.045)]],leather,'y',24)
box('dashboard center stack',(0,.405,-.23),(.28,.12,.26),dark,.025)
box('radio',(0,.338,-.16),(.18,.012,.044),brake,.006)
for x in [-.10,.10]:sphere('radio knob',(x,.329,-.20),(.018,.011,.018),interior_metal,10,6)
box('gauge binnacle',(-.42,.40,-.035),(.37,.25,.18),dark,.055)
for x in [-.505,-.335]:
    cyl('instrument ring',(x,.274,-.025),(x,.265,-.025),.063,interior_metal,18)
    cyl('instrument black',(x,.263,-.025),(x,.26,-.025),.056,dark,18)
    tube('gauge needle',[(x,.255,-.025),(x-.022,.255,.007)],.0025,white,4)
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,major_radius=.166,minor_radius=.018,location=(-.42,.20,-.045),rotation=(math.pi/2.2,0,0))
steering=add(bpy.context.object,'leather steering wheel',leather);smooth(steering)
for dx,dz in [(-.14,0),(.14,0),(0,-.14)]:
    tube('steering spoke',[(-.42,.20,-.045),(-.42+dx,.20,-.045+dz)],.012,interior_metal,8)
sphere('steering center',(-.42,.185,-.045),(.056,.025,.055),leather,16,8)
cyl('gear stick',(.0,-.05,-.48),(.0,-.05,-.33),.012,interior_metal,10)
sphere('gear knob',(0,-.05,-.32),(.032,.035,.025),dark,12,8)

# Each wheel is a single multi-material mesh with its local Y aligned with the
# axle (the browser's established rotateY animation contract). All rim details
# therefore rotate as one object; the suspension/brake caliper stays still.
for sign in [-1,1]:
    for yi,y in enumerate([-1.38,1.38]):
        x=sign*.876; center=Vector((x,y,-.59));wheelparts=[]
        def wheel_part(o):wheelparts.append(o);return o
        # Tire tread profile in radial rings, with rounded shoulder sidewalls.
        verts=[];faces=[];segments=64
        profile=[(-.145,.275),(-.137,.352),(-.109,.393),(-.070,.407),(.070,.407),(.109,.393),(.137,.352),(.145,.275)]
        for ax,r in profile:
            for i in range(segments):
                a=i*math.tau/segments;verts.append((x+ax,y+math.cos(a)*r,-.59+math.sin(a)*r))
        for j in range(len(profile)-1):
            for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
        wheel_part(smooth(mesh('tire carcass',verts,faces,tire_rubber)))
        for off in [-.047,.047]:
            pts=[(x+off,y+math.cos(i*math.tau/64)*.408,-.59+math.sin(i*math.tau/64)*.408) for i in range(64)]
            wheel_part(tube('tread groove',pts,.0045,sole,5,True))
        exterior=x+sign*.148
        # Rim dish and machined lips.
        for r,rr,mat in [(.284,.008,alloy),(.263,.006,alloy),(.090,.006,alloy)]:
            pts=[(exterior,y+math.cos(i*math.tau/48)*r,-.59+math.sin(i*math.tau/48)*r) for i in range(48)]
            wheel_part(tube('rim lip',pts,rr,mat,8,True))
        wheel_part(cyl('brake disk',(x+sign*.088,y,-.59),(x+sign*.098,y,-.59),.228,brake,48))
        wheel_part(cyl('hub cap',(exterior-sign*.01,y,-.59),(exterior+sign*.017,y,-.59),.066,alloy,24))
        # A dark inset barrel and six sculpted, flat forged spokes read as
        # automotive rims. Cylinder spokes previously resembled thin wire wheels.
        for r in [.298,.347,.382]:
            sidewall=[(exterior-sign*.007,y+math.cos(i*math.tau/64)*r,-.59+math.sin(i*math.tau/64)*r) for i in range(64)]
            wheel_part(tube('molded tire sidewall',sidewall,.0025,tire_rubber,6,True))
        barrel_vertices=[]
        for ax,r in [(exterior-sign*.11,.263),(exterior-sign*.006,.263)]:
            for i in range(48):
                a=i*math.tau/48;barrel_vertices.append((ax,y+math.cos(a)*r,-.59+math.sin(a)*r))
        wheel_part(smooth(mesh('recessed rim barrel',barrel_vertices,
          [(i,(i+1)%48,(i+1)%48+48,i+48) for i in range(48)],brake)))
        for i in range(6):
            a=i*math.tau/6;radial=Vector((0,math.cos(a),math.sin(a)));tangent=Vector((0,-math.sin(a),math.cos(a)))
            points=[]
            for radius,width,depth in [(.059,.028,0),(.135,.029,.004),(.230,.021,-.018),(.263,.021,-.024)]:
                spoke_center=Vector((exterior+sign*depth,y,-.59))+radial*radius
                points.extend([spoke_center-tangent*width,spoke_center+tangent*width])
            spoke_faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(3)]
            spoke=mesh('sculpted forged spoke',points,spoke_faces if sign<0 else [tuple(reversed(f)) for f in spoke_faces],alloy)
            mod=spoke.modifiers.new('forged spoke depth','SOLIDIFY');mod.thickness=.015
            bpy.context.view_layer.objects.active=spoke;bpy.ops.object.modifier_apply(modifier=mod.name)
            mod=spoke.modifiers.new('machined rim edges','BEVEL');mod.width=.003;mod.segments=2
            bpy.ops.object.modifier_apply(modifier=mod.name);wheel_part(spoke)
        for i in range(5):
            a=i*math.tau/5
            wheel_part(sphere('lug nut',(exterior+sign*.013,y+math.cos(a)*.048,-.59+math.sin(a)*.048),(.008,.008,.008),interior_metal,8,6))
        for i in range(16):
            a=i*math.tau/16
            wheel_part(sphere('drilled brake mark',(x+sign*.100,y+math.cos(a)*.185,-.59+math.sin(a)*.185),(.001,.008,.008),dark,6,4))
        bpy.ops.object.select_all(action='DESELECT')
        for o in wheelparts:o.select_set(True)
        bpy.context.view_layer.objects.active=wheelparts[0];bpy.ops.object.join();wheel=wheelparts[0]
        wheel.name=f'wheel_{"left" if sign<0 else "right"}_{yi}'
        # Bake world coordinates into a pivot with local Y=world X.
        for vert in wheel.data.vertices:vert.co=wheel.matrix_world@vert.co
        wheel.matrix_world.identity()
        for vert in wheel.data.vertices:
            p=vert.co-center;vert.co=(-p.y,p.x,p.z)
        wheel.location=center;wheel.rotation_euler.z=-math.pi/2
        box('stationary brake caliper',(x+sign*.103,y-.18,-.59),(.058,.075,.19),paint,.022)
# Export retains wheel object pivots; other primitives become shared materials.
for o in bpy.context.scene.objects: hero_uv(o)
export('coupe',True)

# Reuse the base rig and animation actions, replacing the visible mesh wholesale.
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'neighbor.blend'))
rig=bpy.data.objects.get('NeighborRig')
assert rig is not None
for o in list(bpy.context.scene.objects):
    if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
# Loading a blend invalidates former material references. Recover by exact name.
materials={m.name:m for m in bpy.data.materials}
skin=materials['skin'];shirt=materials['outfit'];denim=materials['denim'];hair=materials['hair'];white=materials['ivory'];chrome=materials['chrome'];dark=materials['rubber']
sole=material('shoe-sole',(.135,.14,.13),.92)
stitch=material('clothing-stitch',(.095,.11,.093),.96)
lip=material('lip',(.26,.12,.082),.82)
eyebrown=material('iris',(.085,.052,.028),.6)
parts=[]

def part(o,bone):
    parts.append((o,bone));return o


def smooth_section(profile,z):
    def tangent(index,k):
        if index==0:return (profile[1][k]-profile[0][k])/(profile[1][0]-profile[0][0])
        if index==len(profile)-1:return (profile[-1][k]-profile[-2][k])/(profile[-1][0]-profile[-2][0])
        a,b,c=profile[index-1:index+2]
        dl=(b[k]-a[k])/(b[0]-a[0]);dr=(c[k]-b[k])/(c[0]-b[0])
        return 2*dl*dr/(dl+dr) if dl*dr>0 else 0
    for j,(a,b) in enumerate(zip(profile,profile[1:])):
        if a[0]<=z<=b[0]:
            h=b[0]-a[0];t=(z-a[0])/h
            return tuple((2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*tangent(j,k)+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*tangent(j+1,k) for k in range(1,len(a)))
    return profile[-1][1:]

def cloth_uv(o,kind='torso',center_x=0):
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for polygon in o.data.polygons:
        center=polygon.center
        sleeve=kind=='torso' and abs(center.x)>.245 and center.z>1.01
        cx=(.245+.085*max(0,min(1,(1.40-center.z)/.26)))*(1 if center.x>0 else -1) if sleeve else center_x
        circumference=.46 if sleeve else .56 if kind=='leg' else 1.10
        angles=[]
        for loop in polygon.loop_indices:
            p=o.data.vertices[o.data.loops[loop].vertex_index].co
            angles.append(math.atan2(p.y+.006,p.x-cx))
        seam=max(angles)-min(angles)>math.pi
        for loop,angle in zip(polygon.loop_indices,angles):
            p=o.data.vertices[o.data.loops[loop].vertex_index].co
            if seam and angle<0:angle+=math.tau
            uv.data[loop].uv=(angle/math.tau*circumference*6,p.z*6)

# Torso folds deliberately interrupt the regular circular loft. The fitted
# white tee is framed by an open overshirt instead of a toy-like solid trunk.
torso=[]
torso_profile=[(.805,.239,.160,.0),(.842,.244,.167,-.010),(.887,.238,.169,-.007),
 (.945,.221,.170,-.007),(1.02,.219,.166,-.006),(1.10,.211,.147,-.005),
 (1.18,.217,.152,-.007),(1.28,.223,.147,-.006),(1.37,.227,.138,-.004),
 (1.421,.218,.132,-.005),(1.46,.145,.092,-.006),(1.495,.078,.075,-.005)]
# Dense continuous longitudinal sampling allows actual cloth folds rather than
# striped color on smooth cylinders. Rear hem drops slightly below the front.
for j in range(len(torso_profile)-1):
    a,b=torso_profile[j:j+2]
    for k in range(4):
        t=k/4;z=a[0]*(1-t)+b[0]*t;w,d,cy=smooth_section(torso_profile,z)
        torso.append(((0,cy,z),w,d))
a=torso_profile[-1];torso.append(((0,a[3],a[0]),a[1],a[2]))
body=part(ring_mesh('tailored overshirt',torso,shirt,sides=56),'spine')
# Creases are sculpted into the surface rather than painted striped ribbons.
for v in body.data.vertices:
    angle=math.atan2(v.co.y,v.co.x)
    if v.co.z<1.39:
        back=max(0,-math.sin(angle))**2;fold=0
        # Individual tension folds terminate naturally; no periodic whole-body
        # sine rings or regular longitudinal columns remain in the surface.
        for px,pz,slope,amplitude,length,radius in [(-.095,1.265,.45,.008,.10,.012),(.11,1.222,-.38,.007,.095,.014),(-.13,1.005,.30,.009,.080,.013),(.060,.947,-.20,.008,.115,.016),(.155,.895,.35,.007,.065,.012)]:
            line=pz+slope*(v.co.x-px);along=math.exp(-((v.co.x-px)/length)**2)
            ridge=math.exp(-((v.co.z-line)/radius)**2)-.45*math.exp(-((v.co.z-line-.020)/(radius*1.5))**2)
            fold+=back*amplitude*along*ridge
        fold+=abs(math.cos(angle))*.004*math.exp(-((v.co.z-.98)/.08)**2)
        v.co.x*=1+fold/.22;v.co.y*=1+fold/.15
    if v.co.y<0:
        v.co.y-=.004*math.exp(-((v.co.z-1.335)/.012)**2)
    if v.co.z<.88:
        v.co.z-=.022*max(0,-math.sin(angle))
part(rounded_panel('cotton undershirt',[(-.074,.170,.96),(.074,.170,.96),(.094,.173,1.40),(.061,.137,1.463),(-.061,.137,1.463),(-.094,.173,1.40)],white,.006,.009),'spine')
for sign in [-1,1]:
    part(tube('shirt placket',[(sign*.073,.178,.98),(sign*.080,.181,1.20),(sign*.094,.180,1.38),(sign*.061,.143,1.465)],.008,shirt,8),'spine')
    part(rounded_panel('folded collar',[(sign*.073,.090,1.488),(sign*.148,.099,1.433),(sign*.105,.161,1.358),(sign*.079,.153,1.432)],shirt,.009,.006),'spine')
    part(tube('collar seam',[(sign*.145,.107,1.430),(sign*.104,.168,1.368),(sign*.080,.159,1.428)],.0017,stitch,5),'spine')
    part(rounded_panel('chest pocket',[(sign*.109,.147,1.214),(sign*.185,.127,1.220),(sign*.183,.134,1.302),(sign*.111,.155,1.300)],shirt,.005,.007),'spine')
    part(tube('pocket top seam',[(sign*.110,.159,1.297),(sign*.184,.138,1.299)],.0018,stitch,5),'spine')
for z in [1.00,1.10,1.20,1.30]:
    part(sphere('shirt button',(-.081,.187,z),(.004,.002,.004),dark,8,4),'spine')
# Neck is connected to jaw with a shaped trapezius transition.
part(ring_mesh('neck',[((0,-.008,1.445),.087,.079),((0,-.014,1.49),.071,.072),((0,-.006,1.528),.072,.073)],skin,sides=24),'head')
# Dense continuous anatomy carries the nose, orbital sockets, cheeks and
# muzzle in one surface. Independent flat facial props caused the toy look.
head_profile=[(1.582,.039,.046,.031),(1.608,.073,.073,.020),(1.649,.095,.101,.004),
 (1.702,.121,.116,-.002),(1.752,.126,.116,-.010),(1.790,.125,.113,-.017)]
def skull_section(z):
    if z>=1.790:
        t=max(0,min(.99999,(z-1.790)/.117));r=math.sqrt(1-t*t)
        return (.125*r,.113*r,-.017)
    return smooth_section(head_profile,z)
def face_relief(x,z):
    value=.013*math.exp(-(x/.016)**2-((z-1.736)/.050)**2)
    value+=.017*math.exp(-(x/.025)**2-((z-1.709)/.017)**2)
    value+=.005*math.exp(-(x/.044)**2-((z-1.664)/.023)**2)
    value+=.005*math.exp(-(x/.051)**2-((z-1.619)/.025)**2)
    for sign in [-1,1]:
        value-=.008*math.exp(-((x-sign*.048)/.029)**2-((z-1.756)/.016)**2)
        value+=.007*math.exp(-((x-sign*.047)/.032)**2-((z-1.783)/.011)**2)
        value+=.005*math.exp(-((x-sign*.078)/.030)**2-((z-1.709)/.032)**2)
    return value
def face_front(x,z):
    w,d,cy=skull_section(z);f=math.sqrt(max(0,1-(x/w)**2))
    return cy+d*f+face_relief(x,z)*f*f
head_rings=[]
for j in range(81):
    z=1.582+(1.903-1.582)*j/80;w,d,cy=skull_section(z)
    head_rings.append(((0,cy,z),w,d))
head=part(ring_mesh('continuous sculpted head',head_rings,skin,sides=96),'head')
for v in head.data.vertices:
    w,d,cy=skull_section(v.co.z);front=max(0,(v.co.y-cy)/d)
    v.co.y+=face_relief(v.co.x,v.co.z)*front*front
hair_vertices=[];hair_faces=[];hair_segments=96;hair_rows=40
for row in range(hair_rows+1):
    t=row/hair_rows
    for i in range(hair_segments):
        angle=i*math.tau/hair_segments
        hairline=1.794-.062*max(0,-math.sin(angle))-.014*abs(math.cos(angle))+.0008*math.sin(angle*17)+.0005*math.sin(angle*29+.7)
        z=hairline+(1.907-hairline)*t
        w,d,cy=skull_section(z)
        relief=.00035*math.sin(angle*31+z*417)*math.cos(angle*19-z*311)
        clearance=.0015+.001*min(1,t*10)+relief*.55*min(1,t*12)
        hair_vertices.append((math.cos(angle)*(w+clearance),cy+math.sin(angle)*(d+clearance),z))
for row in range(hair_rows):
    for i in range(hair_segments):
        hair_faces.append((row*hair_segments+i,row*hair_segments+(i+1)%hair_segments,
          (row+1)*hair_segments+(i+1)%hair_segments,(row+1)*hair_segments+i))
hair_faces.append(tuple(hair_rows*hair_segments+i for i in range(hair_segments)))
hair_fade=material('hair-fade',(.8,.8,.8),.99)
scalp=part(smooth(mesh('continuous cropped hair',hair_vertices,hair_faces,hair_fade)),'head')
color=scalp.data.color_attributes.new(name='HairColor',type='FLOAT_COLOR',domain='CORNER')
scalp.data.color_attributes.active_color=color
attr=hair_fade.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='HairColor'
hair_fade.node_tree.links.new(attr.outputs['Color'],hair_fade.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for poly in scalp.data.polygons:
    for loop in poly.loop_indices:
        vertex=scalp.data.loops[loop].vertex_index;row=vertex//hair_segments
        fade=max(0,1-row/4.5)
        noise=.88+.12*math.sin(vertex*2.399)
        c=Vector((.032,.024,.017))*(1-fade)+Vector((.25,.14,.084))*fade
        color.data[loop].color=(*[v*noise for v in c],1)

for sign in [-1,1]:
    ear_points=[((sign*.124,.000,1.677),.010,.013),((sign*.133,-.004,1.691),.015,.023),
      ((sign*.134,-.008,1.719),.015,.030),((sign*.130,-.010,1.745),.011,.025),((sign*.123,-.006,1.756),.006,.013)]
    part(ring_mesh('anatomical ear',ear_points,skin,sides=20),'head')
    part(tube('ear helix',[(sign*.143,.009,1.690),(sign*.146,-.022,1.703),(sign*.143,-.033,1.73),(sign*.132,-.019,1.749)],.003,skin,8),'head')
    part(sphere('ear concha',(sign*.146,-.003,1.716),(.003,.015,.018),lip,12,8),'head')
    # Surface-fitted almond eyes: no protruding ellipsoid whites. The orbital
    # depression and upper lid shape are carried by continuous facial anatomy.
    ex=sign*.048;ez=1.756
    points=[]
    for j in range(33):
        t=-1+j/16;x=ex+t*.018
        half=.0048*max(0,1-t*t)**.70
        for z in [ez-half,ez+half]:points.append((x,face_front(x,z)+.0011,z))
    part(mesh('recessed almond eye',points,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(32)],white),'head')
    # Tiny iris lenses stand one millimetre proud of the eye surface so
    # separate triangulations cannot produce speckled interpenetration.
    ey=face_front(ex,ez)
    part(sphere('iris',(ex,ey+.0018,ez),(.0043,.0013,.0043),eyebrown,24,16),'head')
    part(sphere('pupil',(ex,ey+.0030,ez),(.0020,.00045,.0020),hair,20,12),'head')
    # Dense fitted ribbons follow the actual brow surface instead of broad
    # chords cutting through forehead geometry and producing broken marks.
    brow_points=[]
    for j in range(25):
        t=j/24;bx=sign*(.075-.049*t);bz=1.775+.006*math.sin(t*math.pi)-.001*t
        bw=.0004+.0016*math.sin(t*math.pi)**.6
        for dz in [-bw,bw]:brow_points.append((bx,face_front(bx,bz+dz)+.0016,bz+dz))
    part(mesh('attached eyebrow',brow_points,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(24)],hair),'head')
    nx=sign*.014;nz=1.706
    part(sphere('nostril',(nx,face_front(nx,nz)+.0003,nz),(.004,.0017,.002),lip,12,8),'head')
# Restrained mouth ribbons sit directly on the muzzle surface.
for name,z,width,mat in [('upper lip',1.669,.002,lip),('lower lip',1.661,.0028,skin)]:
    verts=[]
    for i in range(9):
        x=-.026+i*.0065;dz=width*max(0,1-(x/.026)**2)
        for zz in [z-dz,z+dz]:verts.append((x,face_front(x,zz)+.0007,zz))
    part(mesh(name,verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(8)],mat),'head')
points=[(x,face_front(x,1.665)+.001,1.665) for x in [-.024,-.012,0,.012,.024]]
part(tube('mouth crease',points,.0008,lip,6),'head')
# Short beard is a close facial strip, retaining an anatomical chin silhouette.
part(ring_mesh('close beard',[((0,.020,1.602),.054,.057),((0,.013,1.619),.074,.076),((0,.006,1.642),.088,.088)],hair,sides=32,caps=False),'head')

part(ring_mesh('jean pelvis',[((0,-.010,.815),.186,.125),((0,-.012,.91),.205,.143),((0,-.005,.966),.190,.132)],denim,sides=32),'hips')
part(tube('waistband',[(math.cos(i*math.tau/40)*.194,math.sin(i*math.tau/40)*.134,.948) for i in range(40)],.015,denim,8,True),'hips')
part(box('belt buckle',(0,.141,.946),(.040,.013,.033),chrome,.004),'hips')
for sign,side in [(-1,'L'),(1,'R')]:
    x=sign*.15;ax=sign*.245
    leg_profile=[(.118,x,.018,.074,.068),(.16,x,.012,.079,.074),(.245,x,-.003,.078,.082),
      (.36,x,-.018,.083,.087),(.455,x,.013,.094,.097),(.49,x,.018,.100,.103),
      (.59,x,-.003,.106,.109),(.735,x*.92,-.004,.104,.104),(.87,x*.84,-.002,.100,.099)]
    leg_rings=[]
    for j in range(len(leg_profile)-1):
        a,b=leg_profile[j:j+2]
        for k in range(7):
            t=k/7;z,cx,cy,w,d=[a[n]*(1-t)+b[n]*t for n in range(5)]
            leg_rings.append(((cx,cy,z),w,d))
    a=leg_profile[-1];leg_rings.append(((a[1],a[2],a[0]),a[3],a[4]))
    leg=ring_mesh('shaped denim leg',leg_rings,denim,sides=36)
    for v in leg.data.vertices:
        angle=math.atan2(v.co.y,v.co.x-x);front=max(0,math.sin(angle));back=max(0,-math.sin(angle))
        fold=.006*front*math.exp(-((v.co.z-(.49+sign*.19*(v.co.x-x)))/.017)**2)
        fold-=.004*front*math.exp(-((v.co.z-(.458-sign*.12*(v.co.x-x)))/.013)**2)
        fold+=.005*back*math.sin(v.co.z*111+angle)*math.exp(-((v.co.z-.445)/.048)**2)
        fold+=.004*math.sin(v.co.z*122+angle*2)*math.exp(-((v.co.z-.17)/.050)**2)
        v.co.x+=(v.co.x-x)*fold/.09;v.co.y+=math.sin(angle)*fold
    cloth_uv(leg,'leg',x)
    parts.append((leg,f'thigh{side}'))
    # Long side seam and restrained hem folds retain the relaxed jean silhouette.
    part(tube('denim outer seam',[(x+sign*.076,.013,.15),(x+sign*.083,-.010,.35),(x+sign*.096,.011,.48),(x+sign*.114,-.010,.83)],.0021,stitch,5),f'thigh{side}')
    part(tube('jean cuff',[(x+math.cos(i*math.tau/24)*.077,.014+math.sin(i*math.tau/24)*.071,.14) for i in range(24)],.008,denim,8,True),f'shin{side}')
    # Leather sneaker upper and layered outsole, sculpted along its length.
    for name,z,mat,scale in [('outsole',.041,sole,1),('midsole',.064,white,.99),('leather upper',.10,white,.94)]:
        shoe=ring_mesh(name,[((x,y,z+rise),w*scale,d) for y,w,d,rise in
             [(-.125,.048,.022,0),(-.095,.085,.027,.005),(-.005,.092,.027,.009),(.09,.10,.025,0),(.195,.083,.020,-.006),(.23,.025,.013,-.011)]],mat,'y',24)
        part(shoe,f'shin{side}')
    part(ring_mesh('shoe tongue',[((x,y,z),w,d) for y,z,w,d in [(-.054,.157,.057,.012),(.015,.160,.058,.013),(.080,.136,.061,.012)]],white,'y',16),f'shin{side}')
    for y,z in [(-.015,.173),(.018,.165),(.052,.150)]:
        part(tube('cotton shoe lace',[(x-.052,y,z-.003),(x,y+.015,z+.008),(x+.052,y,z-.003)],.004,white,6),f'shin{side}')
    for sx in [-1,1]:
        part(tube('shoe side seam',[(x+sx*.079,-.06,.11),(x+sx*.094,.04,.115),(x+sx*.085,.14,.101)],.002,stitch,5),f'shin{side}')
    # Relaxed full shirt sleeve, rolled back just above the wrist. Curved
    # centers and a distributed elbow blend preserve drape while walking/sitting.
    sleeve_profile=[(.965,.075,.055,.060),(.990,.067,.068,.071),
      (1.025,.050,.073,.077),(1.060,.030,.071,.079),(1.095,.012,.078,.088),
      (1.125,-.005,.081,.093),(1.17,-.012,.086,.092),(1.235,-.010,.088,.098),
      (1.31,-.008,.090,.099),(1.375,-.004,.087,.097),
      (1.420,0,.076,.084),(1.449,0,.046,.057),(1.457,0,.015,.025)]
    sleeve_rings=[]
    for j in range(len(sleeve_profile)-1):
        a,b=sleeve_profile[j:j+2]
        for k in range(4):
            t=k/4;z,cy,w,d=[a[n]*(1-t)+b[n]*t for n in range(4)]
            cx=ax+sign*.085*max(0,min(1,(1.40-z)/.26))-sign*max(0,z-1.38)*.65
            taper=1-.15*max(0,min(1,(z-1.06)/.20))
            sleeve_rings.append(((cx,cy,z),w*taper,d*taper))
    arm=part(ring_mesh('relaxed long sleeve',sleeve_rings,shirt,sides=36),f'arm{side}')
    for v in arm.data.vertices:
        z=v.co.z;cx=ax+sign*.085*max(0,min(1,(1.40-z)/.26));a=math.atan2(v.co.y+.005,v.co.x-cx)
        fold=.0045*math.sin(z*87+a*2.6)*math.exp(-((z-1.085)/.12)**2)
        v.co.x+=(v.co.x-cx)*fold/.085;v.co.y+=math.sin(a)*fold
    ax+=sign*.085
    part(ring_mesh('rolled cotton cuff',[((ax,.076,.955),.055,.060),((ax,.069,.976),.067,.071),((ax,.061,.999),.068,.071)],shirt,sides=32),f'forearm{side}')
    part(tube('cuff folded edge',[(ax+math.cos(i*math.tau/32)*.067,.070+math.sin(i*math.tau/32)*.071,.974) for i in range(32)],.004,shirt,7,True),f'forearm{side}')
    part(ring_mesh('anatomical forearm',[((ax,.083,.837),.035,.032),((ax,.081,.883),.041,.038),((ax,.075,.93),.048,.043),((ax,.068,.986),.053,.052)],skin,sides=24),f'forearm{side}')
    part(ring_mesh('palm',[((ax,.102,.756),.036,.027),((ax,.093,.782),.042,.030),((ax,.084,.822),.040,.032),((ax,.083,.856),.034,.031)],skin,sides=20),f'forearm{side}')
    for finger in range(4):
        fx=ax+(finger-1.5)*.023
        length=[.070,.088,.083,.064][finger]
        # Knuckle, middle joint and curled distal pad are one continuous digit.
        finger_rings=[((fx,.146,.775-length),.0055,.007),((fx,.149,.792-length),.007,.009),
          ((fx,.131,.782-length*.60),.008,.0095),((fx,.114,.766-length*.24),.008,.010),((fx,.102,.765),.008,.011)]
        part(ring_mesh('articulated finger',finger_rings,skin,sides=12),f'forearm{side}')
    part(ring_mesh('thumb saddle',[((ax-sign*.063,.141,.769),.008,.011),((ax-sign*.065,.12,.784),.011,.014),
      ((ax-sign*.052,.101,.804),.015,.019),((ax-sign*.029,.091,.822),.020,.024)],skin,sides=16),f'forearm{side}')

# Back yoke and hem are sculpted into the unified shirt surface above.
# Avoid detached seam tubes that intersect cloth folds and sparkle at distance.
for sign in [-1,1]:
    part(rounded_panel('denim rear pocket',[(sign*.071,-.122,.793),(sign*.214,-.113,.793),(sign*.207,-.118,.675),(sign*.136,-.131,.650),(sign*.076,-.137,.679)],denim,.006,.009),f'thigh{"L" if sign<0 else "R"}')
    part(tube('pocket double seam',[(sign*.080,-.141,.78),(sign*.204,-.122,.781),(sign*.198,-.13,.687),(sign*.136,-.143,.665),(sign*.084,-.147,.689),(sign*.080,-.141,.78)],.0023,stitch,5),f'thigh{"L" if sign<0 else "R"}')

# A voxel union makes the shoulders and armholes genuinely continuous, rather
# than hiding separate capsule shoulders under seams. Preserve the cleanly
# modeled cuffs/details and the inner shirt as separate surfaces.
main_names={'tailored overshirt','relaxed long sleeve','relaxed long sleeve.001'}
main_parts=[o for o,b in parts if o.name in main_names]
parts=[(o,b) for o,b in parts if o.name not in main_names]
bpy.ops.object.select_all(action='DESELECT')
for o in main_parts:o.select_set(True)
bpy.context.view_layer.objects.active=main_parts[0];bpy.ops.object.join()
garment=main_parts[0];garment.name='continuous overshirt'
remesh=garment.modifiers.new('unified cloth shoulders','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.0045
bpy.ops.object.modifier_apply(modifier=remesh.name)
soften=garment.modifiers.new('relaxed cotton surface','SMOOTH');soften.factor=.30;soften.iterations=2
bpy.ops.object.modifier_apply(modifier=soften.name)
decimate=garment.modifiers.new('cloth topology budget','DECIMATE');decimate.ratio=.40
bpy.ops.object.modifier_apply(modifier=decimate.name)
smooth(garment);cloth_uv(garment);parts.append((garment,'spine'))

# Bind lofted limbs with soft knee/hip transitions, preserving authored actions.
for o,bone in parts:
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    if bone=='head' and o.name!='neck':
        for v in o.data.vertices:
            v.co.z-=.0815
            v.co.x*=.84
    if not o.data.color_attributes.get('HairColor'):
        neutral=o.data.color_attributes.new(name='HairColor',type='FLOAT_COLOR',domain='CORNER')
        for item in neutral.data:item.color=(1,1,1,1)
    g=o.vertex_groups.new(name=bone)
    g.add(list(range(len(o.data.vertices))),1,'REPLACE')
    if o.name.startswith('shaped denim leg') or o.name.startswith('denim outer seam'):
        side=bone[-1];shin=o.vertex_groups.new(name=f'shin{side}')
        for v in o.data.vertices:
            t=max(0,min(1,(v.co.z-.41)/.15))
            g.add([v.index],t,'REPLACE');shin.add([v.index],1-t,'REPLACE')
    if o.name=='continuous overshirt':
        for name in ['armL','armR','forearmL','forearmR']:o.vertex_groups.new(name=name)
        for v in o.data.vertices:
            side='L' if v.co.x<0 else 'R'
            shoulder=max(0,min(1,(abs(v.co.x)-.16)/.08))
            if v.co.z<1.25:shoulder=max(0,min(1,(abs(v.co.x)-.235)/.055))
            elbow=max(0,min(1,(1.19-v.co.z)/.14))
            g.add([v.index],1-shoulder,'REPLACE')
            o.vertex_groups['arm'+side].add([v.index],shoulder*(1-elbow),'REPLACE')
            o.vertex_groups['forearm'+side].add([v.index],shoulder*elbow,'REPLACE')
    modifier=o.modifiers.new('skin','ARMATURE');modifier.object=rig;o.parent=rig
bpy.ops.object.select_all(action='DESELECT')
for o,b in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0][0];bpy.ops.object.join();parts[0][0].name='Neighbor'
# Mild torso counter-rotation and foot clearance improve the existing walk.
# Seated upper arms tuck naturally into the existing cabin envelope; foot/hip
# transforms and all seat anchors remain unchanged.
for action in bpy.data.actions:
    if action.name=='walk':
        rig.animation_data.action=action
        for frame in range(1,32,5):
            phase=(frame-1)/30*math.tau
            rig.pose.bones['spine'].rotation_euler.z=.035*math.sin(phase)
            rig.pose.bones['spine'].keyframe_insert('rotation_euler',frame=frame)
            rig.pose.bones['hips'].location.z=.018*(1-math.cos(phase*2))
            rig.pose.bones['hips'].keyframe_insert('location',frame=frame)
    if action.name=='seated':
        from mathutils import Euler, Quaternion
        rig.animation_data.action=action
        for frame in range(1,62,5):
            for side,sign in [('L',-1),('R',1)]:
                bone=rig.pose.bones['arm'+side]
                forward=Euler((.55,0,0),'XYZ').to_quaternion()
                tuck=Quaternion((0,0,1),sign*.18)
                bone.rotation_euler=(forward@tuck).to_euler('XYZ')
                bone.keyframe_insert('rotation_euler',frame=frame)
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
for o in bpy.context.scene.objects: hero_uv(o)
export('neighbor',False)
print('Detailed original coupe and neighbor exported')
