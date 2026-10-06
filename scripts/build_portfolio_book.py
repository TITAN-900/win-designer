"""Build WIN's physical portfolio book; Blender 5.2, no add-ons required.

Run: blender --background --python scripts/build_portfolio_book.py
The GLB contains neutral meshes only. Shape keys in the editable .blend are
construction checks, not the browser's interaction mechanism.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
DESIGN = ROOT / "design"
OUT = ROOT / "public" / "3d" / "book"
DESIGN.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
NX, NY = 72, 18
WIDTH, HEIGHT, PAPER = 1.0, 1.30, 0.00072
REST_Z, ACTIVE_OFFSET = 0.034, 0.00115

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
book = bpy.data.collections.new("BOOK — independent web geometry")
scene.collection.children.link(book)
studio = bpy.data.collections.new("STUDIO — preview only, not exported")
scene.collection.children.link(studio)


def material(name, color, roughness, noise=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.22
    if noise:
        tex = nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 850
        tex.inputs["Detail"].default_value = 2
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.16
        bump.inputs["Distance"].default_value = 0.0005
        mat.node_tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


cloth = material("Cover — warm ivory bookcloth", (0.65, 0.592, 0.485), 0.93, True)
paper = material("Paper — uncoated ivory", (0.94, 0.904, 0.824), 0.98, True)
edges = material("Paper — cut warm edge", (0.785, 0.742, 0.655), 0.98)
edge_line = material("Paper — fine leaf separation", (0.61, 0.562, 0.465), 1)
binding_mat = material("Binding — warm linen gutter", (0.435, 0.385, 0.308), 1)
endpaper = material("Endpaper — pale oatmeal", (0.80, 0.756, 0.658), 0.98)


def move(obj, group):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    group.objects.link(obj)
    return obj


def mesh_object(name, verts, faces, mat, smooth=True, uv=None):
    mesh = bpy.data.meshes.new(name + "_Topology")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    book.objects.link(obj)
    mesh.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = smooth
    if uv:
        layer = mesh.uv_layers.new(name="PageUV")
        for loop in mesh.loops:
            layer.data[loop.index].uv = uv[loop.vertex_index]
    obj["export_role"] = name
    return obj


def box(name, loc, size, mat, bevel=0.0015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = move(bpy.context.object, book)
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    mod = obj.modifiers.new("Soft cloth-covered board edges", "BEVEL")
    mod.width = bevel
    mod.segments = 4
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    normal = obj.modifiers.new("Weighted board normals", "WEIGHTED_NORMAL")
    bpy.ops.object.modifier_apply(modifier=normal.name)
    obj["export_role"] = name
    return obj


def profile(s):
    """Bound paper rises gently out of gutter, then relaxes to its fore edge."""
    return REST_Z + 0.005 * math.exp(-((s - .060) / .12) ** 2) - .008 * math.exp(-s / .021)


def grid(name, side, offset=0, reverse=False):
    verts, uv, faces = [], [], []
    for j in range(NY + 1):
        for i in range(NX + 1):
            s, v = i / NX, j / NY
            verts.append((side * s, (v - .5) * HEIGHT, profile(s) + offset))
            # Printed orientation is left-to-right in world X on BOTH resting pages.
            uv.append((s if side > 0 else 1 - s, v))
    for j in range(NY):
        for i in range(NX):
            a = j * (NX + 1) + i
            face = (a, a + 1, a + NX + 2, a + NX + 1)
            if (side < 0) != reverse:
                face = tuple(reversed(face))
            faces.append(face)
    obj = mesh_object(name, verts, faces, paper, True, uv)
    obj["page_grid"] = f"{NX} x {NY} quads"
    obj["paper_thickness"] = PAPER
    obj["page_side"] = "left" if side < 0 else "right"
    return obj


# Boards extend 3% beyond paper. The shallow edge radii read as bookcloth,
# not toy blocks. The tiny inward gap is bridged by the rounded spine below.
box("Book_Cover_Left", (-.522, 0, -.0015), (1.022, 1.362, .015), cloth, .0024)
box("Book_Cover_Right", (.522, 0, -.0015), (1.022, 1.362, .015), cloth, .0024)
box("Book_Endpaper_Left", (-.515, 0, .0064), (1.001, 1.332, .0011), endpaper, .0010)
box("Book_Endpaper_Right", (.515, 0, .0064), (1.001, 1.332, .0011), endpaper, .0010)


# Closed cross-section extruded along the binding: a smooth, flexible cloth
# spine bridging the two hard boards, with an upper concave hinge seat.
spine_section = [
    (-.030, .005), (-.022, .0065), (-.012, .0025), (0, .001),
    (.012, .0025), (.022, .0065), (.030, .005), (.028, -.004),
    (.022, -.010), (.012, -.0135), (0, -.0145), (-.012, -.0135),
    (-.022, -.010), (-.028, -.004),
]
verts = [(x, y, z) for y in (-.681, .681) for x, z in spine_section]
n = len(spine_section)
faces = [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
faces += [tuple(reversed(range(n))), tuple(range(n, 2*n))]
spine = mesh_object("Book_Spine", verts, faces, cloth)

# Linen binding rises between the permanent stacks; its top is below the pages.
verts, faces = [], []
for j in range(3):
    for i in range(17):
        x = -.024 + .048 * i / 16
        z = .023 + .004 * (1 - (x / .024) ** 2)
        verts.append((x, -.658 + 1.316 * j / 2, z))
for j in range(2):
    for i in range(16):
        a = j * 17 + i
        faces.append((a, a+1, a+18, a+17))
mesh_object("Book_Binding", verts, faces, binding_mat)


def stack(side):
    # A lofted closed page block, following the actual resting-page profile.
    sx = 48
    vv, ff = [], []
    for layer in range(2):
        for y in (-.65, .65):
            for i in range(sx + 1):
                s = .012 + .988 * i / sx
                z = .0078 if layer == 0 else profile(s) - .0005
                vv.append((side * s, y, z))
    row = sx + 1
    for layer in range(2):
        for i in range(sx):
            a = layer * row * 2 + i
            face = (a, a+1, a+row+1, a+row)
            if (layer == 0) != (side < 0):
                face = tuple(reversed(face))
            ff.append(face)
    for edge in (0, 1):
        for i in range(sx):
            a = edge * row + i
            face = (a, a+row*2, a+row*2+1, a+1)
            if (edge == 0) != (side < 0):
                face = tuple(reversed(face))
            ff.append(face)
    for i in (0, sx):
        face = (i, i+row, i+row*3, i+row*2)
        if (i == 0) != (side < 0):
            face = tuple(reversed(face))
        ff.append(face)
    name = "Left" if side < 0 else "Right"
    obj = mesh_object("Book_Stack_" + name, vv, ff, edges, False)
    obj["permanent"] = True
    # Fine physical interleaf lines across head, tail, and fore-edge. All lines
    # merge into one mesh per side, keeping draw calls predictable on mobile.
    vv, ff = [], []
    for layer in range(1, 27):
        t = layer / 28
        for y in (-.65013, .65013):
            for i in range(33):
                s = .017 + .983 * i / 32
                z = .0078 + (profile(s) - .0083) * t
                vv.extend([(side*s, y, z-.000075), (side*s, y, z+.000075)])
            start = len(vv) - 66
            for i in range(32):
                a = start + 2*i
                ff.append((a, a+1, a+3, a+2))
        z = .0078 + (profile(1) - .0083) * t
        a = len(vv)
        vv.extend([(side*1.00013, -.65, z-.000075),
                   (side*1.00013, .65, z-.000075),
                   (side*1.00013, .65, z+.000075),
                   (side*1.00013, -.65, z+.000075)])
        ff.append((a,a+1,a+2,a+3))
    obj = mesh_object("Book_EdgeLines_" + name, vv, ff, edge_line, False)
    # Both sides of the very thin edge strips must render.
    obj.data.materials[0].use_backface_culling = False


stack(-1)
stack(1)
left = grid("Book_Page_Left", -1)
right = grid("Book_Page_Right", 1)
front = grid("Book_Active_Front", 1, ACTIVE_OFFSET + PAPER/2)
back = grid("Book_Active_Back", 1, ACTIVE_OFFSET - PAPER/2, True)

# Edge wall shares exactly the front/back boundary, making an actual thin leaf.
boundary = (list(range(NX+1)) +
            [j*(NX+1)+NX for j in range(1,NY+1)] +
            [NY*(NX+1)+i for i in range(NX-1,-1,-1)] +
            [j*(NX+1) for j in range(NY-1,0,-1)])
vv, uv, ff = [], [], []
for idx in boundary:
    x,y,z = front.data.vertices[idx].co
    vv.extend([(x,y,z), (x,y,z-PAPER)])
    uv.extend([(x, (y+.65)/HEIGHT)]*2)
for i in range(len(boundary)):
    a, b = i*2, ((i+1)%len(boundary))*2
    ff.append((a,a+1,b+1,b))
rim = mesh_object("Book_Active_Edge", vv, ff, edges, True, uv)


def curl_center(u, v, progress):
    """Traveling curved fold, used only to inspect the Blender source.

    Integrates the unit paper tangent to preserve arc length along every row.
    Across-page fold skew makes the corner lift ahead of the opposite corner.
    """
    if progress == 0:
        return u, profile(u)+ACTIVE_OFFSET, 0.0
    if progress == 1:
        return -u, profile(u)+ACTIVE_OFFSET, math.pi
    wave = math.sin(math.pi * progress)
    center = 1.18 - 1.36*progress + .065*(v-.5)*2*wave
    half = .09 + .445*wave
    def angle(s):
        t = max(0, min(1, (s-center+half)/(2*half)))
        return math.pi*t*t*(3-2*t)
    count = max(1, math.ceil(u*144))
    ds = u/count
    xx, zz, last = 0, 0, angle(0)
    for i in range(1,count+1):
        nxt = angle(i*ds)
        xx += .5*(math.cos(last)+math.cos(nxt))*ds
        zz += .5*(math.sin(last)+math.sin(nxt))*ds
        last = nxt
    return xx, profile(u)+ACTIVE_OFFSET+zz, last


for obj in (front, back, rim):
    obj.shape_key_add(name="Basis — neutral browser export")
    for progress in (.20, .50, .80):
        key = obj.shape_key_add(name=f"Inspect curl {int(progress*100):02d}%")
        for i, vert in enumerate(obj.data.vertices):
            x,y,z = vert.co
            xx, zz, theta = curl_center(x, (y+.65)/HEIGHT, progress)
            delta = z - (profile(x)+ACTIVE_OFFSET)
            key.data[i].co = (xx-math.sin(theta)*delta, y, zz+math.cos(theta)*delta)
    obj["runtime_deformation"] = "Direct vertex deformation; use rest position / UV, not a rigid rotation."
    obj["web_axes"] = "glTF X = Blender X; glTF Y = Blender Z; glTF Z = -Blender Y"

# A physically consistent spine anchor is held in all sample shape keys.
for obj in (front,back,rim):
    for block in list(obj.data.shape_keys.key_blocks)[1:]:
        block.value = 0


def add_area(name, location, energy, size, target, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
    obj = bpy.data.objects.new(name, data)
    studio.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()


ground_mat = material("Studio — matte warm background", (.31,.29,.25), 1)
ground = box("Studio_Surface", (0,0,-.027), (200,200,.02), ground_mat, .001)
move(ground,studio)
add_area("Studio_Key", (-2.0,-1.4,4.0), 350, 3.0, (0,0,0), (1,.92,.80))
add_area("Studio_Fill", (2.3,1.4,3), 140, 3.0, (0,0,0), (.86,.92,1))
bpy.ops.object.camera_add(location=(2.25,-3.8,4.8))
camera = move(bpy.context.object,studio)
camera.name = "Camera — construction inspection"
camera.rotation_euler = (Vector((0,0,.05))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.86
scene.camera = camera
scene.world = bpy.data.worlds.new("Studio ambient")
scene.world.color = (.20,.20,.20)
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"


# Basic geometry checks run before any generated artifact is replaced.
assert len(front.data.vertices) == (NX+1)*(NY+1)
assert len(front.data.polygons) == NX*NY
assert min(p.normal.z for p in front.data.polygons) > .85
assert max(p.normal.z for p in back.data.polygons) < -.85
assert len(boundary) == 2*(NX+NY)
assert rim.data.polygons[0].normal.y < -.99
for side in ("Left", "Right"):
    obj = bpy.data.objects["Book_Stack_" + side]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    assert all(e.is_manifold for e in bm.edges)
    assert bm.calc_volume(signed=True) > .025
    bm.free()
    for polygon in obj.data.polygons:
        if abs(polygon.center.y) > .649:
            assert polygon.normal.y * polygon.center.y > .6
for obj in (front,back,left,right):
    uvs = obj.data.uv_layers.active.data
    assert all(-1e-6 <= uv.uv[axis] <= 1+1e-6 for uv in uvs for axis in (0,1))

bpy.ops.object.select_all(action="DESELECT")
for obj in book.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = front
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(DESIGN / "portfolio_book.blend"), compress=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "portfolio_book.glb"), export_format="GLB", use_selection=True,
    export_yup=True, export_apply=False, export_animations=False,
    export_morph=False, export_materials="EXPORT", export_extras=True,
    export_texcoords=True, export_normals=True, export_cameras=False,
    export_lights=False,
)

manifest = {
    "version": 1,
    "generator": "scripts/build_portfolio_book.py",
    "source": "design/portfolio_book.blend",
    "asset": "/3d/book/portfolio_book.glb",
    "units": "Page width = 1; page height = 1.30",
    "blender_axes": "XY page plane; Z up; spine X=0; front cover opened to left",
    "gltf_axes": "X=x; Y=z; Z=-y. To use original Blender coordinates, rotate root +90 degrees around X before baking transforms.",
    "page": {
        "width": WIDTH, "height": HEIGHT, "thickness": PAPER,
        "segments": [NX,NY], "vertices_per_side": (NX+1)*(NY+1),
        "triangles_per_side": NX*NY*2,
        "rest_fore_edge_z": profile(1),
        "rest_spine_z": profile(0),
        "active_center_offset": ACTIVE_OFFSET,
        "active_front_fore_edge_z": profile(1)+ACTIVE_OFFSET+PAPER/2,
        "active_back_fore_edge_z": profile(1)+ACTIVE_OFFSET-PAPER/2,
        "active_front_spine_z": profile(0)+ACTIVE_OFFSET+PAPER/2,
        "rest_profile": "0.034 + 0.005*exp(-((abs(x)-0.060)/0.12)^2) - 0.008*exp(-abs(x)/0.021)",
        "UV": "Blender u increases world left-to-right, v increases y from -0.65 to +0.65. glTF export flips V: glTF v=0 is page top (Blender y=+0.65). CanvasTexture.flipY=false. Back UV intentionally same as front; runtime may mirror U for the reverse printed page.",
        "active_back_mapping": "Front and back use u=x; vertex positions are independently deformable. Edge vertices use same UV, with two thickness levels. Use stored rest position for thickness offset.",
        "inspection_shape_keys": ["Inspect curl 20%", "Inspect curl 50%", "Inspect curl 80%"],
        "exported_shape_keys": False,
    },
    "permanent_meshes": [o.name for o in book.objects if not o.name.startswith("Book_Active_")],
    "active_meshes": [front.name,back.name,rim.name],
    "mesh_counts": {o.name:{"vertices":len(o.data.vertices), "triangles":sum(len(p.vertices)-2 for p in o.data.polygons)} for o in book.objects},
    "total_triangles": sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in book.objects),
    "glb_bytes": (OUT / "portfolio_book.glb").stat().st_size,
    "validation": {"front_normals": "positive Z", "back_normals": "negative Z", "UV": "0..1 checked", "active_rim": "closed perimeter, actual thickness", "spine": "independent cloth spine + binding", "stacks": "permanent independent left/right page stacks"},
}
manifest["validation"]["curl_samples"] = {
    str(int(p*100)):{
        "max_height":max(v.co.z for v in front.data.shape_keys.key_blocks[f"Inspect curl {int(p*100):02d}%"].data),
        "free_edge_midpoint":list(front.data.shape_keys.key_blocks[f"Inspect curl {int(p*100):02d}%"].data[(NY//2)*(NX+1)+NX].co),
    } for p in (.20,.50,.80)
}
(OUT / "portfolio_book.manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
scene.render.filepath = str(DESIGN / "portfolio_book_preview.png")
bpy.ops.render.render(write_still=True)
for percent in (20,50,80):
    for obj in (front,back,rim):
        for key in list(obj.data.shape_keys.key_blocks)[1:]:
            key.value = 1 if key.name == f"Inspect curl {percent:02d}%" else 0
    suffix = "" if percent == 50 else f"_{percent}"
    scene.render.filepath = str(DESIGN / f"portfolio_book_curl{suffix}_preview.png")
    bpy.ops.render.render(write_still=True)
print("BOOK_EXPORT", json.dumps(manifest,indent=2))
