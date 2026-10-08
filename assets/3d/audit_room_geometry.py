"""Inspect saved room source geometry, aperture joins and exportable PBR maps.

Run with Blender: blender -b path/to/room.blend --python audit_room_geometry.py
Writes a small inspection report beside the source without modifying the blend.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


def bounds(obj):
    points = [obj.matrix_world @ Vector(point) for point in obj.bound_box]
    return {
        "min": [min(point[axis] for point in points) for axis in range(3)],
        "max": [max(point[axis] for point in points) for axis in range(3)],
    }


def named(fragment):
    return next(obj for obj in bpy.context.scene.objects if fragment in obj.name.lower())


bedroom = "FURN_Bed upholstered mattress" in bpy.data.objects
prefix = "ARCH_Bedroom" if bedroom else "ARCH"
front = named("left front pier" if bedroom else "left wall front pier")
rear = named("left rear pier" if bedroom else "left wall rear pier")
sill, head = named("window sill wall"), named("window head")
glazing = named("glazing")
front_box, rear_box, sill_box, head_box, glass_box = map(bounds, (front,rear,sill,head,glazing))
front_overlap = front_box["max"][1] - sill_box["min"][1]
rear_overlap = sill_box["max"][1] - rear_box["min"][1]
assert .0049 <= front_overlap <= .0051
assert .0049 <= rear_overlap <= .0051
assert abs(head_box["min"][2] - 2.60) < 1e-5
assert abs(head_box["max"][2] - 2.92) < 1e-5
assert abs(sill_box["max"][2] - .86) < 1e-5
assert glass_box["min"][2] < .86 < 2.60 < glass_box["max"][2]
for obj in (front,rear,sill,head):
    for modifier in obj.modifiers:
        if modifier.type == "BEVEL":
            assert modifier.width <= .00201, "Join bevel must not exceed the overlap"

materials = {}
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    textures = []
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            destinations = [link.to_socket.name for output in node.outputs for link in output.links]
            space = node.image.colorspace_settings.name
            if "Roughness" in destinations or any(link.to_node.type == "NORMAL_MAP" for output in node.outputs for link in output.links):
                assert space == "Non-Color", material.name
            elif "Base Color" in destinations:
                assert space == "sRGB", material.name
            textures.append({"image":node.image.name,"size":list(node.image.size),"color_space":space,"targets":destinations})
    strengths = [node.inputs["Strength"].default_value for node in material.node_tree.nodes if node.type == "NORMAL_MAP"]
    assert all(value <= .16001 for value in strengths), material.name
    materials[material.name] = {"textures":textures,"normal_strength":strengths}

mesh_count, triangles = 0, 0
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    mesh_count += 1
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    assert all(math.isfinite(value) for vertex in mesh.vertices for value in vertex.co)
    assert all(math.isfinite(value) for uv in mesh.uv_layers for item in uv.data for value in item.uv)
    if any(node.type == "TEX_IMAGE" and node.image for material in mesh.materials if material and material.use_nodes for node in material.node_tree.nodes):
        assert mesh.uv_layers, obj.name
    evaluated.to_mesh_clear()

if bedroom:
    floor = materials["MAT_03_Satin pale oak floor"]["textures"]
    assert len(floor) == 3 and all(item["size"] == [768,768] for item in floor)
    assert all("v2-768" in item["image"] for item in floor)

report = {
    "source":str(Path(bpy.data.filepath).name),
    "window":{"front_jamb_overlap_m":front_overlap,"rear_jamb_overlap_m":rear_overlap,
              "sill_top_m":sill_box["max"][2],"head_bottom_m":head_box["min"][2],
              "rear_pier_bounds":rear_box,"glazing_bounds":glass_box},
    "mesh_objects":mesh_count,"evaluated_mesh_triangles":triangles,
    "collections":{c.name:sorted(o.name for o in c.objects if o.type in {"MESH","CURVE"}) for c in bpy.data.collections if c.name[:2].isdigit()},
    "materials":materials,
    "checks":"Window joins, opening, finished-edge clearance, finite geometry/UVs, PBR color spaces and normal strengths passed.",
}
target = Path(bpy.data.filepath).with_suffix(".quality-audit.json")
target.write_text(json.dumps(report,indent=2),encoding="utf-8")
print("ROOM_GEOMETRY_AUDIT_PASSED",json.dumps({"path":str(target),"window":report["window"],"mesh_objects":mesh_count,"triangles":triangles}))
