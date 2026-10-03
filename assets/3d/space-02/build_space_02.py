"""WIN DESIGN Space 02: editable bedroom diorama in Space 01's camera family."""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from premium_finish import make_curtain, make_leaf, refine_room
bpy.ops.wm.read_factory_settings(use_empty=True)

def coll(name):
    c=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c

ARCH=coll('01_ARCH_EmptyBedroom')
WARDROBE=coll('02_JOINERY_Wardrobe')
HEAD=coll('03_JOINERY_Headboard')
BED=coll('04_FURN_Bedroom')
SOFT=coll('05_SOFT_BeddingCurtains')
DECOR=coll('06_DECOR_Objects')
LIGHT=coll('07_LIGHTS')
EXT=coll('08_EXT_WindowView')

def mat(name,c,r=.7,m=0,trans=0,em=0):
    a=bpy.data.materials.new(name); a.diffuse_color=(*c,1); a.use_nodes=True
    n=a.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=(*c,1); n.inputs['Roughness'].default_value=r
    n.inputs['Metallic'].default_value=m; n.inputs['Transmission Weight'].default_value=trans
    if em:
        n.inputs['Emission Color'].default_value=(*c,1)
        n.inputs['Emission Strength'].default_value=em
    return a

plaster=mat('MAT_01_Warm plaster',(0.82,.79,.72),.83)
wall=mat('MAT_02_Cream limewash',(0.75,.72,.65),.88)
floor=mat('MAT_03_Satin pale oak floor',(0.55,.43,.30),.65)
floor_seam=mat('MAT_04_Floor joint',(0.39,.31,.23),.80)
cut=mat('MAT_05_Cut architectural edge',(.66,.62,.55),.8)
oak=mat('MAT_06_Light oak',(0.54,.39,.24),.58)
oak_edge=mat('MAT_07_Oak grain edge',(.46,.31,.18),.62)
cream=mat('MAT_08_Matte ivory cabinet',(0.69,.64,.54),.57)
stone=mat('MAT_09_Honed warm stone',(.78,.75,.69),.48)
bronze=mat('MAT_10_Dark brushed bronze',(.16,.15,.13),.42,.72)
fabric=mat('MAT_11_Greige woven upholstery',(.62,.58,.51),.93)
linen=mat('MAT_12_Washed ivory linen',(.79,.75,.68),.96)
rust=mat('MAT_13_Muted russet cushion',(.47,.35,.28),.91)
rug=mat('MAT_14_Wool oatmeal rug',(.65,.62,.55),1)
glass=mat('MAT_15_Window glass',(.52,.65,.64),.20,0,.22)
glow=mat('MAT_16_Warm LED diffuser',(1,.74,.42),.6,0,0,2.5)
sage=mat('MAT_17_Foliage',(.29,.36,.28),.79)

def put(obj,c):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    c.objects.link(obj); return obj
def edge(obj,r=.012,segments=3):
    if r:
        b=obj.modifiers.new('Small crafted edge radius','BEVEL'); b.width=r; b.segments=segments
        n=obj.modifiers.new('Continuous weighted normals','WEIGHTED_NORMAL'); n.keep_sharp=True
    return obj
def box(name,c,xyz,dims,m,r=.012,seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz); o=put(bpy.context.object,c); o.name=name
    o.dimensions=dims; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(m); return edge(o,r,seg)
def cyl(name,c,xyz,r,depth,m,verts=64,round=.012):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=xyz)
    o=put(bpy.context.object,c);o.name=name;o.data.materials.append(m)
    for face in o.data.polygons:face.use_smooth=True
    return edge(o,round)
def cushion(name,c,xyz,dims,m,round=.08):
    o=box(name,c,xyz,dims,m,round,6)
    for face in o.data.polygons:face.use_smooth=True
    return o
def path(name,c,points,r,m):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=3
    spl=curve.splines.new('POLY');spl.points.add(len(points)-1)
    for p,xyz in zip(spl.points,points):p.co=(*xyz,1)
    o=bpy.data.objects.new(name,curve);c.objects.link(o);o.data.materials.append(m);return o

# Familiar 7.8 by 6.3 m cutaway proportions, but a distinctly private room.
box('ARCH_Bedroom structural floor',ARCH,(0,0,-.10),(7.8,6.3,.20),cut,.045)
box('ARCH_Bedroom oak floating floor',ARCH,(0,0,.009),(7.72,6.22,.024),floor,.009)
for i in range(1,18):
    x=-3.84+i*.425
    box(f'ARCH_Oak plank joint {i:02d}',ARCH,(x,0,.022),(.006,6.06,.002),floor_seam,0)
for y in (-1.56,0,1.56):
    box(f'ARCH_Staggered cross joint {y:+.2f}',ARCH,(0,y,.022),(7.5,.004,.002),floor_seam,0)
box('ARCH_Bedroom back wall',ARCH,(0,3.17,1.46),(7.8,.18,2.92),plaster,.014)
box('ARCH_Bedroom left front pier',ARCH,(-3.88,-2.54,1.46),(.18,1.13,2.92),wall,.012)
box('ARCH_Bedroom left rear pier',ARCH,(-3.88,2.07,1.46),(.18,2.19,2.92),wall,.012)
box('ARCH_Bedroom window sill wall',ARCH,(-3.88,-.77,.43),(.18,2.42,.86),wall,.012)
box('ARCH_Bedroom window head',ARCH,(-3.88,-.77,2.65),(.18,2.42,.54),wall,.012)
box('ARCH_Bedroom glazing',ARCH,(-3.90,-.77,1.73),(.018,2.39,1.80),glass,.003)
for y in (-1.98,-.77,.43):
    box(f'ARCH_Window slim bronze mullion {y:+.2f}',ARCH,(-3.81,y,1.73),(.032,.030,1.82),bronze,.003)
for z in (.87,2.60):
    box(f'ARCH_Window horizontal rail {z:.2f}',ARCH,(-3.81,-.77,z),(.032,2.42,.032),bronze,.003)
box('ARCH_Back painted cornice',ARCH,(0,3.04,2.87),(7.55,.07,.035),stone,.006)
box('ARCH_Left painted cornice',ARCH,(-3.74,0,2.87),(.07,6.05,.035),stone,.006)
box('ARCH_Recessed ceiling cove reveal',ARCH,(.45,3.02,2.78),(5.9,.08,.025),oak_edge,.002)
box('ARCH_Skirting back',ARCH,(0,3.055,.09),(7.6,.033,.16),cut,.004)
box('ARCH_Curtain pocket',ARCH,(-3.67,-.77,2.84),(.06,2.44,.04),stone,.006)
sky=mat('MAT_18_Distant daylight sky',(.65,.73,.74),1)
far=mat('MAT_19_Distant residence',(.56,.60,.56),1)
box('EXT_Soft sky outside bedroom',EXT,(-4.55,-.78,1.80),(.025,2.48,1.75),sky,0)
for i,(y,h) in enumerate(((-1.67,.8),(-.61,.56),(.15,1.04))):
    box(f'EXT_Residence silhouette {i+1}',EXT,(-4.40,y,.85+h/2),(.09,.38,h),far,.006)

# Built-in wardrobe has real door gaps, exposed oak niche, pulls, plinth and crown.
box('JOINERY_Wardrobe left carcass',WARDROBE,(-2.67,2.80,1.37),(2.25,.56,2.60),oak_edge,.012)
for i,x in enumerate((-3.38,-2.67,-1.96)):
    box(f'JOINERY_Wardrobe full-height door {i+1}',WARDROBE,(x,2.506,1.39),(.686,.024,2.46),cream,.005)
    box(f'JOINERY_Wardrobe vertical bronze pull {i+1}',WARDROBE,(x+.245,2.485,1.43),(.012,.013,.22),bronze,.003)
    box(f'JOINERY_Wardrobe recessed door head reveal {i+1}',WARDROBE,(x,2.486,2.637),(.65,.006,.008),oak_edge,.001)
box('JOINERY_Wardrobe toe recess',WARDROBE,(-2.67,2.61,.10),(2.02,.34,.16),oak,.006)
box('JOINERY_Wardrobe tall oak end cheek',WARDROBE,(-1.53,2.79,1.40),(.045,.58,2.60),oak,.007)
box('JOINERY_Niche recessed back',WARDROBE,(-1.15,3.048,1.41),(.64,.032,2.38),oak_edge,.006)
for x in (-1.47,-.83):
    box(f'JOINERY_Niche solid oak side {x:+.2f}',WARDROBE,(x,2.82,1.41),(.038,.49,2.42),oak,.006)
for z in (.21,2.60):
    box(f'JOINERY_Niche structural cap {z:.2f}',WARDROBE,(-1.15,2.82,z),(.68,.49,.038),oak,.006)
for z in (.67,1.30,1.94):
    box(f'JOINERY_Niche shelf {z:.2f}',WARDROBE,(-1.15,2.81,z),(.60,.45,.040),oak,.006)
for z in (.235,.695,1.325,1.965):
    box(f'LIGHT_Niche concealed diffuser {z:.2f}',LIGHT,(-1.15,2.578,z),(.51,.012,.008),glow,.002)
box('JOINERY_Wardrobe crown',WARDROBE,(-2.33,2.80,2.73),(3.55,.62,.06),oak,.009)

# Upholstered headboard composition: stone side rails and softly upholstered bays.
box('JOINERY_Headboard recessed oak backing',HEAD,(1.51,3.028,1.28),(3.98,.08,2.38),oak,.013)
for i,(x,width,height) in enumerate(((-.18,.74,1.41),(.61,.78,1.47),(1.42,.77,1.44),(2.23,.78,1.48),(3.03,.73,1.42))):
    cushion(f'JOINERY_Headboard upholstered vertical bay {i+1}',HEAD,
            (x,2.952,1.35),(width,.087,height),fabric,.014)
    box(f'JOINERY_Headboard bay reveal {i+1}',HEAD,(x+width/2+.018,2.965,1.35),
        (.008,.027,1.49),oak_edge,.001)
box('JOINERY_Headboard light oak upper rail',HEAD,(1.50,2.940,2.18),(3.92,.067,.10),oak,.012)
box('JOINERY_Headboard lower oak shelf',HEAD,(1.50,2.975,.55),(3.94,.12,.10),oak,.011)
box('JOINERY_Headboard inset base shadow line',HEAD,(1.50,2.922,.488),(3.78,.012,.012),oak_edge,.002)
box('LIGHT_Headboard continuous warm cove',LIGHT,(1.50,2.943,2.255),(3.75,.019,.014),glow,.003)
for i,x in enumerate((-.25,3.13)):
    box(f'JOINERY_Bedside floating oak table {i+1}',HEAD,(x,2.47,.54),(.57,.49,.20),oak,.025)
    box(f'JOINERY_Bedside narrow drawer {i+1}',HEAD,(x,2.208,.55),(.52,.020,.14),cream,.007)
    box(f'JOINERY_Bedside drawer shadow line {i+1}',HEAD,(x,2.196,.63),(.46,.004,.005),oak_edge,.001)

# Dominant king bed: undercut frame, rounded upholstered head support,
# independently sculpted duvet, top sheet, pillows and small lumbar accents.
bed_to_headboard=.07
box('FURN_Bed low solid oak plinth',BED,(1.46,1.33+bed_to_headboard,.24),(2.72,3.12,.28),oak,.014,3)
box('FURN_Bed inset black shadow reveal',BED,(1.46,1.33+bed_to_headboard,.13),(2.48,2.82,.09),bronze,.015)
for x in (.38,2.54):
    for y in (.06,2.50):
        moved_y=y+bed_to_headboard
        box(f'FURN_Bed recessed support {x:.2f} {moved_y:.2f}',BED,(x,moved_y,.075),(.20,.28,.060),oak_edge,.007)
cushion('FURN_Bed upholstered mattress',BED,(1.46,1.30+bed_to_headboard,.475),(2.65,3.06,.19),fabric,.038)
# A lightly draped cover lies almost flush with the mattress; only its side
# hems and foot fold fall over the edge. Keep it clear of the bedside joinery.
cushion('SOFT_Bed flat woven duvet',SOFT,(1.46,1.025+bed_to_headboard,.57),(2.75,2.57,.038),linen,.012)
box('SOFT_Bed folded top-sheet edge',SOFT,(1.46,2.345+bed_to_headboard,.593),(2.50,.13,.012),linen,.004)
for i,(x,width,depth,height) in enumerate(((.78,.98,.24,.55),(2.14,.94,.20,.51))):
    # These are already against the upholstered face. Leave them in place so
    # the shifted mattress moves beneath them instead of pushing through it.
    pillow=cushion(f'SOFT_Standing pillow {i+1}',SOFT,(x,2.745,.80),(width,depth,height),linen,.05)
    pillow.rotation_euler.x=-.09 if i else -.12
cushion('SOFT_Tailored lumbar cushion',SOFT,(1.46,2.50+bed_to_headboard,.635),(1.63,.27,.16),rust,.04)
cushion('SOFT_Foot of bed folded wool throw',SOFT,(1.46,.24+bed_to_headboard,.606),(2.40,.44,.035),fabric,.012)
box('SOFT_Full bedroom wool rug',SOFT,(1.46,.46,.034),(3.72,4.80,.031),rug,.009,3)

# Compact writing / vanity station makes this a residential bedroom rather
# than a hotel room; all parts are separate for installation animation.
box('JOINERY_Vanity oak top',HEAD,(3.28,-1.31,.75),(.66,1.36,.055),oak,.035)
box('JOINERY_Vanity slim lower drawer',HEAD,(3.28,-1.31,.64),(.59,1.24,.15),cream,.016)
for y in (-1.79,-.84):
    cyl(f'FURN_Vanity dark leg {y:.2f}',BED,(3.42,y,.355),.023,.67,bronze,32,.004)
cyl('FURN_Vanity padded stool seat',BED,(2.87,-1.35,.45),.28,.14,fabric,64,.045)
cyl('FURN_Vanity stool support',BED,(2.87,-1.35,.225),.025,.41,bronze,32,.004)
box('DECOR_Vanity small bronzed tray',DECOR,(3.26,-1.42,.784),(.18,.28,.012),bronze,.008)

make_curtain('SOFT_Left linen bedroom curtain',SOFT,-3.67,-1.72,.44,linen)
make_curtain('SOFT_Right linen bedroom curtain',SOFT,-3.67,.20,.43,linen)

for i,x in enumerate((-.25,3.13)):
    path(f'LIGHT_Bedside hanging cord {i+1}',LIGHT,[(x,2.42,2.90),(x,2.42,1.49)],.006,bronze)
    shade=cyl(f'LIGHT_Bedside soft opal shade {i+1}',LIGHT,(x,2.42,1.43),.12,.20,linen,96,.052)
    shade.scale.z=.74
    cyl(f'LIGHT_Bedside lower warm diffuser {i+1}',LIGHT,(x,2.42,1.345),.075,.014,glow,64,.006)
for i,(x,y) in enumerate(((-2.2,.60),(.4,-1.15),(2.45,-1.10))):
    cyl(f'LIGHT_Bedroom recessed spot rim {i+1}',LIGHT,(x,y,2.879),.056,.018,bronze,48,.005)
    cyl(f'LIGHT_Bedroom recessed spot diffuser {i+1}',LIGHT,(x,y,2.865),.038,.009,glow,48,.003)

cyl('DECOR_Bedside ceramic cup',DECOR,(-.28,2.43,.69),.055,.12,stone,64,.018)
box('DECOR_Vanity folded letter',DECOR,(3.26,-1.31,.782),(.20,.32,.008),linen,.003)
cyl('DECOR_Wardrobe niche vessel',DECOR,(-1.15,2.75,.78),.07,.19,stone,64,.028)
box('DECOR_Wardrobe niche linen books',DECOR,(-1.15,2.76,1.343),(.30,.14,.044),linen,.004)
cyl('DECOR_Planter 00 floor vessel',DECOR,(-2.92,-1.96,.23),.19,.43,stone,64,.044)
path('DECOR_Planter 01 stems',DECOR,[(-2.92,-1.96,.43),(-2.91,-1.91,.82),(-2.85,-1.84,1.14)],.013,oak_edge)
for i in range(7):
    theta=i*math.tau/7
    make_leaf(f'DECOR_Planter 02 tapered leaf {i+1}',DECOR,
              (-2.90+.18*math.cos(theta),-1.94+.17*math.sin(theta),.83+(i%3)*.13),
              .25 + .02*(i%3),.10 + .015*(i%2),sage,theta)

def area(name,pos,power,size,color,target,second=None):
    ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.color=color
    ld.shape='RECTANGLE' if second else 'DISK';ld.size=size
    if second:ld.size_y=second
    ob=bpy.data.objects.new(name,ld);LIGHT.objects.link(ob);ob.location=pos
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()

world=bpy.data.worlds.new('Soft ivory photographic environment');bpy.context.scene.world=world;world.use_nodes=True
wn=world.node_tree.nodes;wl=world.node_tree.links
wn['Background'].inputs['Color'].default_value=(.79,.78,.73,1)
wn['Background'].inputs['Strength'].default_value=.28
ray=wn.new('ShaderNodeLightPath');paper=wn.new('ShaderNodeEmission')
paper.inputs['Color'].default_value=(1,.89,.74,1);paper.inputs['Strength'].default_value=1.55
mix=wn.new('ShaderNodeMixShader')
wl.new(ray.outputs['Is Camera Ray'],mix.inputs[0])
wl.new(wn['Background'].outputs[0],mix.inputs[1]);wl.new(paper.outputs[0],mix.inputs[2])
wl.new(mix.outputs[0],wn['World Output'].inputs[0])
area('LIGHT_Window soft daylight',(-4,-1,5.7),470,5.2,(.92,.96,1),(0,0,.7),3.7)
area('LIGHT_Studio soft key',(3.5,-4.5,7),260,5.1,(1,.96,.89),(0,0,.6),3.8)
area('LIGHT_Headboard warm bounce',(1.5,1.2,2.68),48,3.1,(1,.84,.70),(1.5,2.7,1.5),.6)
area('LIGHT_Bedroom soft fill',(2.9,-.8,4.1),100,3.4,(1,.96,.90),(1.4,-1,.7),2.2)

refine_room('bedroom')

camera_data=bpy.data.cameras.new('CAM_Orthographic editorial isometric')
camera=bpy.data.objects.new(camera_data.name,camera_data);bpy.context.scene.collection.objects.link(camera)
camera.location=(9.7,-11.5,9.2)
camera.rotation_euler=(Vector((0,0,1.08))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=19.8;camera_data.shift_x=-.18
scene=bpy.context.scene;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB';scene.render.filepath=str(ROOT/'win_space_02_preview.png')
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.25
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'win_space_02.blend'))
bpy.ops.render.render(write_still=True)
print('SPACE_02_RESULT',len([o for o in scene.objects if o.type=='MESH']),len(bpy.data.collections))
