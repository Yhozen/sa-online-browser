# SPDX-License-Identifier: GPL-3.0-or-later
"""Original hero meshes, executed after the base kit by build.py.

All coordinates are authored in meters, Z up, +Y forward. The coupe shares the
fixture footprint and the character deliberately retains the base skeleton and
its exported animation names. No externally sourced mesh data is used.
"""

# Deliberately reuse the base script's materials; no duplicate outfit/glass names.
paint = material('paint', (.018, .105, .13), .23, .68)
paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .65
paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value = .16
leather = material('leather', (.055, .063, .061), .78)
stitch = material('stitch', (.37, .36, .30), .92)
alloy = material('alloy', (.42, .46, .47), .22, .88)
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
# Central body has 45 cross sections. Shoulder crease and lower sill surfaces
# are modeled independently so tires occupy actual openings rather than
# intersecting a cuboid chassis.
profiles = [
    (-2.20, .67, -.38), (-2.12, .82, -.27), (-1.92, .91, -.21),
    (-1.58, .94, -.16), (-1.28, .92, -.13), (-.90, .89, -.12),
    (-.25, .89, -.14), (.45, .89, -.16), (.95, .92, -.19),
    (1.38, .94, -.22), (1.78, .90, -.26), (2.04, .83, -.34),
    (2.20, .67, -.43),
]


def body_profile(y):
    for a, b in zip(profiles, profiles[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return (a[1] * (1-t) + b[1] * t, a[2] * (1-t) + b[2] * t)
    return profiles[-1][1:]


def arch_bottom(y):
    for wy in [-1.38, 1.38]:
        dy = abs(y-wy)
        if dy < .465:
            return -.59 + math.sqrt(.465**2 - dy**2)
    return -.74


ys = sorted(set([round(-2.2 + i * .05, 4) for i in range(89)] +
                [round(wy + math.cos(i * math.pi / 32) * .465, 4)
                 for wy in [-1.38, 1.38] for i in range(33)]))
for sign in [-1, 1]:
    verts = []; faces = []
    for y in ys:
        width, top = body_profile(y); low = arch_bottom(y)
        # The wheel lip rises above the shoulder very near the tire's apex.
        shoulder = max(top, low + .045)
        verts += [(sign * (width-.095), y, shoulder+.045),
                  (sign * width, y, shoulder),
                  (sign * (width+.006), y, shoulder*.35+low*.65),
                  (sign * (width-.025), y, low)]
    for j in range(len(ys)-1):
        for k in range(3):
            ids = (j*4+k, j*4+k+1, (j+1)*4+k+1, (j+1)*4+k)
            faces.append(ids if sign > 0 else tuple(reversed(ids)))
    shell = smooth(mesh('sculpted quarter and door', verts, faces, paint))
    for wy in [-1.38, 1.38]:
        lip = []
        for i in range(41):
            a = i * math.pi / 40
            y = wy + math.cos(a) * .465
            lip.append((sign * (body_profile(y)[0]+.013), y, -.59+math.sin(a)*.465))
        tube('rolled wheel arch', lip, .017, paint, 8)
        # Dark inner wheel well around the open arch; it catches real shadows.
        verts = []
        for p in lip:
            verts += [p, (p[0]-sign*.16, p[1], p[2]-.015)]
        smooth(mesh('wheel well', verts, [(i*2,i*2+1,i*2+3,i*2+2) for i in range(40)], dark))
    # Slightly inset swept side skirt between wheel openings.
    ring_mesh('side skirt', [((sign*.865,y,-.70),w,d) for y,w,d in
              [(-.92,.025,.035),(-.82,.055,.055),(.80,.055,.055),(.92,.025,.035)]], paint, 'y', 12)


def body_top(name, y0, y1, rows):
    verts = []; faces = []
    for j in range(rows+1):
        y = y0 + (y1-y0)*j/rows
        w,z = body_profile(y)
        for i in range(17):
            x = (i/8-1)*(w-.065)
            # Tensioned hood/cross-section with two gently raised swage lines.
            xn = x/(w-.065)
            zc = z + .050*(1-xn*xn) + .021*math.exp(-((abs(xn)-.68)/.12)**2)
            verts.append((x,y,zc))
    for j in range(rows):
        for i in range(16):
            a=j*17+i;faces.append((a,a+1,a+18,a+17))
    return smooth(mesh(name, verts, faces, paint))

body_top('sculpted hood', .82, 2.2, 24)
body_top('rear deck', -2.2, -1.04, 20)
ring_mesh('integrated rear lip', [((0,y,z),w,d) for y,z,w,d in [(-2.05,-.172,.80,.019),(-1.98,-.118,.87,.027),(-1.91,-.145,.87,.020)]],paint,'y',28)
for side in [-1,1]:
    # A real door shutline is dark and fine, not a protruding trim bar.
    tube('door shutline',[(side*.88,-.91,-.14),(side*.909,-.87,-.32),
         (side*.897,-.79,-.61),(side*.895,.59,-.61),(side*.916,.79,-.32),(side*.9,.81,-.17)], .004, dark, 6)
    box('flush door handle',(side*.918,-.62,-.205),(.024,.18,.024),chrome,.01)
    # Door card sits inside the painted outer panel.
    box('inner door card',(side*.79,-.02,-.40),(.08,1.65,.37),leather,.035)
    box('door armrest',(side*.735,-.16,-.33),(.12,.45,.07),dark,.027)

# Front and rear fascias follow the outline of the continuous shell.
for y, facing in [(2.15,1),(-2.15,-1)]:
    top = -.37 if facing > 0 else -.24
    py=y-facing*.06
    panel=[(-.78,py,top),(.78,py,top),(.83,py,-.46),(.75,py,-.69),(-.75,py,-.69),(-.83,py,-.46)]
    rounded_panel('continuous fascia',panel if facing<0 else list(reversed(panel)),paint,.055,.035)
    ring_mesh('curved bumper',[((0,y+facing*t,z),w,d) for t,z,w,d in
              [(-.065,-.56,.83,.13),(0,-.55,.82,.145),(.047,-.55,.73,.11)]],paint,'y',28)
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
               [(2.074,-.32,.24,.077),(2.135,-.335,.205,.057)]],dark,'y',20)
    for dx in [-.093,.072]:
        cyl('projector surround',(x+dx,2.137,-.33),(x+dx,2.147,-.33),.050,chrome,20)
        sphere('projector lens',(x+dx,2.153,-.33),(.038,.018,.038),lampglass,16,8)
    box('running light',(x,2.145,-.285),(.30,.012,.012),white,.006)
    box('tail smoked surround',(side*.60,-2.142,-.305),(.45,.028,.105),dark,.025)
    box('red tail lens',(side*.60,-2.164,-.298),(.40,.013,.058),red,.018)
    for dx in [-.11,-.04,.03,.10]:box('tail optic',(side*.60+dx,-2.173,-.298),(.025,.009,.035),red,.009)
    box('reverse lamp',(side*.42,-2.166,-.327),(.065,.009,.016),white,.004)
    cyl('exhaust metal',(side*.60,-2.15,-.70),(side*.60,-2.28,-.70),.055,chrome,16)
    cyl('exhaust dark bore',(side*.60,-2.283,-.70),(side*.60,-2.287,-.70),.043,dark,16)

# Glasshouse: closed compound-curved roof, thin A pillars and broad haunches.
roof_rings=[]
for y,w,z in [(-.88,.56,.34),(-.64,.65,.47),(-.40,.67,.50),(.02,.67,.51),(.25,.65,.48),(.43,.57,.37)]:
    roof_rings.append(((0,y,z),w,.038))
ring_mesh('arched roof',roof_rings,paint,'y',32)
for side in [-1,1]:
    tube('A pillar',[(side*.81,.91,-.13),(side*.76,.75,.08),(side*.66,.42,.39),(side*.58,.33,.47)],.032,paint,10)
    tube('C pillar',[(side*.84,-1.19,-.12),(side*.78,-1.05,.15),(side*.64,-.75,.43),(side*.57,-.62,.48)],.049,paint,10)
    window=[(side*.80,.84,-.075),(side*.65,.36,.424),(side*.64,-.62,.427),(side*.78,-1.035,-.065)]
    rounded_panel('clear side glazing',window if side > 0 else list(reversed(window)),glass,.003,0)
    tube('rubber window seal',window,.014,dark,8,True)
    tube('polished belt trim',[(side*.83,.87,-.095),(side*.85,-1.09,-.09)],.009,chrome)
    tube('rear quarter divider',[(side*.69,-.62,.413),(side*.79,-.63,-.07)],.018,paint)
    # Sculpted side mirror with reflective front face.
    ring_mesh('mirror shell',[((side*x,y,z),w,d) for x,y,z,w,d in
       [(.81,.57,.04,.045,.023),(.99,.55,.068,.13,.061),(1.045,.44,.07,.11,.055)]],paint,'y',16)
    rounded_panel('mirror reflection',[(side*.95,.418,.027),(side*1.15,.418,.04),(side*1.14,.421,.106),(side*.95,.427,.115)],chrome,.004,.01)
# Bowed windshield and rear window grids, with per-row curvature.
for name, rows in [('windshield',[(.91,-.105,.78),(.77,.077,.735),(.61,.245,.686),(.42,.413,.607)]),
                   ('rear glazing',[(-1.17,-.105,.79),(-1.03,.085,.741),(-.87,.282,.669),(-.68,.419,.598)])]:
    verts=[]
    for y,z,w in rows:
        for i in range(17):
            nx=i/8-1;verts.append((nx*w,y+(1-nx*nx)*(.045 if y>0 else -.028),z+.014*(1-nx*nx)))
    faces=[(j*17+i,j*17+i+1,(j+1)*17+i+1,(j+1)*17+i) for j in range(3) for i in range(16)]
    smooth(mesh(name,verts,[tuple(reversed(f)) for f in faces] if name == 'windshield' else faces,glass))
    for j in [0,3]:tube('glazing lower seal',verts[j*17:j*17+17],.012,dark)
# Wipers rest naturally at the lower windshield edge.
for x in [-.36,.18]:
    tube('wiper arm',[(x,.865,-.065),(x+.12,.813,.019),(x+.27,.785,.043)],.007,dark,6)
    tube('wiper blade',[(x+.04,.811,.022),(x+.40,.769,.049)],.008,dark,6)

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
for x in [-.10,.10]:sphere('radio knob',(x,.329,-.20),(.018,.011,.018),chrome,10,6)
box('gauge binnacle',(-.42,.40,-.035),(.37,.25,.18),dark,.055)
for x in [-.505,-.335]:
    cyl('instrument ring',(x,.274,-.025),(x,.265,-.025),.063,chrome,18)
    cyl('instrument black',(x,.263,-.025),(x,.26,-.025),.056,dark,18)
    tube('gauge needle',[(x,.255,-.025),(x-.022,.255,.007)],.0025,white,4)
bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,major_radius=.166,minor_radius=.018,location=(-.42,.20,-.045),rotation=(math.pi/2.2,0,0))
steering=add(bpy.context.object,'leather steering wheel',leather);smooth(steering)
for dx,dz in [(-.14,0),(.14,0),(0,-.14)]:
    tube('steering spoke',[(-.42,.20,-.045),(-.42+dx,.20,-.045+dz)],.012,chrome,8)
sphere('steering center',(-.42,.185,-.045),(.056,.025,.055),leather,16,8)
cyl('gear stick',(.0,-.05,-.48),(.0,-.05,-.33),.012,chrome,10)
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
        wheel_part(smooth(mesh('tire carcass',verts,faces,dark)))
        for off in [-.047,.047]:
            pts=[(x+off,y+math.cos(i*math.tau/64)*.408,-.59+math.sin(i*math.tau/64)*.408) for i in range(64)]
            wheel_part(tube('tread groove',pts,.0045,sole,5,True))
        exterior=x+sign*.148
        # Rim dish and machined lips.
        for r,rr,mat in [(.284,.011,alloy),(.257,.008,chrome),(.102,.008,alloy)]:
            pts=[(exterior,y+math.cos(i*math.tau/48)*r,-.59+math.sin(i*math.tau/48)*r) for i in range(48)]
            wheel_part(tube('rim lip',pts,rr,mat,8,True))
        wheel_part(cyl('brake disk',(x+sign*.088,y,-.59),(x+sign*.098,y,-.59),.228,brake,48))
        wheel_part(cyl('hub cap',(exterior-sign*.01,y,-.59),(exterior+sign*.017,y,-.59),.086,alloy,24))
        for i in range(5):
            a=i*math.tau/5
            for da in [-.10,.10]:
                ca,sa=math.cos(a+da),math.sin(a+da)
                # Swept, split five-spoke forged alloy design.
                p0=(exterior,y+ca*.08,-.59+sa*.08)
                p1=(exterior-sign*.022,y+math.cos(a+da+.055)*.255,-.59+math.sin(a+da+.055)*.255)
                wheel_part(tube('forged spoke',[p0,p1],.018,alloy,8))
            wheel_part(sphere('lug nut',(exterior+sign*.02,y+math.cos(a)*.059,-.59+math.sin(a)*.059),(.010,.009,.009),chrome,8,6))
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
stitch=material('clothing-stitch',(.35,.38,.33),.92)
lip=material('lip',(.26,.12,.082),.82)
eyebrown=material('iris',(.085,.052,.028),.6)
parts=[]

def part(o,bone):
    parts.append((o,bone));return o


# Torso folds deliberately interrupt the regular circular loft. The fitted
# white tee is framed by an open overshirt instead of a toy-like solid trunk.
torso=[]
for z,w,d,cy in [(.91,.178,.12,0),(.96,.20,.137,0),(1.03,.207,.139,-.003),
                 (1.095,.205,.143,-.009),(1.14,.198,.139,-.005),
                 (1.21,.216,.143,-.007),(1.34,.235,.145,-.005),
                 (1.40,.228,.132,-.003),(1.455,.17,.104,0),(1.49,.079,.076,0)]:
    torso.append(((0,cy,z),w,d))
body=part(ring_mesh('tailored overshirt',torso,shirt,sides=40),'spine')
# Creases are sculpted into the surface rather than painted striped ribbons.
for v in body.data.vertices:
    if .98<v.co.z<1.34:
        a=math.atan2(v.co.y,v.co.x)
        fold=.0034*math.sin(v.co.z*94+a*3)+.002*math.cos(a*8+v.co.z*53)
        v.co.x*=1+fold/.2;v.co.y*=1+fold/.14
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
part(ring_mesh('neck',[((0,0,1.435),.089,.078),((0,-.012,1.52),.068,.071),((0,-.006,1.604),.072,.073)],skin,sides=24),'head')
head=part(ring_mesh('sculpted face',[
    ((0,.031,1.582),.039,.046),((0,.020,1.608),.073,.073),
    ((0,.004,1.649),.099,.101),((0,-.002,1.702),.122,.116),
    ((0,-.010,1.752),.126,.116),((0,-.015,1.802),.125,.112),
    ((0,-.017,1.845),.111,.101),((0,-.018,1.88),.078,.077),
    ((0,-.018,1.903),.018,.020)],skin,sides=40),'head')
# Flatten the forward face slightly, add cheek/jaw shaping to the mesh itself.
for v in head.data.vertices:
    if v.co.y>.055:
        front=(v.co.y-.055)/.06
        if 1.70<v.co.z<1.79:v.co.y-=.006*front
        v.co.y+=.004*math.exp(-((abs(v.co.x)-.08)/.032)**2)*math.exp(-((v.co.z-1.72)/.06)**2)
part(ring_mesh('cropped hair',[
    ((0,-.017,1.797),.124,.110),((0,-.018,1.836),.119,.108),
    ((0,-.019,1.879),.083,.080),((0,-.019,1.908),.018,.02)],hair,sides=40),'head')
for sign in [-1,1]:
    part(sphere('ear',(sign*.123,-.007,1.719),(.025,.030,.044),skin,16,10),'head')
    part(sphere('ear concha',(sign*.143,.001,1.72),(.007,.017,.025),lip,12,8),'head')
    # Eyelid rims keep the small eyes recessed instead of bulging goggles.
    part(sphere('eye socket',(sign*.048,.101,1.756),(.027,.008,.012),lip,16,8),'head')
    part(sphere('eye white',(sign*.048,.107,1.757),(.020,.004,.006),white,16,8),'head')
    part(sphere('iris',(sign*.048,.111,1.757),(.006,.002,.006),eyebrown,12,8),'head')
    part(sphere('pupil',(sign*.048,.113,1.757),(.003,.001,.004),hair,10,6),'head')
    part(tube('upper eyelid',[(sign*.069,.108,1.758),(sign*.049,.112,1.764),(sign*.028,.110,1.759)],.0029,skin,6),'head')
    part(tube('eyebrow',[(sign*.080,.100,1.786),(sign*.052,.111,1.791),(sign*.025,.110,1.783)],.006,hair,8),'head')
# Nose with a bridged ridge, nostril wings and shadowed bores.
part(smooth(mesh('sculpted nose',[(-.012,.107,1.781),(.012,.107,1.781),(-.016,.130,1.722),(.016,.130,1.722),(-.024,.127,1.704),(.024,.127,1.704),(0,.154,1.709),(0,.126,1.698)],[(0,1,3,2),(2,3,6),(2,6,4),(3,5,6),(4,6,7),(6,5,7)],skin)),'head')
for sign in [-1,1]:part(sphere('nostril',(sign*.015,.133,1.704),(.006,.007,.003),lip,10,6),'head')
part(tube('upper lip',[(-.027,.111,1.667),(-.010,.121,1.671),(0,.120,1.669),(.010,.121,1.671),(.027,.111,1.667)],.0044,lip,8),'head')
part(tube('lower lip',[(-.025,.111,1.665),(0,.121,1.659),(.025,.111,1.665)],.0045,skin,8),'head')
part(tube('mouth shadow',[(-.025,.115,1.665),(0,.124,1.666),(.025,.115,1.665)],.0016,hair,5),'head')
# Short beard is a close facial strip, retaining an anatomical chin silhouette.
part(ring_mesh('close beard',[((0,.020,1.602),.054,.057),((0,.013,1.619),.074,.076),((0,.006,1.642),.088,.088)],hair,sides=32,caps=False),'head')

part(ring_mesh('jean pelvis',[((0,-.010,.815),.186,.125),((0,-.012,.91),.205,.143),((0,-.005,.966),.190,.132)],denim,sides=32),'hips')
part(tube('waistband',[(math.cos(i*math.tau/40)*.194,math.sin(i*math.tau/40)*.134,.948) for i in range(40)],.015,denim,8,True),'hips')
part(box('belt buckle',(0,.141,.946),(.040,.013,.033),chrome,.004),'hips')
for sign,side in [(-1,'L'),(1,'R')]:
    x=sign*.15;ax=sign*.245
    leg=ring_mesh('shaped denim leg',[
      ((x,.018,.118),.074,.068),((x,.012,.16),.079,.074),((x,-.003,.245),.078,.082),
      ((x,-.018,.36),.083,.087),((x,.013,.455),.094,.097),((x,.018,.49),.100,.103),
      ((x,-.003,.59),.106,.109),((x,-.01,.735),.117,.116),((x,-.01,.87),.119,.114)],denim,sides=32)
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
    # Tapered sleeve, soft elbow and anatomically varying forearm sections.
    arm=part(ring_mesh('rolled sleeve',[((ax,0,1.145),.074,.078),((ax,0,1.19),.084,.084),((ax,0,1.29),.083,.096),((ax,0,1.39),.089,.099),((ax-sign*.026,0,1.433),.071,.074),((ax-sign*.044,0,1.453),.040,.050),((ax-sign*.052,0,1.458),.014,.024)],shirt,sides=28),f'arm{side}')
    part(ring_mesh('rolled cotton cuff',[((ax,0,1.143),.077,.082),((ax,0,1.168),.084,.087),((ax,0,1.18),.081,.084)],shirt,sides=28),f'arm{side}')
    part(tube('sleeve seam',[(ax+sign*.078,0,1.20),(ax+sign*.084,0,1.36)],.0018,stitch,5),f'arm{side}')
    part(ring_mesh('anatomical forearm',[((ax,0,.843),.039,.037),((ax,-.002,.89),.045,.041),((ax,-.006,.965),.059,.055),((ax,-.002,1.05),.069,.065),((ax,0,1.153),.060,.062)],skin,sides=24),f'forearm{side}')
    part(ring_mesh('palm',[((ax,0,.754),.037,.026),((ax,0,.779),.047,.030),((ax,0,.822),.042,.032),((ax,0,.856),.034,.031)],skin,sides=20),f'forearm{side}')
    for finger in range(4):
        fx=ax+(finger-1.5)*.020
        length=[.070,.088,.085,.067][finger]
        part(ring_mesh('finger',[((fx,.004,.758-length),.007,.008),((fx,.012,.767-length*.55),.0085,.011),((fx,.005,.764),.009,.012)],skin,sides=10),f'forearm{side}')
    part(tube('thumb',[(ax-sign*.033,.0,.817),(ax-sign*.063,.005,.792),(ax-sign*.065,.016,.767)],.013,skin,10),f'forearm{side}')

# Bind lofted limbs with soft knee/hip transitions, preserving authored actions.
for o,bone in parts:
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    g=o.vertex_groups.new(name=bone)
    g.add(list(range(len(o.data.vertices))),1,'REPLACE')
    if o.name.startswith('shaped denim leg') or o.name.startswith('denim outer seam'):
        side=bone[-1];shin=o.vertex_groups.new(name=f'shin{side}')
        for v in o.data.vertices:
            t=max(0,min(1,(v.co.z-.41)/.15))
            g.add([v.index],t,'REPLACE');shin.add([v.index],1-t,'REPLACE')
    modifier=o.modifiers.new('skin','ARMATURE');modifier.object=rig;o.parent=rig
bpy.ops.object.select_all(action='DESELECT')
for o,b in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0][0];bpy.ops.object.join();parts[0][0].name='Neighbor'
# Mild torso counter-rotation and foot clearance improve the existing walk.
# Existing seat bone transforms remain untouched to preserve cabin fit.
for action in bpy.data.actions:
    if action.name=='walk':
        rig.animation_data.action=action
        for frame in range(1,32,5):
            phase=(frame-1)/30*math.tau
            rig.pose.bones['spine'].rotation_euler.z=.035*math.sin(phase)
            rig.pose.bones['spine'].keyframe_insert('rotation_euler',frame=frame)
            rig.pose.bones['hips'].location.z=.018*(1-math.cos(phase*2))
            rig.pose.bones['hips'].keyframe_insert('location',frame=frame)
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
for o in bpy.context.scene.objects: hero_uv(o)
export('neighbor',False)
print('Detailed original coupe and neighbor exported')
