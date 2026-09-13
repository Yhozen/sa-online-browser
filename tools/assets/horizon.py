# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Blender watershed sculpt; exports authoritative terrain elevations.

Run: /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/assets/horizon.py
The scene is editable authoring source, not a game screenshot or a new collision surface.
"""
import bpy, math, json, pathlib, hashlib, datetime, argparse, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-root', type=pathlib.Path, default=ROOT,
                    help='Stage the complete terrain export outside the live assets directory.')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT = args.output_root.resolve() / 'assets' / 'horizon-relief.json'
SOURCE = args.output_root.resolve() / 'assets' / 'source'
OUT.parent.mkdir(parents=True, exist_ok=True)
SEGMENTS, RINGS = 480, 60

def clamp(x, a=0, b=1): return min(b, max(a, x))
def smooth(a, b, x):
    t = clamp((x-a)/(b-a))
    return t*t*(3-2*t)
def fract(x): return x-math.floor(x)
def hashed(x,y): return fract(math.sin(x*127.1+y*311.7)*43758.5453)
def noise(x,y):
    ix,iy=math.floor(x),math.floor(y)
    u,v=fract(x),fract(y); u=u*u*(3-2*u);v=v*v*(3-2*v)
    return (hashed(ix,iy)*(1-u)+hashed(ix+1,iy)*u)*(1-v)+(hashed(ix,iy+1)*(1-u)+hashed(ix+1,iy+1)*u)*v

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
layers=[]
for layer in range(3):
    vertices=[]; faces=[]; relief=[]; mineral=[]; vegetation=[]; accepted=[]; flanks=[]
    for j in range(RINGS+1):
        for i in range(SEGMENTS+1):
            a=i/SEGMENTS*math.tau; t=j/RINGS; width=90+layer*50
            r=250+layer*125-width*.47+t*width; x,y=math.cos(a)*r,math.sin(a)*r
            broad=(34+layer*13+22*math.sin(a*3+layer)+15*math.sin(a*7+1.2))*.45
            crest=.47+(noise(math.cos(a)*4+layer,math.sin(a)*4)-.5)*.15
            slope=max(0,1-abs((t-crest)/(crest if t<crest else 1-crest)))
            profile=math.sin(slope*math.pi/2)**1.15
            # Reconstruct the accepted base only to lock its exact crest band.
            basin=a*13+noise(x/62,y/62)*.73+t*.22
            channel=abs(fract(basin)-.5); gully=math.exp(-channel*channel*(36+110*t))
            tributary=abs(fract(basin*2.07+noise(x/28,y/28)*.45)-.5)
            rill=math.exp(-tributary*tributary*140); shoulder=min(1,channel*2)**.55
            ridge_break=(noise(x/11,y/11)-.5)*3.4+(noise(x/3.1,y/3.1)-.5)
            erosion=profile**.7*(1-.8*slope**6)
            base=max(-3,broad*profile+(shoulder*2.8-gully*3-rill*1.4+ridge_break*.55)*erosion-6)
            baseline_flank=smooth(.33,.71,noise(x/47+9.2,y/47-3.1))*1.65*math.sin(slope*math.pi)**2*profile*(1-smooth(.55,.78,slope))
            accepted.append(base)
            flanks.append(baseline_flank)
            # Forty-four connected drainages wrap the ridge. Two tributaries
            # converge into each wash; their uncut shoulders remain continuous
            # sandstone spurs rather than independent conical mounds.
            watershed=a/math.tau*(44+layer*8)+.22*math.sin(a*5+layer)
            watershed+=(1-slope)*(.25*math.sin(a*9+layer)+.11*math.sin(slope*5+a*3))
            cross=fract(watershed+.5)-.5
            trunk=math.exp(-(cross/(.055+.11*(1-slope)))**2)
            fork=.28*slope**.7
            tributaries=math.exp(-(min(abs(cross-fork),abs(cross+fork))/(.023+.027*(1-slope)))**2)
            flank=math.sin(math.pi*slope)**.85
            # Broad planar shoulders replace the inflated dome profile; deeper
            # washes expose coherent inclined mineral faces between the spurs.
            planar=max(0,profile-slope)*max(0,broad)*.68*(1-smooth(.8,.99,slope))
            drainage=(trunk*.25+tributaries*.085)*max(6,broad)*flank
            bed=smooth(.24,.44,slope)*(1-smooth(.70,.90,slope))
            outcrop=(.55+.25*math.sin(a*11+layer)+.20*math.sin(a*23-slope*2))
            ledge=bed*smooth(.34,.72,outcrop)*(1-trunk*.8)
            cut=max(0,planar+drainage+ledge*1.55)
            rock=clamp(.24+bed*.45+ledge*.35-trunk*.3-tributaries*.12)
            scrub=clamp(trunk*.72+tributaries*.32+(1-bed)*.10)
            relief.append(round(cut,3)); mineral.append(round(rock*255)); vegetation.append(round(scrub*255))
            vertices.append((x,y,9+max(-3,base-baseline_flank-relief[-1])*.84))
            if j<RINGS and i<SEGMENTS:
                k=j*(SEGMENTS+1)+i
                faces.extend([(k,k+SEGMENTS+1,k+1),(k+1,k+SEGMENTS+1,k+SEGMENTS+2)])
    locked=0
    for i in range(SEGMENTS+1):
        # The previous one-metre lock retained an inflated, featureless roof:
        # it covered almost the entire band visible above the perimeter trees.
        # Keep its exact crown line. A rounded, slope-limited transition carries
        # weathering into the adjacent band without isolated pointed teeth.
        crown=max(range(RINGS+1), key=lambda j: accepted[j*(SEGMENTS+1)+i])
        height=accepted[crown*(SEGMENTS+1)+i]
        # The published surface retained the entire upper metre. Reconstruct it
        # so the new rounded shoulder cannot raise any existing terrain point.
        old_heights=[9+accepted[j*(SEGMENTS+1)+i]*.84
                     if accepted[j*(SEGMENTS+1)+i]*.84>=height*.84-1
                     else vertices[j*(SEGMENTS+1)+i][2] for j in range(RINGS+1)]
        a=i/SEGMENTS*math.tau
        for j in range(RINGS+1):
            k=j*(SEGMENTS+1)+i
            if j==crown:
                relief[k]=0; flanks[k]=0
                locked+=1
                mineral[k]=217; vegetation[k]=6
            else:
                distance=abs(j-crown)/(crown if j<crown else RINGS-crown)
                # A piecewise linear cross-section creates a shallow upper
                # shoulder, a steep exposed face, and a broad lower apron.
                # Unlike a sine dome, its crest-adjacent normals catch the sun.
                roof_drop=(.92*min(distance,.14)
                           +1.42*clamp(distance-.14,0,.28)
                           +.81655172414*max(0,distance-.42))
                # Interlocking 18–28 major folds have 2–3 smaller angular
                # tributaries each. Their diagonal paths share the crown but
                # split on the flank; triangular sections form real planes.
                fold=a/math.tau*(18+layer*5)+.16*math.sin(a*5+layer)
                fold+=distance*(.42*math.sin(a*7+layer)+.21)
                valley=max(0,1-abs(fract(fold+.5)-.5)/.32)
                branch=fold*2.87+.19*math.sin(a*13+distance*2)+distance*.7
                tributary=max(0,1-abs(fract(branch+.5)-.5)/.26)
                upper_fold=math.sin(math.pi*distance)**.72
                fold_depth=((2.8+max(0,height)*.11)*valley
                            +(2.8+max(0,height)*.12)*tributary)*upper_fold
                roof=height-(height+3)*roof_drop-fold_depth
                relief[k]=round(max(relief[k],accepted[k]-flanks[k]-roof),3)
                # Begin with a rounded crown: zero derivative at the crown,
                # easing over three metres toward a 36-degree radial slope.
                # A smooth saturating limit avoids the normal discontinuity of
                # clipping an already-deep cut beside a single locked point.
                # Adjacent azimuths can choose neighboring radial crown rings.
                # Keep the intervening grid strip connected before easing the
                # cut; otherwise the fixed triangle diagonal makes little teeth.
                cell=(90+layer*50)/RINGS
                metres=max(0,abs(j-crown)*cell-min(3.5,cell*1.25))
                crown_drop=math.tan(math.radians(36))*(math.hypot(metres,3)-3)
                published_drop=9+height*.84-old_heights[j]
                available=max(0,crown_drop-published_drop)
                proposed=9+max(-3,accepted[k]-flanks[k]-relief[k])*.84
                desired=max(0,old_heights[j]-proposed)
                weathering=available*math.tanh(desired/available) if available>1e-9 else 0
                rounded=old_heights[j]-weathering
                relief[k]=math.ceil(max(0,accepted[k]-flanks[k]-(rounded-9)/.84)*10000)/10000
                # Exposed upper shoulders remain mineral all the way to the
                # crest. Scrub follows the lower drainage instead of tinting
                # every high, visible face the same dusty beige.
                upper=1-smooth(.22,.70,distance)
                mineral[k]=round(clamp(.46+upper*.39-valley*.19+tributary*.06)*255)
                vegetation[k]=round(clamp((valley*.31+tributary*.10)*smooth(.10,.65,distance)+.025)*255)
            vertices[k]=(vertices[k][0],vertices[k][1],9+max(-3,accepted[k]-flanks[k]-relief[k])*.84)
    # The accepted surface above is the envelope, not the finished sculpt.
    # Weathering crosses the upper visible shoulders and crown itself. This
    # removes the previously protected roof while every new point stays inside
    # the old surface. The 24-30 metre watersheds have connected 4-8 metre cuts;
    # tributaries divide upslope and converge into a common lower wash.
    crown_cuts=[]
    watershed_count=(64,88,104)[layer]
    for i in range(SEGMENTS+1):
        crown=max(range(RINGS+1), key=lambda j: accepted[j*(SEGMENTS+1)+i])
        a=i/SEGMENTS*math.tau
        for j in range(RINGS+1):
            k=j*(SEGMENTS+1)+i
            metres=abs(j-crown)*width/RINGS
            distance=abs(j-crown)/(crown if j<crown else RINGS-crown)
            side=-1 if j<crown else 1
            # Meandering trunk: paired forks feed it toward the lower apron.
            phase=a/math.tau*watershed_count+.62*math.sin(a*9+layer)+.22*math.sin(a*21-1.2)
            phase+=side*(.58*math.sin(a*5+layer)+.24)*smooth(0,14,metres)
            cross=fract(phase+.5)-.5
            trunk=math.exp(-(cross/(.135+.045*smooth(0,16,metres)))**2)
            separation=.31*(1-smooth(0,12,metres))
            forks=math.exp(-(min(abs(cross-separation),abs(cross+separation))/.085)**2)
            apron=1-smooth(.72,.99,distance)
            # A crown wash is shallow and smooth, then deepens within nine
            # metres, where the final camera can actually see its plane walls.
            amplitude=.5+6.9*smooth(1,9,metres)
            trunk_cut=amplitude*trunk
            branch_cut=3.0*smooth(0,3.5,metres)*forks*(1-smooth(10,18,metres))
            extra=min(8,trunk_cut+branch_cut)*apron
            old=vertices[k][2]
            new=max(9-3*.84,old-extra)
            cut=old-new
            relief[k]=round(relief[k]+cut/.84,6)
            vertices[k]=(vertices[k][0],vertices[k][1],new)
            mineral[k]=round(clamp(mineral[k]/255+.16*trunk-.07*forks)*255)
            vegetation[k]=round(clamp(vegetation[k]/255+trunk*.08*smooth(.12,.72,distance))*255)
            if j==crown: crown_cuts.append(cut)
    # Close the duplicate 0/2-pi angular samples. The inherited base noise
    # was not periodic and left a radial crack through otherwise connected
    # terrain. Join to the lower endpoint, then fade this subtractive wash over
    # just four angular cells on either side (three degrees each way).
    # Everything outside this narrow strip remains byte-for-byte unchanged.
    seam_columns=4
    seam_maximum_cut=0.0
    for j in range(RINGS+1):
        first=j*(SEGMENTS+1); last=first+SEGMENTS
        seam_z=min(vertices[first][2],vertices[last][2])
        seam_mineral=(mineral[first]+mineral[last])/2
        seam_vegetation=(vegetation[first]+vegetation[last])/2
        for offset in range(seam_columns+1):
            retain=smooth(0,seam_columns,offset)
            for i in (offset,SEGMENTS-offset):
                k=first+i
                old=vertices[k][2]
                joined=min(old,seam_z+(old-seam_z)*retain)
                seam_maximum_cut=max(seam_maximum_cut,old-joined)
                vertices[k]=(vertices[k][0],vertices[k][1],joined)
                mineral[k]=round(seam_mineral+(mineral[k]-seam_mineral)*retain)
                vegetation[k]=round(seam_vegetation+(vegetation[k]-seam_vegetation)*retain)
    # The seam is an explicit repair of the inherited open boundary; keep its
    # deeper local crown lowering distinct from the <=0.5m authored crown cuts.
    final_crown_cuts=[]
    for i in range(SEGMENTS+1):
        crown=max(range(RINGS+1),key=lambda j: accepted[j*(SEGMENTS+1)+i])
        k=crown*(SEGMENTS+1)+i
        final_crown_cuts.append(9+accepted[k]*.84-vertices[k][2])
    mesh=bpy.data.meshes.new(f'Watershed mesh {layer}');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(f'Arroyo authored watershed {layer}',mesh);bpy.context.collection.objects.link(obj)
    colors=mesh.color_attributes.new(name='Geological cover',type='FLOAT_COLOR',domain='POINT')
    for k,color in enumerate(colors.data):
        rock=mineral[k]/255; green=vegetation[k]/255
        color.color=(.53+rock*.16-green*.22,.42+rock*.13-green*.10,.28+rock*.10-green*.15,1)
    for polygon in mesh.polygons: polygon.use_smooth=True
    material=bpy.data.materials.new(f'Sandstone and chaparral {layer}');material.use_nodes=True
    nodes=material.node_tree.nodes; attr=nodes.new('ShaderNodeAttribute');attr.attribute_name='Geological cover'
    material.node_tree.links.new(attr.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
    nodes.get('Principled BSDF').inputs['Roughness'].default_value=1
    obj.data.materials.append(material)
    layers.append({'elevation':[float(vertex.co.z)-9 for vertex in mesh.vertices],
                   'mineral':mineral,'vegetation':vegetation,'lockedVertices':0,
                   'watershedCount':watershed_count,'maximumCrownCut':max(final_crown_cuts),
                   'maximumAuthoredCrownCutBeforeSeamRepair':max(crown_cuts),
                   'seamBlendColumns':seam_columns,'maximumSeamRepairCut':seam_maximum_cut})

OUT.write_text(json.dumps({'version':3,'segments':SEGMENTS,'rings':RINGS,'layers':layers},separators=(',',':'))+'\n')
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'horizon.blend'),compress=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(SOURCE/'horizon-build.json').write_text(json.dumps({
    'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'blenderVersion':bpy.app.version_string,'blenderBuild':bpy.app.build_hash.decode(),
    'blenderExecutable':bpy.app.binary_path,'blenderExecutableSha256':sha(pathlib.Path(bpy.app.binary_path)),
    'recipe':'tools/assets/horizon.py','recipeSha256':sha(pathlib.Path(__file__)),
    'relief':'assets/horizon-relief.json','reliefSha256':sha(OUT),
    'sourceSha256':sha(SOURCE/'horizon.blend'),'triangles':len(faces)*3,
    'notes':'Original connected 24-30 metre watersheds with 4-8 metre trunk cuts and tributaries sculpted through visible upper faces. Smooth authored crown cuts up to 0.5 metres replace the protected roof. The inherited angular seam is closed with a subtractive lower-envelope wash blended across four columns on each side; its local crown lowering is reported separately. No vertex rises above the previous surface. Three meshes, XY coordinates, radial footprint and topology retained. Exported elevations are authoritative Blender mesh coordinates relative to ground Z=9.'
},indent=2)+'\n')
print('HORIZON_EXPORT',json.dumps({'bytes':OUT.stat().st_size,'triangles':len(faces)*3,'lockedVertices':[x['lockedVertices'] for x in layers]}))
