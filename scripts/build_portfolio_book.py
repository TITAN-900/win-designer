"""Build WIN's physical portfolio book; Blender 5.2, no add-ons required.

Run: blender --background --python scripts/build_portfolio_book.py
The GLB contains neutral meshes only. Shape keys in the editable .blend are
construction checks, not the browser's interaction mechanism.
"""
import bpy
import bmesh
import json
import math
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
DESIGN = ROOT / "design"
OUT = ROOT / "public" / "3d" / "book"
DESIGN.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
NX, NY = 72, 18
WIDTH, HEIGHT, PAPER = 1.0, 1.30, 0.00072
REST_Z, ACTIVE_OFFSET = 0.034, 0.00115
HINGE_Z = .042

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
book = bpy.data.collections.new("BOOK — independent web geometry")
scene.collection.children.link(book)
studio = bpy.data.collections.new("STUDIO — preview only, not exported")
scene.collection.children.link(studio)


def paper_microtexture():
    """Baked, seamless physical paper maps, not renderer-only noise nodes.

    A restrained fibrous normal and narrow roughness range produce their
    variation through grazing illumination. Albedo stays clean and ungrained.
    """
    size = 512
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    rng = np.random.default_rng(9137)
    field = np.zeros((size, size), dtype=np.float32)
    for _ in range(18):
        fx, fy = rng.integers(14, 120), rng.integers(4, 24)
        phase = rng.random() * 2 * math.pi
        field += np.sin(2 * math.pi * (xx * fx + yy * fy) + phase) / 18
    fine = rng.normal(0, .12, (size, size)).astype(np.float32)
    field = field * .7 + (fine + np.roll(fine, 1, axis=0)) * .15
    dx = np.roll(field, -1, axis=1) - np.roll(field, 1, axis=1)
    dy = np.roll(field, -1, axis=0) - np.roll(field, 1, axis=0)

    def bake(name, rgb):
        rgba = np.ones((size, size, 4), dtype=np.float32)
        rgba[:, :, :3] = rgb
        image = bpy.data.images.new(name, width=size, height=size, alpha=False)
        image.colorspace_settings.name = "Non-Color"
        image.pixels.foreach_set(rgba.ravel())
        image.pack()
        return image

    normal = np.dstack((.5 - dx * .035, .5 - dy * .035,
                        np.full_like(field, 1)))
    roughness = np.clip(.80 + field * .045, .775, .825)
    return bake("Paper wrap — 512px fibre normal", normal), bake(
        "Paper wrap — 512px fine roughness", np.dstack((roughness,) * 3))


normal_image, roughness_image = paper_microtexture()


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
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = normal_image
        bump = nodes.new("ShaderNodeNormalMap")
        bump.inputs["Strength"].default_value = .16
        mat.node_tree.links.new(normal.outputs["Color"], bump.inputs["Color"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        variation = nodes.new("ShaderNodeTexImage")
        variation.image = roughness_image
        # Direct Image -> Roughness is retained by the glTF PBR exporter.
        mat.node_tree.links.new(variation.outputs["Color"], bsdf.inputs["Roughness"])
    return mat


cloth = material("Cover — warm ivory fine paper wrap", (0.565, 0.497, 0.392), 0.80, True)
paper = material("Paper — uncoated ivory", (0.94, 0.904, 0.824), 0.93)
edges = material("Paper — cut warm edge", (0.785, 0.742, 0.655), 0.98)
edge_line = material("Paper — fine leaf separation", (0.61, 0.562, 0.465), 1)
binding_mat = material("Binding — warm linen gutter", (0.57, 0.512, 0.420), .94)
endpaper = material("Endpaper — pale oatmeal", (0.80, 0.756, 0.658), 0.98)
headband_mat = material("Binding — woven ivory headband", (.735, .68, .56), .95)


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


def wrapped_binding(name, anchor_x, anchor_z, thickness, y0, y1, mat):
    """A closed, genuinely curved case wrapper, not several flat slabs.

    UV.u encodes cross-section position, used by the browser to keep the
    rounded spine connected to BOTH boards throughout manual cover movement.
    The closed inspection key is exactly the same endpoint-constrained pose.
    """
    steps, length_steps = 64, 4
    radius = math.hypot(anchor_x, anchor_z - HINGE_Z)
    right = math.atan2(anchor_z - HINGE_Z, anchor_x)
    left = math.atan2(anchor_z - HINGE_Z, -anchor_x)
    ring = [(i / steps, radius + thickness / 2) for i in range(steps + 1)]
    ring += [(i / steps, radius - thickness / 2) for i in range(steps, -1, -1)]
    vv, uv, ff = [], [], []
    for j in range(length_steps + 1):
        v = j / length_steps
        for u, r in ring:
            theta = right + (left - right) * u
            vv.append((r * math.cos(theta), y0 + (y1-y0)*v,
                       HINGE_Z + r * math.sin(theta)))
            uv.append((u, v))
    count = len(ring)
    for j in range(length_steps):
        for i in range(count):
            a, b = j * count + i, j * count + (i+1) % count
            ff.append((a, b, b+count, a+count))
    ff += [tuple(reversed(range(count))), tuple(range(length_steps*count, (length_steps+1)*count))]
    obj = mesh_object(name, vv, ff, mat, True, uv)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    assert all(edge.is_manifold for edge in bm.edges)
    assert bm.calc_volume(signed=True) > 0
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.polygons[-1].use_smooth = False
    obj.data.polygons[-2].use_smooth = False
    obj["binding_flexible"] = True
    obj["binding_anchor_x"] = anchor_x
    obj["binding_anchor_z"] = anchor_z
    obj["binding_hinge_z"] = HINGE_Z
    obj["binding_thickness"] = thickness
    obj.shape_key_add(name="Basis — open binding")
    closed = obj.shape_key_add(name="Inspect closed case spine")
    for i, vertex in enumerate(obj.data.vertices):
        u, r = ring[i % count]
        theta = right + (left - math.pi - right) * u
        closed.data[i].co = (r * math.cos(theta), vertex.co.y,
                             HINGE_Z + r * math.sin(theta))
    return obj


spine = wrapped_binding("Book_Spine", .014, -.009, .0014, -.678, .678, cloth)
binding = wrapped_binding("Book_Binding", .012, profile(.012)-.002,
                          .0010, -.650, .650, binding_mat)
headbands = [wrapped_binding("Book_Headband_" + label, .012,
              profile(.012)-.002, .0024, y-.0023, y+.0023, headband_mat)
             for label, y in (("Head", .649), ("Tail", -.649))]


def hinge_joint(side):
    """A narrow rounded cloth hinge roll at the actual board/endpaper joint."""
    vv, ff = [], []
    steps = 24
    for y in (-.663, .663):
        for i in range(steps):
            a = 2 * math.pi * i / steps
            vv.append((side*.019 + math.cos(a)*.0033, y,
                       .0060 + math.sin(a)*.0011))
    for i in range(steps):
        ff.append((i, (i+1) % steps, (i+1) % steps + steps, i+steps))
    ff += [tuple(reversed(range(steps))), tuple(range(steps, steps*2))]
    obj = mesh_object("Book_Hinge_" + ("Left" if side < 0 else "Right"), vv, ff, cloth)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    assert bm.calc_volume(signed=True) > 0
    bm.to_mesh(obj.data)
    bm.free()
    return obj


hinge_joint(-1)
hinge_joint(1)

# An authored, conformal printing face 30 microns above the wrapped board.
# This is not a floating HTML panel. It shares the actual softened board outline
# and follows the cover hinge. The web renderer supplies ink/foil channels here.
vv, uv, ff = [], [], []
cover_min_x, cover_max_x, cover_height = -1.033, -.011, 1.362
corner_radius = .0025
corners = ((cover_max_x-corner_radius, .681-corner_radius, 0),
           (cover_min_x+corner_radius, .681-corner_radius, 90),
           (cover_min_x+corner_radius, -.681+corner_radius, 180),
           (cover_max_x-corner_radius, -.681+corner_radius, 270))
for cx, cy, start in corners:
    for i in range(9):
        angle = math.radians(start + i*90/8)
        x, y = cx + corner_radius*math.cos(angle), cy + corner_radius*math.sin(angle)
        vv.append((x, y, -.00903))
        uv.append(((cover_max_x-x)/(cover_max_x-cover_min_x), (y+.681)/cover_height))
ff.append(tuple(reversed(range(len(vv)))))
print_face = mesh_object("Book_Cover_Print_Left", vv, ff, cloth, False, uv)
print_face["cover_print"] = True
print_face["print_extent"] = [1.022, 1.362]
print_face["print_uv"] = "glTF U runs right-to-left in open local X; V=0 is physical head. Use CanvasTexture.flipY=false."


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
    "version": 2,
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

# Inspect the actual closed anatomy as well as the open paper. The original
# saved source remains editable with open and closed inspection shape keys.
for obj in (front, back, rim):
    obj.hide_render = True
for obj in book.objects:
    if obj.name.endswith("_Left"):
        # Rotate the entire authored object about the binding, not its own origin.
        obj.matrix_world = (Matrix.Translation((0, 0, 2 * HINGE_Z))
                            @ Matrix.Rotation(math.pi, 4, 'Y') @ obj.matrix_world)
    if obj.get("binding_flexible"):
        obj.data.shape_keys.key_blocks["Inspect closed case spine"].value = 1
camera.location = (1.4, -3.8, 4.8)
camera.rotation_euler = (Vector((.43, 0, .04))-camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.ortho_scale = 2.05
scene.render.filepath = str(DESIGN / "portfolio_book_closed_preview.png")
bpy.ops.render.render(write_still=True)
