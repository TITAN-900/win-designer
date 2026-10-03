"""Shared, GLB-safe material and upholstery refinement for the two dioramas.

The photographic oak source is the local CC0 Poly Haven floor material listed
in SOURCES.md. All derived maps are small, local, and embedded in the GLBs.
"""

from array import array
import math
from pathlib import Path

import bmesh
import bpy


ROOT = Path(__file__).resolve().parent
DERIVED = ROOT / "materials" / "diorama-derived"
DERIVED.mkdir(parents=True, exist_ok=True)


def _image(name, size, pixel):
    destination = DERIVED / name
    if not destination.exists():
        image = bpy.data.images.new(name, width=size, height=size, alpha=False)
        rgba = array("f", [0.0]) * (size * size * 4)
        for y in range(size):
            for x in range(size):
                r, g, b = pixel(x, y, size)
                offset = 4 * (y * size + x)
                rgba[offset:offset + 4] = array("f", (r, g, b, 1.0))
        image.pixels.foreach_set(rgba)
        image.filepath_raw = str(destination)
        image.file_format = "PNG"
        image.save()
        bpy.data.images.remove(image)
    result = bpy.data.images.load(str(destination), check_existing=True)
    result.pack()
    return result


def _resized_oak(name, mix, destination_color):
    destination = DERIVED / name
    if not destination.exists():
        source = bpy.data.images.load(str(ROOT / "materials" / "wood_floor_Diffuse.jpg"), check_existing=False)
        source.scale(512, 512)
        values = array("f", [0.0]) * (512 * 512 * 4)
        source.pixels.foreach_get(values)
        for offset in range(0, len(values), 4):
            # Retain the actual grain, but remove the brown cast of the floor
            # source so the veneer reads as light, naturally finished oak.
            grey = .27 * values[offset] + .55 * values[offset + 1] + .18 * values[offset + 2]
            for channel in range(3):
                source_value = .70 * values[offset + channel] + .30 * grey
                values[offset + channel] = min(1.0, destination_color[channel] * (1 - mix) + source_value * mix)
        target = bpy.data.images.new(name, width=512, height=512, alpha=False)
        target.pixels.foreach_set(values)
        target.filepath_raw = str(destination)
        target.file_format = "PNG"
        target.save()
        bpy.data.images.remove(target)
        bpy.data.images.remove(source)
    result = bpy.data.images.load(str(destination), check_existing=True)
    result.pack()
    return result


def _resized_map(name, original):
    destination = DERIVED / name
    if not destination.exists():
        image = bpy.data.images.load(str(ROOT / "materials" / original), check_existing=False)
        image.scale(512, 512)
        image.filepath_raw = str(destination)
        image.file_format = "PNG"
        image.save()
        bpy.data.images.remove(image)
    result = bpy.data.images.load(str(destination), check_existing=True)
    result.colorspace_settings.name = "Non-Color"
    result.pack()
    return result


def _grain(x, y):
    return (math.sin(x * .067 + 2.2 * math.sin(y * .009)) * .52
            + math.sin(x * .023 - y * .018) * .31
            + math.sin(x * .31 + y * .27) * .17)


def _value_noise(x, y):
    ix, iy = math.floor(x), math.floor(y)
    u, v = x-ix, y-iy
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    def sample(a, b):
        return (math.sin(a*127.1+b*311.7)*43758.5453) % 1.0
    bottom = sample(ix, iy)*(1-u) + sample(ix+1, iy)*u
    top = sample(ix, iy+1)*(1-u) + sample(ix+1, iy+1)*u
    return (bottom*(1-v)+top*v)*2-1


def _cloud(x, y):
    return (.55*_value_noise(x/41, y/41)
            + .30*_value_noise(x/13, y/13)
            + .15*_value_noise(x/3.5, y/3.5))


def _surface_maps():
    maps = {}
    maps["oak"] = _resized_oak("light-oak-512.png", .40, (.72, .63, .51))
    maps["oak_deep"] = _resized_oak("warm-oak-512.png", .65, (.56, .43, .31))
    # A single atlas gives the bedroom's visible planks distinct grain phases.
    # It is still derived from the local licensed oak photograph and travels in
    # the GLB, rather than relying on a Blender-only procedural node.
    oak_pixels = array("f", [0.0]) * (512 * 512 * 4)
    maps["oak"].pixels.foreach_get(oak_pixels)
    def plank_pixel(x, y, size):
        plank = min(17, int(x * 18 / size))
        strip = min(3, int(y * 4 / size))
        local_x = (x * 18 / size - plank) * .76 + (plank * .217) % 1
        local_y = (y * 4 / size - strip) * .83 + (plank * .379 + strip * .133) % 1
        sx = int(local_x * 511) % 512
        sy = int(local_y * 511) % 512
        offset = 4 * (sy * 512 + sx)
        tone = 1 + .045 * math.sin(plank * 7.13 + strip * 2.41)
        return tuple(min(1.0, oak_pixels[offset + c] * tone) for c in range(3))
    maps["floor_atlas"] = _image("bedroom-oak-plank-atlas-v1-768.png", 768, plank_pixel)
    maps["wood_rough"] = _resized_map("oak-rough-512.png", "wood_floor_Rough.jpg")
    maps["wood_normal"] = _resized_map("oak-normal-512.png", "wood_floor_nor_gl.jpg")

    maps["stone"] = _image("honed-stone-v2-512.png", 512, lambda x, y, n: tuple(
        min(1.0, base + .025 * _cloud(x, y))
        for base in (.735, .716, .680)))
    maps["stone_rough"] = _image("stone-rough-v2-256.png", 256, lambda x, y, n: (
        .57 + .060 * _cloud(x, y),) * 3)
    maps["plaster"] = _image("limewash-v2-256.png", 256, lambda x, y, n: tuple(
        base + .012 * _cloud(x, y)
        for base in (.805, .785, .745)))
    maps["wall"] = _image("wall-plaster-v1-256.png", 256, lambda x, y, n: tuple(
        base + .012 * _cloud(x, y)
        for base in (.745, .725, .690)))
    maps["plaster_rough"] = _image("limewash-rough-v2-256.png", 256, lambda x, y, n: (
        .82 + .050 * _cloud(x, y),) * 3)

    def cloth(base, x, y, large=False):
        weave = math.sin(x * (1.12 if large else 1.73)) * math.sin(y * (1.26 if large else 1.91))
        fleck = math.sin(x * .51 + y * .37) * math.sin(y * .83 - x * .22)
        variation = .018 * weave + .012 * fleck
        return tuple(max(0, min(1, c + variation)) for c in base)

    maps["fabric"] = _image("woven-greige-256.png", 256, lambda x, y, n: cloth((.64, .607, .56), x, y))
    maps["linen"] = _image("woven-linen-256.png", 256, lambda x, y, n: cloth((.79, .764, .715), x, y))
    maps["rug"] = _image("wool-oat-256.png", 256, lambda x, y, n: cloth((.68, .65, .60), x, y, True))
    maps["fabric_rough"] = _image("woven-rough-256.png", 256, lambda x, y, n: (
        .87 + .055 * math.sin(x * 1.22) * math.sin(y * 1.31),) * 3)
    maps["fabric_normal"] = _image("woven-normal-256.png", 256, lambda x, y, n: (
        .5 - .055*math.cos(x*1.73)*math.sin(y*1.91),
        .5 - .055*math.sin(x*1.73)*math.cos(y*1.91), 1.0))
    maps["fabric_normal"].colorspace_settings.name = "Non-Color"
    return maps


def _connect(material, color, rough, normal=None, normal_strength=.15):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    tex = nodes.new("ShaderNodeTexImage")
    tex.label = "Embedded PBR albedo"
    tex.image = color
    links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    rough_tex = nodes.new("ShaderNodeTexImage")
    rough_tex.label = "Embedded roughness variation"
    rough_tex.image = rough
    rough.colorspace_settings.name = "Non-Color"
    links.new(rough_tex.outputs["Color"], shader.inputs["Roughness"])
    if normal:
        bump_tex = nodes.new("ShaderNodeTexImage")
        bump_tex.image = normal
        normal.colorspace_settings.name = "Non-Color"
        normal_node = nodes.new("ShaderNodeNormalMap")
        normal_node.inputs["Strength"].default_value = normal_strength
        links.new(bump_tex.outputs["Color"], normal_node.inputs["Color"])
        links.new(normal_node.outputs["Normal"], shader.inputs["Normal"])


def _uv_by_surface(mesh, period):
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="Architectural material direction")
    for polygon in mesh.polygons:
        axis = max(range(3), key=lambda index: abs(polygon.normal[index]))
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis == 0:
                u, v = vertex.y, vertex.z
            elif axis == 1:
                u, v = vertex.x, vertex.z
            else:
                u, v = vertex.x, vertex.y
            uv.data[loop_index].uv = (u / period, v / period)


def _uv_floor_atlas(obj):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="Individual oak planks")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (vertex.x / 7.72 + .5, vertex.y / 6.22 + .5)


def make_curtain(name, collection, x, center_y, width, material, bottom=.021, top=2.82):
    """Floor-touching woven panels with deep, non-repeating hanging pleats."""
    columns, rows = 36, 12
    vertices, faces = [], []
    for row in range(rows + 1):
        t = row / rows
        z = bottom + (top - bottom) * t
        for column in range(columns + 1):
            u = column / columns
            phase = u * math.tau * 4.2
            wave = math.cos(phase + .14 * math.sin(t * math.pi))
            # Folds are more gathered at the curtain track and spread at hem.
            gather = .68 + .32 * (1 - t)
            y = center_y + width * (u - .5) * gather
            y += .009 * math.sin(phase * .5 + t * 2.5) * (1 - t)
            xx = x + (.050 + .018 * (1 - t)) * wave
            zz = z + (1 - t) * .004 * math.sin(phase * .83)
            vertices.append((xx, y, zz))
    stride = columns + 1
    for row in range(rows):
        for column in range(columns):
            first = row * stride + column
            faces.append((first, first + 1, first + stride + 1, first + stride))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    thickness = obj.modifiers.new("Tailored curtain thickness", "SOLIDIFY")
    thickness.thickness = .012
    smoothing = obj.modifiers.new("Weighted hanging pleats", "SUBSURF")
    smoothing.levels = 1
    smoothing.render_levels = 1
    for face in mesh.polygons:
        face.use_smooth = True
    return obj


def make_leaf(name, collection, center, length, width, material, heading=0):
    """A few curved, tapered polygons read as foliage even at phone size."""
    vertices, faces = [], []
    segments = 8
    for index in range(segments + 1):
        u = index / segments
        half_width = width * .5 * math.sin(math.pi * u) ** .78
        for side in (-1, 0, 1):
            vertices.append((length * (u - .5), side * half_width,
                             .018 * (1 - side * side) * math.sin(math.pi * u)
                             - .025 * u * u))
    for index in range(segments):
        first = index * 3
        faces.extend(((first, first + 1, first + 4, first + 3),
                      (first + 1, first + 2, first + 5, first + 4)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = center
    obj.rotation_euler.z = heading
    mesh.materials.append(material)
    thickness = obj.modifiers.new("Natural leaf thickness", "SOLIDIFY")
    thickness.thickness = .006
    for face in mesh.polygons:
        face.use_smooth = True
    return obj


def _sculpt_soft(obj, kind):
    # A small hand-shaped top grid gives bedding and upholstery restrained folds
    # and compressed corners rather than primitive bevelled-box silhouettes.
    old_mesh = obj.data
    coordinates = [vertex.co for vertex in old_mesh.vertices]
    width = max(v.x for v in coordinates) - min(v.x for v in coordinates)
    depth = max(v.y for v in coordinates) - min(v.y for v in coordinates)
    height = max(v.z for v in coordinates) - min(v.z for v in coordinates)
    nx, ny = (24, 28) if kind == "duvet" else (16, 14)
    amplitude = (.009 if kind == "duvet" else .008 if kind == "mattress"
                 else .035 if kind == "upright" else .018)
    vertices = []
    for top in (True, False):
        for j in range(ny + 1):
            v = j / ny
            for i in range(nx + 1):
                u = i / nx
                corner = max(0, (abs(2*u-1)-.76)/.24) * max(0, (abs(2*v-1)-.76)/.24)
                x = (u-.5) * width * (1-.055*corner)
                y = (v-.5) * depth * (1-.055*corner)
                fold = (math.sin(v*math.tau*2.1 + u*1.2)*.62
                        + math.sin(u*math.tau*1.3-v*1.1)*.25
                        + math.sin((u+v)*math.tau*2.5)*.13)
                center = max(0, 1-((u-.5)*2)**2-((v-.5)*2)**2)
                edge = min(u, 1-u, v, 1-v)
                if kind == "upright":
                    side = abs(2*u-1)
                    end = abs(2*v-1)
                    x *= 1-.105*end**4
                    z = (v-.5) * height * (1-.075*side**4)
                    if v < .5:
                        z += .018*side**4
                    else:
                        z -= .018*side**4
                    y = (-depth/2 - amplitude*center + .022*side**4
                         if top else depth/2 + .006*center - .012*side**4)
                    vertices.append((x, y, z))
                    continue
                if kind == "duvet":
                    # The cover rests on the mattress, then falls over the
                    # two sides and the foot. Its thin hem follows the top
                    # surface so draping cannot invert the mesh at the edge.
                    side = .10 * max(0, 1 - min(u, 1-u) / .12) ** 2
                    foot = .095 * max(0, 1 - v / .13) ** 2
                    head = .012 * max(0, 1 - (1-v) / .09) ** 2
                    fall = max(side, foot, head)
                    diagonal_fold = .004 * math.exp(-((v-(.31+.09*u))/.075)**2) * math.sin(u*math.pi*1.6)
                    surface = height/2 + amplitude*fold*center + diagonal_fold*center - fall
                    if top:
                        z = surface
                    else:
                        thickness = .024 + (height-.024)*min(1, edge/.11)
                        z = surface - thickness
                        if edge > .12:
                            z = max(z, -.065)  # filled cover rests on mattress
                    vertices.append((x, y, z))
                    continue
                if top:
                    z = height/2 + amplitude*fold*center - .015 * max(0, 1-edge*13)
                    if kind == "duvet":
                        z -= .025 * math.exp(-((v-.79)/.055)**2) * center
                    if kind == "pillow":
                        z -= .015 * center + .058 * max(0,1-edge*7)
                else:
                    z = -height/2 + (.045 if kind == "pillow" else .005)*max(0,1-edge*12)
                vertices.append((x, y, z))
    stride = nx+1
    count = stride*(ny+1)
    faces = []
    for j in range(ny):
        for i in range(nx):
            a=j*stride+i
            faces.append((a,a+1,a+stride+1,a+stride))
            b=count+a
            faces.append((b+stride,b+stride+1,b+1,b))
    for i in range(nx):
        faces.append((count+i,count+i+1,i+1,i))
        a=ny*stride+i
        faces.append((a,a+1,count+a+1,count+a))
    for j in range(ny):
        a=j*stride
        faces.append((a,a+stride,count+a+stride,count+a))
        b=j*stride+nx
        faces.append((count+b,count+b+stride,b+stride,b))
    fresh = bpy.data.meshes.new(old_mesh.name + " shaped")
    fresh.from_pydata(vertices, [], faces)
    fresh.update()
    fresh.materials.append(old_mesh.materials[0])
    for modifier in list(obj.modifiers):
        obj.modifiers.remove(modifier)
    obj.data = fresh
    bm = bmesh.new()
    bm.from_mesh(fresh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(fresh)
    bm.free()
    for face in fresh.polygons:
        face.use_smooth = True
    smooth = obj.modifiers.new("Soft tailored contour", "SUBSURF")
    smooth.levels = 1
    smooth.render_levels = 1
    bpy.data.meshes.remove(old_mesh)


def refine_room(room):
    maps = _surface_maps()
    for material in bpy.data.materials:
        name = material.name.lower()
        if any(part in name for part in ("plaster", "limewash")):
            _connect(material, maps["wall"], maps["plaster_rough"])
        elif "cabinet" in name or "matte ivory" in name:
            _connect(material, maps["plaster"], maps["plaster_rough"])
        elif "floor" in name and room == "bedroom" and "joint" not in name:
            _connect(material, maps["floor_atlas"], maps["wood_rough"], maps["wood_normal"], .12)
        elif "oak" in name:
            tone = "oak_deep" if "edge" in name else "oak"
            _connect(material, maps[tone], maps["wood_rough"], maps["wood_normal"], .15)
        elif any(part in name for part in ("stone", "limestone", "cut architectural")):
            _connect(material, maps["stone"], maps["stone_rough"])
        elif "rug" in name or "wool" in name:
            _connect(material, maps["rug"], maps["fabric_rough"], maps["fabric_normal"], .28)
        elif any(part in name for part in ("boucle", "linen")):
            _connect(material, maps["linen"], maps["fabric_rough"], maps["fabric_normal"], .24)
        elif "woven" in name or "upholstery" in name:
            _connect(material, maps["fabric"], maps["fabric_rough"], maps["fabric_normal"], .24)

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        name = obj.name.lower()
        kind = None
        if "flat woven duvet" in name:
            kind = "duvet"
        elif "foot of bed folded" in name:
            kind = "mattress"
        elif "standing pillow" in name:
            kind = "upright"
        elif any(part in name for part in ("pillow", "cushion")):
            kind = "pillow"
        elif any(part in name for part in ("sofa plush seat", "sofa upright back", "sofa rounded arm", "mattress")):
            kind = "mattress"
        if kind:
            _sculpt_soft(obj, kind)
        for modifier in obj.modifiers:
            if modifier.type != "BEVEL":
                continue
            if any(part in name for part in ("structural floor", "low solid oak plinth")):
                modifier.width = min(modifier.width, .013)
            elif any(part in name for part in ("cabinet door", "cabinet front", "wardrobe full-height door", "console door")):
                modifier.width = min(modifier.width, .005)
            elif any(part in name for part in ("stone waterfall top", "stone coffee table top", "bedside floating")):
                modifier.width = min(modifier.width, .013)
        if not obj.data.materials:
            continue
        surface = obj.data.materials[0].name.lower()
        if room == "bedroom" and "oak floating floor" in name:
            _uv_floor_atlas(obj)
        elif any(part in surface for part in ("oak", "floor", "stone", "limestone", "plaster", "limewash", "cabinet", "ivory")):
            _uv_by_surface(obj.data, 1.45 if "oak" in surface else 1.8)
        elif any(part in surface for part in ("woven", "linen", "boucle", "rug", "wool", "upholstery")):
            _uv_by_surface(obj.data, .36)

    # Pack every imported map into the editable Blender source as well as the GLB.
    for image in maps.values():
        if not image.packed_file:
            image.pack()
    return maps
