"""WIN DESIGN Space 01 — editable miniature living / kitchen diorama.

Run in the installed Blender: blender -b --python build_space_01.py
All installation-stage pieces stay as individual meshes in named collections.
"""

import bpy
import math
import sys
from mathutils import Vector
from pathlib import Path


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from premium_finish import make_curtain, make_leaf, refine_room
BLEND = ROOT / "win_space_01.blend"
PREVIEW = ROOT / "win_space_01_preview.png"

bpy.ops.wm.read_factory_settings(use_empty=True)


def collection(name):
    group = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(group)
    return group


ARCH = collection("01_ARCH_EmptyRoom")
KITCHEN = collection("02_JOINERY_Kitchen")
LIVING = collection("03_JOINERY_LivingTV")
FURN = collection("04_FURN_Living")
SOFT = collection("05_SOFT_CurtainsRug")
DECOR = collection("06_DECOR_Objects")
LIGHTS = collection("07_LIGHTS")
OUTSIDE = collection("08_EXT_WindowView")


def material(name, rgb, roughness=0.6, metallic=0.0, transmission=0.0, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Transmission Weight"].default_value = transmission
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


ivory = material("MAT_01_Warm painted plaster", (0.82, 0.79, 0.72), 0.83)
wall_side = material("MAT_02_Cream limewash", (0.75, 0.72, 0.65), 0.88)
floor_mat = material("MAT_03_Pale limestone floor", (0.72, 0.68, 0.60), 0.74)
cut_mat = material("MAT_04_Cut architectural edge", (0.66, 0.62, 0.55), 0.8)
oak = material("MAT_05_Light natural oak", (0.54, 0.39, 0.24), 0.58)
oak_edge = material("MAT_06_Oak edge grain", (0.46, 0.31, 0.18), 0.62)
cream_cab = material("MAT_07_Matte oat cabinetry", (0.69, 0.64, 0.54), 0.57)
stone = material("MAT_08_Honed warm stone", (0.78, 0.75, 0.69), 0.48)
stone_edge = material("MAT_09_Stone edge", (0.68, 0.65, 0.59), 0.53)
bronze = material("MAT_10_Brushed dark bronze", (0.16, 0.15, 0.13), 0.42, 0.72)
fabric = material("MAT_11_Soft greige woven upholstery", (0.62, 0.58, 0.51), 0.93)
fabric_light = material("MAT_12_Boucle ivory cushion", (0.79, 0.75, 0.68), 0.96)
rug_mat = material("MAT_13_Wool oat rug", (0.65, 0.62, 0.55), 1.0)
sage = material("MAT_14_Muted sage", (0.29, 0.36, 0.28), 0.79)
clay = material("MAT_15_Unglazed ceramic", (0.60, 0.48, 0.37), 0.78)
black_glass = material("MAT_16_Quiet screen glass", (0.033, 0.043, 0.044), 0.23)
glass = material("MAT_17_Window glazing", (0.52, 0.65, 0.64), 0.2, 0.0, 0.22)
light_mat = material("MAT_18_Warm LED diffuser", (1.0, 0.74, 0.42), 0.6, 0, 0, 2.5)


def move_to(obj, group):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    group.objects.link(obj)
    return obj


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def bevel(obj, width=0.02, segments=3):
    if width:
        mod = obj.modifiers.new("Realistic small edge radii", "BEVEL")
        mod.width = width
        mod.segments = segments
        mod.affect = "EDGES"
        normal = obj.modifiers.new("Continuous weighted normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
    return obj


def box(name, group, location, dimensions, mat, radius=0.012, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = move_to(bpy.context.object, group)
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    bevel(obj, radius, segments)
    return obj


def cylinder(name, group, location, radius, depth, mat, vertices=64, bevel_width=0.012):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = move_to(bpy.context.object, group)
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    bevel(obj, bevel_width)
    return obj


def path(name, group, points, radius, mat, resolution=3):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, xyz in zip(spline.points, points):
        p.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    group.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def cushion(name, group, center, size, mat, radius=0.09):
    obj = box(name, group, center, size, mat, radius, 6)
    smooth(obj)
    return obj


def add_area(name, location, energy, size, color, target, size_y=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "RECTANGLE" if size_y else "DISK"
    data.size = size
    if size_y:
        data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    LIGHTS.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


# 7.6 x 6.2 m architectural shell. Camera-facing front and right stay open.
box("ARCH_Floor structural slab", ARCH, (0, 0, -0.10), (7.8, 6.3, 0.20), cut_mat, 0.045)
box("ARCH_Limestone floor finish", ARCH, (0, 0, 0.007), (7.72, 6.22, 0.023), floor_mat, 0.008)
for idx in range(1, 6):
    x = -3.86 + idx * 1.286
    box(f"ARCH_Tile joint {idx:02d}", ARCH, (x, 0, 0.021), (0.007, 6.1, 0.002), stone_edge, 0)
for idx in range(1, 4):
    y = -3.10 + idx * 1.55
    box(f"ARCH_Tile cross joint {idx:02d}", ARCH, (0, y, 0.021), (7.6, 0.007, 0.002), stone_edge, 0)

box("ARCH_Back wall", ARCH, (0, 3.17, 1.46), (7.8, 0.18, 2.92), ivory, 0.014)
# Window jambs span Y=-1.98..+.44. Both piers overlap their jamb by 5 mm;
# the former rear pier began at +.975, leaving a 535 mm full-height hole.
box("ARCH_Left wall front pier", ARCH, (-3.88, -2.54, 1.46), (0.18, 1.13, 2.92), wall_side, 0.002)
box("ARCH_Left wall rear pier", ARCH, (-3.88, 1.80, 1.46), (0.18, 2.73, 2.92), wall_side, 0.002)
box("ARCH_Window sill wall", ARCH, (-3.88, -0.77, 0.43), (0.18, 2.42, 0.86), wall_side, 0.002)
# The head meets the existing upper frame at Z=2.60; it no longer masks it.
box("ARCH_Window head", ARCH, (-3.88, -0.77, 2.76), (0.18, 2.42, 0.32), wall_side, 0.002)
box("ARCH_Window glazing", ARCH, (-3.90, -0.77, 1.73), (0.018, 2.39, 1.80), glass, 0.003)
for yy in (-1.98, -0.77, 0.43):
    box(f"ARCH_Window mullion {yy:+.2f}", ARCH, (-3.81, yy, 1.73), (0.035, 0.032, 1.82), oak_edge, 0.004)
for z in (0.87, 2.60):
    box(f"ARCH_Window rail {z:.2f}", ARCH, (-3.81, -0.77, z), (0.035, 2.42, 0.035), oak_edge, 0.004)
box("ARCH_Back plaster cornice", ARCH, (0, 3.04, 2.87), (7.55, 0.07, 0.035), stone, 0.006)
box("ARCH_Left plaster cornice", ARCH, (-3.74, 0, 2.87), (0.07, 6.05, 0.035), stone, 0.006)
box("ARCH_Back skirting", ARCH, (0, 3.055, 0.09), (7.6, 0.033, 0.16), stone_edge, 0.004)
box("ARCH_Left skirting front", ARCH, (-3.75, -2.52, 0.09), (0.033, 1.06, 0.16), stone_edge, 0.004)
box("ARCH_Left skirting rear", ARCH, (-3.75, 2.05, 0.09), (0.033, 2.09, 0.16), stone_edge, 0.004)

# The cutaway has no physical exterior backdrop. The former detached sky slab
# and miniature residence boxes protruded above the wall in the axonometric view.
# Keep the empty export collection for the established eight-stage asset contract;
# glazing, real window framing and directional daylight remain unchanged.

# Kitchen tall cabinetry, each body, door, toe kick and pull is independent.
box("JOINERY_Kitchen oak rail", KITCHEN, (-1.69, 3.025, 2.66), (4.18, 0.055, 0.045), oak, 0.006)
box("JOINERY_Kitchen pale stone backsplash", KITCHEN, (-1.05, 3.018, 1.18), (2.72, 0.045, 0.79), stone, 0.007)
for i, x in enumerate((-3.38, -2.70)):
    box(f"JOINERY_High cabinet carcass {i+1}", KITCHEN, (x, 2.83, 1.34), (.66, .47, 2.55), oak_edge, .012)
    box(f"JOINERY_High cabinet door {i+1}", KITCHEN, (x, 2.58, 1.35), (.625, .024, 2.50), cream_cab, .012)
    box(f"JOINERY_High cabinet pull {i+1}", KITCHEN, (x+.24, 2.559, 1.28), (.012, .012, .16), bronze, .003)
    box(f"JOINERY_High cabinet recessed toe support {i+1}", KITCHEN,
        (x, 2.83, .043), (.57, .37, .065), oak_edge, .004)
box("JOINERY_High cabinet vertical oak reveal", KITCHEN, (-3.03, 2.565, 1.34), (.025, .026, 2.5), oak, .002)
for i, x in enumerate((-1.89, -1.18, -.47, .24)):
    box(f"JOINERY_Lower cabinet carcass {i+1}", KITCHEN, (x, 2.73, .43), (.69, .58, .78), cream_cab, .008)
    box(f"JOINERY_Lower cabinet front {i+1}", KITCHEN, (x, 2.426, .47), (.655, .022, .69), oak, .012)
    box(f"JOINERY_Lower cabinet finger groove {i+1}", KITCHEN, (x, 2.411, .802), (.55, .004, .007), oak_edge, .001)
box("JOINERY_Lower cabinet recessed plinth", KITCHEN, (-.82, 2.78, .075), (3.34, .48, .14), oak_edge, .006)
box("JOINERY_Back run stone countertop", KITCHEN, (-.83, 2.70, .86), (3.38, .70, .06), stone, .023, 5)
box("JOINERY_Back run undercut shadow joint", KITCHEN, (-.83, 2.389, .822), (3.22, .009, .011), oak_edge, .001)
box("JOINERY_Cooktop 00 inset dark glass", KITCHEN, (-.81, 2.70, .893),
    (.66, .43, .009), black_glass, .008, 3)
for index,(x,y,radius) in enumerate(((-.98,2.57,.083),(-.63,2.57,.070),
                                     (-.98,2.83,.070),(-.63,2.83,.082))):
    path(f"JOINERY_Cooktop 01 inset etched ring {index+1}",KITCHEN,
         [(x+radius*math.cos(i*math.tau/32),y+radius*math.sin(i*math.tau/32),.900)
          for i in range(33)],.0015,stone_edge)
for i, x in enumerate((-1.89, -1.18, -.47, .24)):
    box(f"JOINERY_Wall cabinet case {i+1}", KITCHEN, (x, 2.82, 2.25), (.69, .40, .68), cream_cab, .008)
    box(f"JOINERY_Wall cabinet oak door {i+1}", KITCHEN, (x, 2.606, 2.25), (.65, .023, .64), oak, .010)
box("JOINERY_Under cabinet warm LED", KITCHEN, (-.84, 2.59, 1.89), (3.18, .025, .014), light_mat, .003)

# Island: warm rounded stone top, inset fluted joinery front, accurate toe clearance.
box("JOINERY_Island recessed toe kick", KITCHEN, (-1.40, .35, .10), (2.43, .80, .20), oak_edge, .018)
box("JOINERY_Island core", KITCHEN, (-1.40, .35, .48), (2.68, 1.0, .71), cream_cab, .028)
for i in range(15):
    x = -2.68 + i * .183
    box(f"JOINERY_Island slim oak flute {i+1:02d}", KITCHEN, (x, -.169, .50), (.055, .023, .61), oak, .015, 4)
box("JOINERY_Island stone waterfall top", KITCHEN, (-1.40, .34, .88), (2.93, 1.18, .075), stone, .014, 4)
box("JOINERY_Island stone end cheek", KITCHEN, (-2.87, .35, .44), (.07, 1.17, .82), stone_edge, .017)
box("JOINERY_Island oak end panel reveal", KITCHEN, (-2.826, .35, .47), (.009, .91, .61), oak_edge, .002)
box("JOINERY_Island inset sink dark well", KITCHEN, (-1.91, .60, .927), (.53, .35, .005), bronze, .013)
path("JOINERY_Island faucet arch", KITCHEN,
     [(-1.95,.86,.93),(-1.95,.86,1.16),(-1.95,.83,1.27),(-1.95,.70,1.30),(-1.95,.63,1.19)], .016, bronze)
for i, x in enumerate((-.86, -.26)):
    cylinder(f"FURN_Island stool pedestal {i+1}", FURN, (x,-.68,.355), .025, .67, bronze, 32, .006)
    seat = cylinder(f"FURN_Island upholstered stool seat {i+1}", FURN, (x,-.68,.72), .23, .10, fabric, 64, .045)
    seat.scale.y = .84

# TV wall joinery lives on the same back wall but in a separate construction collection.
box("JOINERY_TV oak backing panel", LIVING, (2.17, 3.030, 1.55), (2.83, .075, 2.10), oak, .016)
for i, x in enumerate((.93, 1.55, 2.17, 2.79, 3.41)):
    box(f"JOINERY_TV fine oak batten {i+1}", LIVING, (x, 2.971, 1.55), (.018, .014, 1.93), oak_edge, .003)
box("JOINERY_TV floating console body", LIVING, (2.17, 2.71, .52), (2.72, .46, .35), cream_cab, .025)
box("JOINERY_TV floating console wall shadow gap", LIVING, (2.17, 2.956, .53), (2.60, .018, .30), oak_edge, .002)
for i, x in enumerate((1.28, 2.17, 3.06)):
    box(f"JOINERY_TV console door {i+1}", LIVING, (x, 2.469, .52), (.85, .022, .30), oak, .008)
    box(f"JOINERY_TV console shadow line {i+1}", LIVING, (x, 2.456, .675), (.78, .004, .006), oak_edge, .001)
box("JOINERY_TV under console light", LIVING, (2.17, 2.77, .325), (2.54, .028, .010), light_mat, .003)
box("DETAIL_TV shadow spacer", LIVING, (2.17, 2.952, 1.69), (1.47, .085, .87), bronze, .015)
box("DETAIL_TV slim frame", LIVING, (2.17, 2.890, 1.69), (1.58, .040, .96), bronze, .018)
box("DETAIL_TV screen", LIVING, (2.17, 2.865, 1.69), (1.52, .003, .89), black_glass, .007)

# Living furniture uses soft sculpted forms and small structural details.
box("SOFT_Rug under seating", SOFT, (1.50, -.58, .042), (3.92, 2.78, .045), rug_mat, .12, 6)
box("FURN_Sofa low timber subframe", FURN, (1.58, -1.55, .28), (2.72, 1.12, .20), oak_edge, .035)
for x in (.73, 1.58, 2.43):
    cushion(f"FURN_Sofa plush seat {x:.2f}", FURN, (x,-1.60,.47), (.82,.91,.29), fabric, .12)
    cushion(f"FURN_Sofa upright back cushion {x:.2f}", FURN, (x,-2.05,.77), (.79,.22,.72), fabric, .09)
    path(f"FURN_Sofa tailored seat seam {x:.2f}", FURN,
         [(x-.35,-2.01,.50),(x-.35,-1.61,.51),(x-.35,-1.18,.50)], .0035, fabric_light)
for x in (.17, 2.99):
    cushion(f"FURN_Sofa rounded arm {x:.2f}", FURN, (x,-1.56,.59), (.22,1.15,.50), fabric, .075)
for i, (x,y) in enumerate(((.93,-1.99),(2.41,-1.96))):
    pillow=cushion(f"SOFT_Sofa boucle loose cushion {i+1}", SOFT, (x,y,.89), (.36,.16,.38), fabric_light, .075)
    pillow.rotation_euler.y = .12 if i else -.13
for x in (.44, 2.72):
    for y in (-2.01,-1.12):
        cylinder(f"FURN_Sofa dark leg {x:.2f} {y:.2f}", FURN, (x,y,.14), .027, .20, bronze, 32, .004)

table = cylinder("FURN_Oval stone coffee table top", FURN, (1.70,.08,.45), .66, .085, stone, 96, .038)
table.scale.x = 1.30
table.scale.y = .75
for x in (1.20, 2.20):
    cylinder(f"FURN_Coffee table tapered pedestal {x:.2f}", FURN, (x,.08,.247), .17, .365, oak, 64, .025)
box("FURN_Side table slim top", FURN, (3.36,-1.44,.47), (.42,.40,.045), oak, .07, 5)
cylinder("FURN_Side table leg", FURN, (3.36,-1.44,.25), .026, .43, bronze, 32, .004)

make_curtain("SOFT_Left floor-length curtain", SOFT, -3.67,-1.72,.44,fabric_light)
make_curtain("SOFT_Right floor-length curtain", SOFT, -3.67,.20,.43,fabric_light)
box("ARCH_Recessed curtain track", ARCH, (-3.67,-.77,2.84), (.06,2.44,.04), stone, .006)

# Warm pendants above the island and ceiling details, split from the joinery.
for i,x in enumerate((-2.12,-.72)):
    path(f"LIGHT_Pendant cord {i+1}", LIGHTS, [(x,.33,2.89),(x,.33,2.06)], .006, bronze)
    shade = cylinder(f"LIGHT_Pendant opal dome {i+1}", LIGHTS, (x,.33,1.99), .20, .23, fabric_light, 96, .08)
    shade.scale.z=.72
    cylinder(f"LIGHT_Pendant lower diffuser {i+1}", LIGHTS, (x,.33,1.88), .12, .018, light_mat, 64, .008)
for i,(x,y) in enumerate(((-2.35,1.64),(-.16,1.65),(1.66,1.45),(3.13,.03))):
    cylinder(f"LIGHT_Recessed ceiling spot trim {i+1}", LIGHTS, (x,y,2.879), .056, .018, bronze, 48, .005)
    cylinder(f"LIGHT_Recessed ceiling spot diffuser {i+1}", LIGHTS, (x,y,2.866), .038, .009, light_mat, 48, .003)

vase = cylinder("DECOR_Coffee table ceramic vessel", DECOR, (1.98,.10,.57), .079, .16, clay, 64, .025)
vase.scale.x=.78
box("DECOR_Coffee table book one", DECOR, (1.41,.15,.507), (.30,.22,.028), fabric_light, .006)
box("DECOR_Coffee table book two", DECOR, (1.42,.15,.534), (.26,.19,.026), oak_edge, .004)
for i, x in enumerate((1.36,1.56,1.75)):
    box(f"DECOR_TV console book {i+1}", DECOR, (x,2.76,.708), (.31,.19,.027), fabric_light if i%2 else clay, .004)
cylinder("DECOR_Floor pot", DECOR, (3.41,.97,.25), .23, .47, clay, 64, .05)
path("DECOR_Plant branching stem", DECOR,
     [(3.41,.97,.49),(3.38,.97,.88),(3.28,1.04,1.24),(3.11,1.06,1.44)], .016, oak_edge)
for i in range(8):
    theta=i*math.tau/8
    z=.83+(i%3)*.18
    make_leaf(f"DECOR_Plant tapered leaf {i+1}", DECOR,
              (3.36+.20*math.cos(theta),.98+.18*math.sin(theta),z),
              .27 + .025*(i%3), .11 + .015*(i%2), sage, theta)

# Broad natural studio illumination, restrained interior warmth, soft shadows.
world=bpy.data.worlds.new("Soft ivory photographic environment")
bpy.context.scene.world=world
world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(0.79,.78,.73,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.28
# Camera sees warm ivory; indirect illumination remains softer and neutral.
world_nodes=world.node_tree.nodes
world_links=world.node_tree.links
camera_ray=world_nodes.new("ShaderNodeLightPath")
paper_light=world_nodes.new("ShaderNodeEmission")
paper_light.inputs["Color"].default_value=(1.0,.89,.74,1)
paper_light.inputs["Strength"].default_value=1.55
world_mix=world_nodes.new("ShaderNodeMixShader")
world_links.new(camera_ray.outputs["Is Camera Ray"],world_mix.inputs[0])
world_links.new(world_nodes["Background"].outputs[0],world_mix.inputs[1])
world_links.new(paper_light.outputs[0],world_mix.inputs[2])
world_links.new(world_mix.outputs[0],world_nodes["World Output"].inputs[0])
add_area("LIGHT_Studio daylight from window", (-4.0,-1.0,5.7), 470, 5.2, (0.92,0.96,1.0), (0,0,.7), 3.7)
add_area("LIGHT_Studio soft key", (3.5,-4.5,7.0), 260, 5.1, (1.0,.96,.89), (0,0,0.6), 3.8)
add_area("LIGHT_Warm kitchen bounce", (-1.0,1.3,2.68), 42, 3.1, (1.0,.84,.70), (-1,2.6,1.4), .60)
add_area("LIGHT_Sofa soft fill", (2.9,-.8,4.1), 100, 3.4, (1.0,.96,.90), (1.4,-1.0,.7), 2.2)

# Texture maps and tailored upholstery are authored into the Blender source,
# not approximated later with CSS or web-only material overrides.
refine_room("living")

# Full cutaway silhouette, editorial room position leaves clean copy space left.
camera_data=bpy.data.cameras.new("CAM_Orthographic editorial isometric")
camera=bpy.data.objects.new("CAM_Orthographic editorial isometric",camera_data)
bpy.context.scene.collection.objects.link(camera)
camera.location=(9.7,-11.5,9.2)
target=Vector((0,0,1.08))
camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
camera_data.type='ORTHO'
camera_data.ortho_scale=19.8
camera_data.shift_x=-.18
bpy.context.scene.camera=camera

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.render.resolution_x=1920
scene.render.resolution_y=1080
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.render.filepath=str(PREVIEW)
scene.render.image_settings.color_mode='RGB'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.25
scene.camera.data.lens=50

# Switch film_transparent on later if an alpha render is needed for the site.
scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(PREVIEW)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.render.render(write_still=True)
print(f"SPACE_01_RESULT blend={BLEND} preview={PREVIEW} meshes={sum(o.type=='MESH' for o in scene.objects)} collections={len(bpy.data.collections)}")
