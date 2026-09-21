# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Arroyo driving-club / neighborhood meeting-point assets.

Run with the pinned Blender 4.5.13, or execute after build.py's other extensions.
Models are meters, Z up; the sign and bench face -Y, with bottom-center origins.
No downloaded models, fonts, or newly generated bitmap dependencies are required.
The sign's lettering is an original hand-authored single-line geometric alphabet.

Optional standalone authoring previews:
  blender --background --python tools/assets/activity-kit.py -- --preview
  blender --background --python tools/assets/activity-kit.py -- --only activity-board
"""

import bpy
import math
import pathlib
import random
import sys
import json
import struct
import zlib
import html
from mathutils import Vector, noise


def build_activity_kit():
    assert bpy.app.version[:3] == (4, 5, 13), bpy.app.version_string
    root = pathlib.Path(__file__).resolve().parents[2]
    source = root / "assets/source"
    output = root / "apps/browser/public/assets"
    evidence = root / ".dream-loop/activity-assets"
    for path in (source, output, evidence):
        path.mkdir(parents=True, exist_ok=True)
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = args[args.index("--only") + 1] if "--only" in args else None
    preview = "--preview" in args
    rng = random.Random(9020)
    bpy.context.preferences.filepaths.save_version = 0
    materials = {}

    def material(name, color, roughness=.78, metallic=0):
        # These separate datablocks keep standalone and parent-script builds equal.
        existing = bpy.data.materials.get(name)
        if existing:
            existing.name = name + " previous export"
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mat.diffuse_color = (*color, 1)
        p = mat.node_tree.nodes.get("Principled BSDF")
        p.inputs["Base Color"].default_value = (*color, 1)
        p.inputs["Roughness"].default_value = roughness
        p.inputs["Metallic"].default_value = metallic
        # Neutral, spatially varying dirt/chips survive both graphics presets.
        attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Color"
        multiply = mat.node_tree.nodes.new("ShaderNodeMix")
        multiply.data_type = "RGBA"
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1
        multiply.inputs[6].default_value = (*color, 1)
        mat.node_tree.links.new(attr.outputs["Color"], multiply.inputs[7])
        mat.node_tree.links.new(multiply.outputs[2], p.inputs["Base Color"])
        materials[name] = mat
        return mat

    concrete = material("concrete", (.55, .52, .44), .96)
    wood = material("wood", (.32, .20, .10), .85)
    rubber = material("rubber", (.025, .029, .025), .94)
    steel = material("activity-steel", (.075, .10, .085), .57, .65)
    zinc = material("activity-zinc", (.46, .49, .46), .39, .85)
    rust = material("activity-rust", (.24, .095, .039), .96)
    green = material("activity-green", (.035, .115, .092), .69, .10)
    cream = material("activity-cream", (.83, .79, .64), .74)
    orange = material("activity-orange", (.83, .23, .038), .71)
    white = material("activity-reflector", (.89, .88, .78), .25, .18)
    soil = material("activity-soil", (.13, .090, .041), 1)
    agave = material("activity-agave", (.19, .30, .22), .89)
    agave_edge = material("activity-agave-edge", (.45, .48, .22), .92)

    def start():
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        # Keep the packed sign input in its own editable source only; orphaned
        # material nodes must not copy it into every later .blend in this build.
        for image in list(bpy.data.images):
            if image.name.startswith("Original Arroyo enamel face"):
                bpy.data.images.remove(image)

    def attach(obj, name, mat):
        obj.name = name
        obj.data.materials.append(mat)
        return obj

    def mesh(name, vertices, faces, mat, smooth=False):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        attach(obj, name, mat)
        for polygon in data.polygons:
            polygon.use_smooth = smooth
        return obj

    def box(name, position, size, mat, bevel=0, segments=3):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = attach(bpy.context.object, name, mat)
        obj.scale = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel:
            mod = obj.modifiers.new("Formed edge radius", "BEVEL")
            mod.width = bevel
            mod.segments = segments
            bpy.ops.object.modifier_apply(modifier=mod.name)
            normal = obj.modifiers.new("Manufactured corner normals", "WEIGHTED_NORMAL")
            normal.keep_sharp = True
            bpy.ops.object.modifier_apply(modifier=normal.name)
        return obj

    def cylinder(name, a, b, radius, mat, radius_end=None, sides=16):
        a, b = Vector(a), Vector(b)
        d = b - a
        bpy.ops.mesh.primitive_cone_add(
            vertices=sides, radius1=radius,
            radius2=radius if radius_end is None else radius_end,
            depth=d.length, location=(a+b)*.5)
        obj = attach(bpy.context.object, name, mat)
        obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        for face in obj.data.polygons:
            if len(face.vertices) == 4:
                face.use_smooth = True
        return obj

    def tube(name, points, radius, mat, sides=10):
        points = [Vector(point) for point in points]
        vertices, faces = [], []
        for i, point in enumerate(points):
            tangent = (points[min(i+1, len(points)-1)] - points[max(0, i-1)]).normalized()
            axis = Vector((1, 0, 0)) if abs(tangent.x) < .9 else Vector((0, 1, 0))
            side = tangent.cross(axis).normalized()
            normal = tangent.cross(side).normalized()
            for k in range(sides):
                angle = k*math.tau/sides
                vertices.append(point + radius*(side*math.cos(angle)+normal*math.sin(angle)))
            if i:
                for k in range(sides):
                    faces.append(((i-1)*sides+k, (i-1)*sides+(k+1)%sides,
                                  i*sides+(k+1)%sides, i*sides+k))
        faces.extend([tuple(reversed(range(sides))), tuple(range(len(vertices)-sides, len(vertices)))])
        return mesh(name, vertices, faces, mat, True)

    def bolt(name, position, face="front", radius=.018):
        # Washer and hexagonal bolt: visible hardware, no unsupported normal trick.
        p = Vector(position)
        axis = Vector((0, -.008, 0)) if face == "front" else Vector((0, 0, .008))
        cylinder(name+" washer", p, p+axis*.45, radius*1.55, zinc, sides=16)
        cylinder(name+" hex head", p+axis*.35, p+axis*1.4, radius, zinc, sides=6)
        if face == "front":
            box(name+" head slot", p+axis*1.43, (radius*.8, .0015, .0025), steel)

    # Original lettering: no bundled/downloaded font. Coordinates are 0..1 in
    # height, 0..0.62 in width; every path is a deliberately authored glyph.
    glyphs = {
        "A": [[(0,0),(.23,1),(.39,1),(.62,0)], [(.10,.40),(.52,.40)]],
        "B": [[(0,0),(0,1),(.43,1),(.62,.84),(.62,.66),(.43,.52),(0,.52)],
              [(.43,.52),(.62,.34),(.62,.17),(.43,0),(0,0)]],
        "C": [[(.62,.88),(.48,1),(.15,1),(0,.83),(0,.17),(.15,0),(.48,0),(.62,.12)]],
        "D": [[(0,0),(0,1),(.36,1),(.62,.77),(.62,.23),(.36,0),(0,0)]],
        "E": [[(.62,1),(0,1),(0,0),(.62,0)],[(0,.52),(.49,.52)]],
        "F": [[(0,0),(0,1),(.62,1)],[(0,.52),(.49,.52)]],
        "G": [[(.62,.85),(.47,1),(.15,1),(0,.83),(0,.17),(.15,0),(.62,0),(.62,.47),(.34,.47)]],
        "H": [[(0,0),(0,1)],[(.62,0),(.62,1)],[(0,.52),(.62,.52)]],
        "I": [[(0,1),(.62,1)],[(.31,1),(.31,0)],[(0,0),(.62,0)]],
        "J": [[(0,.19),(.17,0),(.43,0),(.62,.19),(.62,1)]],
        "K": [[(0,0),(0,1)],[(.62,1),(0,.44),(.62,0)]],
        "L": [[(0,1),(0,0),(.62,0)]],
        "M": [[(0,0),(0,1),(.31,.45),(.62,1),(.62,0)]],
        "N": [[(0,0),(0,1),(.62,0),(.62,1)]],
        "O": [[(.15,0),(0,.17),(0,.83),(.15,1),(.47,1),(.62,.83),(.62,.17),(.47,0),(.15,0)]],
        "P": [[(0,0),(0,1),(.45,1),(.62,.83),(.62,.66),(.45,.50),(0,.50)]],
        "Q": [[(.15,0),(0,.17),(0,.83),(.15,1),(.47,1),(.62,.83),(.62,.17),(.47,0),(.15,0)],
              [(.37,.25),(.70,-.06)]],
        "R": [[(0,0),(0,1),(.45,1),(.62,.83),(.62,.66),(.45,.50),(0,.50)],[(.29,.50),(.66,0)]],
        "S": [[(.62,.86),(.48,1),(.15,1),(0,.83),(0,.67),(.16,.52),(.46,.48),(.62,.33),(.62,.17),(.47,0),(.14,0),(0,.13)]],
        "T": [[(0,1),(.62,1)],[(.31,1),(.31,0)]],
        "U": [[(0,1),(0,.17),(.15,0),(.47,0),(.62,.17),(.62,1)]],
        "V": [[(0,1),(.31,0),(.62,1)]],
        "W": [[(0,1),(.12,0),(.31,.54),(.50,0),(.62,1)]],
        "X": [[(0,0),(.62,1)],[(0,1),(.62,0)]],
        "Y": [[(0,1),(.31,.53),(.62,1)],[(.31,.53),(.31,0)]],
        "Z": [[(0,1),(.62,1),(0,0),(.62,0)]],
        "0": [[(.15,0),(0,.17),(0,.83),(.15,1),(.47,1),(.62,.83),(.62,.17),(.47,0),(.15,0)]],
        "1": [[(.12,.80),(.31,1),(.31,0)],[(.08,0),(.54,0)]],
        "2": [[(0,.82),(.16,1),(.46,1),(.62,.82),(.62,.65),(0,0),(.62,0)]],
        "3": [[(0,1),(.62,1),(.30,.52),(.48,.52),(.62,.36),(.62,.17),(.46,0),(0,0)]],
        "-": [[(.07,.5),(.55,.5)]],
        "/": [[(0,0),(.62,1)]],
    }

    def lettering(text, center_x, front_y, baseline, height, mat, stroke=.085, tracking=.20, rear=False):
        step = (.62+tracking)*height
        width = len(text)*step - tracking*height
        vertices, faces = [], []
        for index, char in enumerate(text):
            if char == " ":
                continue
            if char not in glyphs:
                raise ValueError("Missing original sign glyph: "+char)
            x = center_x-width/2+index*step
            for path_index,path in enumerate(glyphs[char]):
                closed=path[0]==path[-1]
                # Branch strokes sit a tiny physical paint layer above their
                # shared stem, avoiding coincident rasterized faces at joins.
                y=front_y+(.00005 if rear else -.00005)*path_index
                points=[Vector((x+p[0]*height,y+(.00001 if rear else -.00001)*point_index,baseline+p[1]*height)) for point_index,p in enumerate(path[:-1] if closed else path)]
                n=len(vertices)
                for i,point in enumerate(points):
                    before=(point-points[i-1]).normalized() if i or closed else (points[1]-point).normalized()
                    after=(points[(i+1)%len(points)]-point).normalized() if i<len(points)-1 or closed else before
                    normal_before=Vector((-before.z,0,before.x))
                    normal_after=Vector((-after.z,0,after.x))
                    miter=(normal_before+normal_after).normalized()
                    offset=miter*(height*stroke*.5/max(.35,miter.dot(normal_after)))
                    corners=[point-offset,point+offset]
                    if rear:
                        for corner in corners:corner.x=-corner.x
                    vertices += corners
                # Shared mitered boundaries avoid coplanar overlap at every bend;
                # the old independent stroke rectangles rendered black joint specks.
                for i in range(len(points) if closed else len(points)-1):
                    j=(i+1)%len(points)
                    faces.append((n+2*j,n+2*j+1,n+2*i+1,n+2*i))
        return mesh("Original lettering — "+text, vertices, faces, mat)

    def rounded_ring(name, z, half_x, half_y, thickness, mat, radius=.14):
        points = []
        for cx, cy, start_angle in [(half_x-radius,half_y-radius,0),(-half_x+radius,half_y-radius,90),(-half_x+radius,-half_y+radius,180),(half_x-radius,-half_y+radius,270)]:
            for i in range(7):
                angle = math.radians(start_angle+i*90/6)
                points.append((cx+radius*math.cos(angle),cy+radius*math.sin(angle),z))
        points.append(points[0])
        return tube(name,points,thickness,mat,8)

    def board():
        start()
        for x in [-1.05,1.05]:
            box("Cast footing",(x,0,.08),(.47,.52,.16),concrete,.045)
            box("Post anchor base",(x,0,.17),(.27,.30,.034),steel,.018)
            for xx in [-.095,.095]:
                for yy in [-.10,.10]: bolt("Base anchor",(x+xx,yy,.192),"up",.012)
            box("Galvanized square support",(x,.11,1.37),(.10,.10,2.42),steel,.01)
            box("Post cap",(x,.11,2.593),(.112,.112,.03),zinc,.012)
            box("Rear sign clamp",(x,.032,1.15),(.24,.06,.18),zinc,.015)
            box("Rear sign clamp",(x,.032,2.25),(.24,.06,.18),zinc,.015)
        # Hemmed metal frame with a genuine recess, rain cap and formed corners.
        box("Folded aluminum sign back",(0,-.018,1.83),(2.76,.105,1.48),steel,.045)
        box("Enamel face panel",(0,-.080,1.83),(2.66,.035,1.38),green,.030)
        for x in [-1.325,1.325]:box("Cream edge return",(x,-.106,1.83),(.025,.028,1.30),cream,.008)
        for z in [1.177,2.483]:box("Cream edge return",(0,-.106,z),(2.65,.028,.026),cream,.008)
        box("Weather cap",(0,-.065,2.602),(2.80,.32,.075),steel,.025)
        box("Weather cap drip edge",(0,-.227,2.581),(2.76,.024,.07),zinc,.008)
        box("Orange club stripe",(0,-.104,2.286),(2.53,.006,.19),orange,.002)
        # Raised enamel lettering needs 6.5mm separation from its sign face to
        # remain depth-stable from the opposite street with the game's .1–900m
        # camera range. Sub-millimeter coplanar print breaks into specks at 30m.
        lettering("ARROYO",0,-.104,1.820,.31,cream,.11,.27)
        lettering("MOTOR CLUB",0,-.1135,2.245,.085,cream,.10,.35)
        lettering("TIME TRIAL",0,-.104,1.560,.17,cream,.11,.23)
        lettering("NEIGHBORHOOD LOOP",0,-.104,1.340,.084,cream,.075,.21)
        for x in [-1.21,1.21]:
            for z in [1.27,2.39]:bolt("Sign face bolt",(x,-.119,z),radius=.014)
        # Tiny staggered paint abrasion and rust below the real fastening points.
        for i in range(21):
            x = rng.uniform(-1.22,1.22)
            z = rng.choice([1.195,2.465])+rng.uniform(-.01,.01)
            box("Edge enamel wear",(x,-.123,z),(rng.uniform(.016,.046),.0015,.004),zinc)
        for x in [-1.21,1.21]:
            box("Bolt oxidation trail",(x+.002,-.122,1.229),(.012,.001,.045),rust,.002)
        # Short rear stiffeners make a convincing object from behind as well.
        for z in [1.31,2.32]:box("Rear hem reinforcement",(0,.050,z),(2.47,.065,.038),steel,.008)
        lettering("ARROYO",0,.041,1.64,.15,cream,.10,rear=True)

    def pylon():
        start()
        box("Recycled rubber octagonal foot",(0,0,.065),(.66,.66,.13),rubber,.095,2)
        box("Raised rubber center",(0,0,.139),(.43,.43,.06),rubber,.065,3)
        for x in [-.245,.245]:
            for y in [-.245,.245]:
                cylinder("Base pressed anchor ring",(x,y,.128),(x,y,.132),.031,steel,sides=14)
                cylinder("Base anchor cavity",(x,y,.133),(x,y,.134),.013,rubber,sides=12)
        # Profile rings form one continuous flexible cone with a widened shoulder,
        # rounded tip and an actual recessed grip at the top.
        profile=[(.16,.183),(.18,.187),(.205,.179),(.27,.163),(.41,.145),(.54,.130),(.67,.114),(.82,.096),(.99,.075),(1.033,.072),(1.060,.059),(1.065,.041),(1.045,.026),(1.008,.025)]
        vertices,faces=[],[]
        sides=48
        for z,radius in profile:
            for i in range(sides):
                a=i*math.tau/sides
                vertices.append((radius*math.cos(a),radius*math.sin(a),z))
        for ring in range(len(profile)-1):
            for i in range(sides):faces.append((ring*sides+i,ring*sides+(i+1)%sides,(ring+1)*sides+(i+1)%sides,(ring+1)*sides+i))
        faces.append(tuple(range((len(profile)-1)*sides,len(profile)*sides)))
        obj=mesh("Molded continuous orange cone",vertices,faces,orange,True)
        # Sleeves sit 0.7mm outside the exact cone profile, no z fighting.
        for lo,hi,r0,r1 in [(.43,.55,.1429,.1288),(.71,.83,.1092,.0948)]:
            cylinder("Retroreflective wrap",(0,0,lo),(0,0,hi),r0+.0007,white,r1+.0007,48)
        for z,radius in [(.22,.177),(.974,.078)]:
            points=[(math.cos(i*math.tau/48)*radius,math.sin(i*math.tau/48)*radius,z) for i in range(49)]
            tube("Mold parting ring",points,.002,orange,5)
        for i in range(19):
            a=rng.random()*math.tau;r=rng.uniform(.24,.30)
            box("Embedded base grain",(math.cos(a)*r,math.sin(a)*r,.129),(.017,.009,.002),steel,.002)

    def bench():
        start()
        # Formed steel side frames follow the actual seat/back curve and stand on
        # broad anchored feet. Front is -Y, so recline leans toward +Y.
        for x in [-.79,.79]:
            for y in [-.265,.24]:
                box("Cast foot",(x,y,.028),(.22,.19,.056),steel,.025)
                for xx in [-.065,.065]:bolt("Bench ground bolt",(x+xx,y,.059),"up",.011)
            tube("Continuous bench side support",[(x,-.265,.055),(x,-.25,.16),(x,-.235,.37),(x,-.24,.455),(x,-.15,.47),(x,.0,.455),(x,.15,.46),(x,.25,.50),(x,.30,.64),(x,.35,.80),(x,.37,.92)],.026,steel,14)
            tube("Rear supporting leg",[(x,.24,.058),(x,.23,.18),(x,.205,.35),(x,.19,.465)],.03,steel,12)
            tube("Cast curved armrest",[(x,-.235,.395),(x,-.28,.53),(x,-.26,.65),(x,-.17,.695),(x,.09,.695),(x,.25,.665),(x,.285,.55)],.033,steel,14)
            box("Armrest worn grip",(x,-.027,.715),(.071,.35,.03),wood,.014)
        for y in [-.20,.19]:tube("Underseat crossbar",[(-.80,y,.405),(.80,y,.405)],.023,steel)
        # Slightly cupped individual hardwood slats, real narrow gaps and softened
        # corners. Fine grooves add a distinct lengthwise grain beyond the shared map.
        for i in range(6):
            y=-.235+i*.087
            z=.482+.018*((y-.01)/.25)**2
            box("Weathered seat slat",(0,y,z),(2.06,.079,.049),wood,.012)
            for x in [-.79,.79]:bolt("Seat countersunk screw",(x,y,z+.026),"up",.009)
            for groove in range(2):
                xx=rng.uniform(-.75,.20)
                box("Lengthwise seat checking",(xx,y+rng.uniform(-.022,.022),z+.025),(rng.uniform(.18,.54),.0015,.0008),rust)
        for i in range(5):
            z=.605+i*.071
            y=.288+(z-.60)*.265
            slat=box("Reclined back slat",(0,y,z),(2.06,.044,.063),wood,.010)
            slat.rotation_euler.x=-.255
            for x in [-.79,.79]:bolt("Back slat screw",(x,y-.024,z),radius=.009)
        # Small original maker's plaque is deliberately unbranded and readable.
        box("Bench maker plaque",(0,.327,.851),(.34,.006,.060),zinc,.006)
        lettering("ARROYO",0,.323,.835,.030,steel,.10,.19)

    def planter():
        start()
        # A hollow, continuously modeled cast-concrete vessel, not a capped box.
        # Rounded-square rings produce broad straight-ish faces and softened corners.
        rings=[(0,.54),(.07,.56),(.50,.625),(.59,.651),(.65,.658),(.675,.641),(.675,.582),(.635,.564),(.55,.557),(.16,.485)]
        vertices,faces=[],[]
        sides=64
        for z,r in rings:
            for i in range(sides):
                a=i*math.tau/sides
                # Squircle exponent 4 retains practical planter footprint.
                x=math.copysign(abs(math.cos(a))**.5,math.cos(a))*r
                y=math.copysign(abs(math.sin(a))**.5,math.sin(a))*r
                vertices.append((x,y,z))
        for j in range(len(rings)-1):
            for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
        faces.extend([tuple(reversed(range(sides))),tuple(range((len(rings)-1)*sides,len(rings)*sides))])
        mesh("Hollow rounded concrete planter",vertices,faces,concrete,True)
        cylinder("Visible recessed potting soil",(0,0,.554),(0,0,.565),.55,soil,sides=64)
        for i in range(40):
            a=rng.random()*math.tau;r=math.sqrt(rng.random())*.50
            cylinder("Light mineral mulch",(math.cos(a)*r,math.sin(a)*r,.566),(math.cos(a)*r,math.sin(a)*r,.574),rng.uniform(.008,.017),cream,sides=5)
        # Thick folded succulent leaves, each with a curved centerline, pointed tip,
        # central ridge, real edge silhouette and a muted cream outer margin.
        for i in range(34):
            a=i*2.3999632297
            layer=i%4
            reach=[.66,.55,.43,.29][layer]
            height=[.44,.67,.88,1.00][layer]
            width=[.105,.10,.085,.069][layer]
            length_steps=13
            centerlines=[]
            for j in range(length_steps):
                t=j/(length_steps-1)
                r=.035+reach*t**1.35
                z=.565+height*(math.sin(t*math.pi*.62))
                centerlines.append(Vector((math.cos(a)*r,math.sin(a)*r,z)))
            verts,faces=[],[]
            side=Vector((-math.sin(a),math.cos(a),0))
            for j,p in enumerate(centerlines):
                t=j/(length_steps-1)
                w=width*(math.sin(math.pi*t)**.68 if j not in [0,length_steps-1] else .009)
                ridge=.018*math.sin(math.pi*t)
                verts += [p-side*w,p-side*w*.81+Vector((0,0,ridge*.3)),p+Vector((0,0,ridge)),p+side*w*.81+Vector((0,0,ridge*.3)),p+side*w]
            for j in range(length_steps-1):
                for k in range(4):faces.append((j*5+k,j*5+k+1,(j+1)*5+k+1,(j+1)*5+k))
            leaf=mesh("Sculpted variegated agave leaf",verts,faces,agave,True)
            leaf.data.materials.append(agave_edge)
            for face in leaf.data.polygons:
                if face.index%4 in [0,3]:face.material_index=1
            # Duplicated underside is offset 2.5mm: leaves are genuinely thin solids.
            mod=leaf.modifiers.new("Succulent leaf thickness","SOLIDIFY")
            mod.thickness=.0025
            bpy.context.view_layer.objects.active=leaf
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for i in range(8):
            angle=i*math.tau/8
            tube("Dry old agave tip",[(math.cos(angle)*.12,math.sin(angle)*.12,.63),(math.cos(angle)*.40,math.sin(angle)*.40,.68),(math.cos(angle)*.52,math.sin(angle)*.52,.62)],.008,wood,5)

    def yucca():
        """A field-grown rosette: varied arched blades, folded hearts and litter.

        Leaf silhouettes and thickness are real geometry, so low and standard
        presets agree without alpha cards or a new image dependency. Appending
        this builder preserves the older assets' per-index deterministic seeds.
        """
        start()
        cylinder("Fibrous low root crown",(0,0,0),(0,0,.060),.051,wood,.032,12)
        # Four growth rings balance sagging old leaves and a tight upright heart.
        rings=[(10,.43,.255,.040,.87),(9,.36,.435,.039,.66),
               (8,.22,.585,.030,.47),(6,.084,.615,.018,.47)]
        for layer,(count,reach,height,width,arch) in enumerate(rings):
            for index in range(count):
                angle=index*math.tau/count+layer*2.3999632297+rng.uniform(-.09,.09)
                radius=reach*rng.uniform(.90,1.06)
                rise=height*rng.uniform(.91,1.035)
                breadth=width*rng.uniform(.86,1.14)
                sweep=rng.uniform(-.13,.13)
                twist=rng.uniform(-.26,.26)
                vertices,faces=[],[]
                rows=14
                for row in range(rows):
                    t=row/(rows-1)
                    heading=angle+sweep*math.sin(t*math.pi*.85)
                    radial=.018+radius*t**1.20
                    z=.040+rise*math.sin(t*math.pi*arch)
                    # Older outer blades naturally arch and twist; the fresh
                    # heart is compact, upright and pointed rather than fanned flat.
                    center=Vector((math.cos(heading)*radial,math.sin(heading)*radial,z))
                    side=Vector((-math.sin(heading),math.cos(heading),twist*math.sin(t*math.pi))).normalized()
                    half_width=breadth*(.17+.83*math.sin(math.pi*t)**.63)*(1-.32*t)
                    if row==rows-1:half_width=.00035
                    ridge=.009*math.sin(t*math.pi)*(1-layer*.10)
                    for offset in [-1,-.88,0,.88,1]:
                        lift=ridge*(1-abs(offset))
                        vertices.append(center+side*offset*half_width+Vector((0,0,lift)))
                for row in range(rows-1):
                    for column in range(4):
                        a=row*5+column
                        faces.append((a,a+1,a+6,a+5))
                leaf=mesh(f"Living yucca blade ring {layer+1} — {index+1:02d}",vertices,faces,agave,True)
                leaf.data.materials.append(agave_edge)
                for face in leaf.data.polygons:
                    # Narrow waxy margins, with a dry terminal spine. Color is
                    # restrained; broad central faces retain the muted sage body.
                    if face.index%4 in [0,3] or (layer<2 and index%3!=0 and face.index>=48):face.material_index=1
                mod=leaf.modifiers.new("Solid waxy leaf thickness","SOLIDIFY")
                mod.thickness=.0018
                bpy.context.view_layer.objects.active=leaf
                bpy.ops.object.modifier_apply(modifier=mod.name)
        # Papery, bent basal leaves sit close to the earth, not on a circular
        # soil disc. Their tapered silhouettes break the planted-object seam.
        for index in range(9):
            angle=index*2.3999632297+rng.uniform(-.12,.12)
            reach=rng.uniform(.19,.34)
            verts=[]
            for row in range(7):
                t=row/6
                heading=angle+.17*math.sin(t*math.pi)
                radial=.035+reach*t
                center=Vector((math.cos(heading)*radial,math.sin(heading)*radial,
                               .013+.048*(1-t)+.024*math.sin(t*math.tau)))
                side=Vector((-math.sin(heading),math.cos(heading),0))
                width=.013*(1-t)+.0004
                verts.extend([center-side*width,center+Vector((0,0,.0025)),center+side*width])
            faces=[]
            for row in range(6):
                for column in range(2):
                    a=row*3+column;faces.append((a,a+1,a+4,a+3))
            leaf=mesh("Curled dry basal leaf",verts,faces,wood,True)
            mod=leaf.modifiers.new("Dry leaf thickness","SOLIDIFY");mod.thickness=.0008
            bpy.context.view_layer.objects.active=leaf
            bpy.ops.object.modifier_apply(modifier=mod.name)

    def bake_sign_face():
        """Rasterize our own editable glyph polygons onto one enamel surface.

        Thin geometry acquired shadow/depth artifacts in live street views even
        after a millimeter-offset fix. A color texture has no separate depth or
        shadow silhouette, and mipmaps preserve its lettering at long distance.
        This rasterizer uses authored vector polygons, not a font or image model.
        """
        width,height=1024,512
        supersample=2
        mask=bytearray(width*height*supersample*supersample)
        x0,z0=-1.33,1.14
        sx,sz=width/2.66,height/1.38
        original=[]
        svg=[]
        def srgb(value):
            return round(255*(12.92*value if value<=.0031308 else 1.055*value**(1/2.4)-.055))
        green_rgb=tuple(srgb(c) for c in green.diffuse_color[:3])
        cream_rgb=tuple(srgb(c) for c in cream.diffuse_color[:3])
        orange_rgb=tuple(srgb(c) for c in orange.diffuse_color[:3])
        def rgb_hex(rgb):return "#"+"".join(f"{c:02x}" for c in rgb)
        for obj in bpy.context.scene.objects:
            if not obj.name.startswith("Original lettering"):continue
            original.append(obj)
            points=[obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
            if min(point.y for point in points)>=0:continue
            svg.append(f'<g aria-label="{html.escape(obj.name.split(" — ")[-1],quote=True)}">')
            for face in obj.data.polygons:
                polygon=[((points[i].x-x0)*sx*supersample,(points[i].z-z0)*sz*supersample) for i in face.vertices]
                svg.append('<polygon points="'+" ".join(f'{x/supersample:.3f},{height-y/supersample:.3f}' for x,y in polygon)+'"/>')
                min_x=max(0,math.floor(min(p[0] for p in polygon)))
                max_x=min(width*supersample-1,math.ceil(max(p[0] for p in polygon)))
                min_y=max(0,math.floor(min(p[1] for p in polygon)))
                max_y=min(height*supersample-1,math.ceil(max(p[1] for p in polygon)))
                edges=list(zip(polygon,polygon[1:]+polygon[:1]))
                for y in range(min_y,max_y+1):
                    for x in range(min_x,max_x+1):
                        cross=[(b[0]-a[0])*(y+.5-a[1])-(b[1]-a[1])*(x+.5-a[0]) for a,b in edges]
                        if all(value>=-1e-7 for value in cross) or all(value<=1e-7 for value in cross):
                            mask[y*width*supersample+x]=255
            svg.append('</g>')
        texture_path=root/"assets/textures/arroyo-club-sign.png"
        source_svg=root/"assets/source/activity-sign.svg"
        stripe_x=( -1.265-x0)*sx
        stripe_y=height-(2.381-z0)*sz
        source_svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512">\n<!-- Original authored geometry; GPL-3.0-or-later. No font data. -->\n<rect width="1024" height="512" fill="{rgb_hex(green_rgb)}"/>\n<rect x="{stripe_x:.3f}" y="{stripe_y:.3f}" width="{2.53*sx:.3f}" height="{.19*sz:.3f}" fill="{rgb_hex(orange_rgb)}"/>\n<g fill="{rgb_hex(cream_rgb)}">\n'+"\n".join(svg)+'\n</g>\n</svg>\n')
        pixels=bytearray(width*height*4)
        for y in range(height):
            z=z0+(y+.5)/sz
            for x in range(width):
                world_x=x0+(x+.5)/sx
                base=orange_rgb if abs(world_x)<1.265 and 2.191<z<2.381 else green_rgb
                # Restrained enamel mottling, much quieter than the letters.
                grain=((x*73856093 ^ y*19349663)%9-4)*.004
                coverage=sum(mask[(y*2+dy)*width*2+x*2+dx] for dy in range(2) for dx in range(2))/1020
                offset=((height-1-y)*width+x)*4
                for channel in range(3):
                    pixels[offset+channel]=max(0,min(255,round(base[channel]*(.985+grain)*(1-coverage)+cream_rgb[channel]*coverage)))
                pixels[offset+3]=255
        def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
        rows=b''.join(b'\0'+pixels[y*width*4:(y+1)*width*4] for y in range(height))
        texture_path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',width,height,8,6,0,0,0))+chunk(b'sRGB',b'\0')+chunk(b'IDAT',zlib.compress(rows,9))+chunk(b'IEND',b''))
        image=bpy.data.images.load(str(texture_path),check_existing=False)
        image.name="Original Arroyo enamel face"
        image.pack()
        image.use_fake_user=True
        return image,original

    def flatten_sign_face(image,original):
        for obj in original:
            bpy.data.objects.remove(obj,do_unlink=True)
        stripe=bpy.data.objects.get("Orange club stripe")
        if stripe:bpy.data.objects.remove(stripe,do_unlink=True)
        panel=bpy.data.objects.get("Enamel face panel")
        mat=material("activity-sign-face",(1,1,1),.73,.10)
        texture=mat.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image=image
        multiply=next(node for node in mat.node_tree.nodes if node.bl_idname=="ShaderNodeMix")
        mat.node_tree.links.new(texture.outputs["Color"],multiply.inputs[6])
        panel.data.materials.clear()
        panel.data.materials.append(mat)
        uv=panel.data.uv_layers.active
        for face in panel.data.polygons:
            for loop in face.loop_indices:
                point=panel.matrix_world @ panel.data.vertices[panel.data.loops[loop].vertex_index].co
                uv.data[loop].uv=((point.x+1.33)/2.66,(point.z-1.14)/1.38) if face.normal.y<-.5 else (.02,.02)

    def finish(name):
        bpy.context.view_layer.update()
        editable_components=sum(1 for obj in bpy.context.scene.objects if obj.type=="MESH")
        for obj in list(bpy.context.scene.objects):
            if obj.type != "MESH":
                continue
            # Runtime shared maps are meter-scaled UVs, with the long grain of the
            # bench aligned along each slat. Every mesh carries neutral vertex wear.
            uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
            for polygon in obj.data.polygons:
                axis=max(range(3),key=lambda i:abs(polygon.normal[i]))
                axes=[i for i in range(3) if i != axis]
                for loop in polygon.loop_indices:
                    point=obj.matrix_world @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    uv.data[loop].uv=(point[axes[0]]*.7,point[axes[1]]*.7)
            # Creating a CustomData layer can invalidate an existing Blender RNA
            # UV handle. Finish UV writes before allocating Color; interleaving
            # them silently corrupted vertex colors with world-space UV values.
            color=obj.data.color_attributes.new(name="Color",type="FLOAT_COLOR",domain="CORNER")
            obj.data.color_attributes.active_color=color
            for polygon in obj.data.polygons:
                for loop in polygon.loop_indices:
                    point=obj.matrix_world @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    shade=.93+.055*noise.noise(Vector((point.x*3.3,point.y*3.3,point.z*3.3)))
                    shade-=.12*math.exp(-max(0,point.z-.05)*5)
                    if name == "activity-planter" and obj.name.startswith("Hollow"):
                        shade-=.10*max(0,noise.noise(Vector((point.x*13,point.y*13,point.z*.8))))
                    if obj.name.startswith("Original lettering"):
                        shade=1
                    color.data[loop].color=(shade,shade*.991,shade*.974,1)
        # Editable sources retain every individually named component and original
        # glyph mesh. Export material-merges happen in memory after saving source.
        face_bake=bake_sign_face() if name=="activity-board" else None
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.wm.save_as_mainfile(filepath=str(source/(name+".blend")),compress=True)
        if face_bake:flatten_sign_face(*face_bake)
        groups={}
        for obj in bpy.context.scene.objects:
            if obj.type=="MESH":groups.setdefault(tuple(obj.data.materials),[]).append(obj)
        for signature,group in groups.items():
            bpy.ops.object.select_all(action="DESELECT")
            for obj in group:obj.select_set(True)
            bpy.context.view_layer.objects.active=group[0]
            bpy.ops.object.join()
            group[0].name=" + ".join(mat.name for mat in signature)
            # Avoid auto-incremented Cube/Cone data names depending on whether
            # preview cameras/ground were created between exports.
            group[0].data.name=name+" / "+group[0].name
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=str(output/(name+".glb")),export_format="GLB",export_materials="EXPORT",export_yup=True,export_animations=False)
        if face_bake:face_bake[0].use_fake_user=False
        bpy.context.view_layer.update()
        points=[obj.matrix_world @ Vector(corner) for obj in bpy.context.scene.objects if obj.type=="MESH" for corner in obj.bound_box]
        lo=[min(p[i] for p in points) for i in range(3)]
        hi=[max(p[i] for p in points) for i in range(3)]
        triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in bpy.context.scene.objects if obj.type=="MESH")
        result={"asset":name,"bounds":{"min":lo,"max":hi},"triangles":triangles,"bytes":(output/(name+".glb")).stat().st_size,"editableComponents":editable_components}
        print("ACTIVITY_ASSET "+json.dumps(result))
        if preview:
            render_preview(name,lo,hi)
        return result

    def render_preview(name,lo,hi):
        # Honest Cycles authoring preview. This is not a live-game screenshot.
        scene=bpy.context.scene
        scene.render.engine="CYCLES"
        scene.cycles.samples=32
        scene.cycles.use_denoising=True
        scene.render.resolution_x=1200
        scene.render.resolution_y=1000
        scene.render.resolution_percentage=100
        scene.view_settings.view_transform="AgX"
        scene.world=bpy.data.worlds.new("Activity asset authoring sky")
        scene.world.use_nodes=True
        scene.world.node_tree.nodes.get("Background").inputs[0].default_value=(.40,.54,.68,1)
        scene.world.node_tree.nodes.get("Background").inputs[1].default_value=.45
        box("Authoring ground",(0,0,-.10),(200,200,.19),concrete)
        # Ground was added after baked-color preparation; give it a neutral field.
        ground=bpy.context.object
        if ground.type=="MESH":
            attr=ground.data.color_attributes.new(name="Color",type="FLOAT_COLOR",domain="CORNER")
            for item in attr.data:item.color=(1,1,1,1)
        bpy.ops.object.light_add(type="AREA",location=(-3,-4,6))
        light=bpy.context.object
        light.data.energy=600
        light.data.shape="DISK"
        light.data.size=4.0
        light.data.color=(1,.79,.60)
        target=Vector((0,0,(lo[2]+hi[2])*.5))
        light.rotation_euler=(target-light.location).to_track_quat("-Z","Y").to_euler()
        bpy.ops.object.camera_add()
        camera=bpy.context.object
        size=max(hi[i]-lo[i] for i in range(3))
        camera.location=target+Vector((size*1.08,-size*1.78,size*.72))
        camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
        camera.data.type="ORTHO"
        camera.data.ortho_scale=size*1.36
        scene.camera=camera
        scene.render.image_settings.file_format="PNG"
        scene.render.filepath=str(evidence/(name+".png"))
        bpy.ops.render.render(write_still=True)

    report=[]
    for index,(name,builder) in enumerate([("activity-board",board),("activity-pylon",pylon),("activity-bench",bench),("activity-planter",planter),("activity-yucca",yucca)]):
        if only and name != only:continue
        rng.seed(9020+index*1337)
        builder()
        report.append(finish(name))
    (evidence/"asset-authoring-audit.json").write_text(json.dumps({"blender":bpy.app.version_string,"units":"meters; Z-up; fronts -Y","assets":report},indent=2)+"\n")


build_activity_kit()
