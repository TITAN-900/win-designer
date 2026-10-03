"""Run with Blender on a saved Space 01/02 blend to catch floating details.

Example: blender -b win_space_02.blend --python ../audit_contacts.py
"""

import bpy
from mathutils import Vector


def bounds(name):
    obj = bpy.data.objects[name]
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return min(point.z for point in points), max(point.z for point in points)


def axis_bounds(name, axis):
    obj = bpy.data.objects[name]
    values = [getattr(obj.matrix_world @ Vector(corner), axis) for corner in obj.bound_box]
    return min(values), max(values)


def headboard_clearance(item, obstacle, low, high):
    _, item_rear = axis_bounds(item, "y")
    obstacle_front, _ = axis_bounds(obstacle, "y")
    gap = obstacle_front - item_rear
    assert low <= gap <= high, f"{item}: headboard clearance {gap:+.3f} m"
    print(f"HEADBOARD_CLEARANCE_OK {item}: {gap:+.3f} m")


def horizontal_overlap(item, support, minimum=.10):
    def extents(name):
        obj = bpy.data.objects[name]
        ys = [(obj.matrix_world @ Vector(corner)).y for corner in obj.bound_box]
        return min(ys), max(ys)
    item_min, item_max = extents(item)
    support_min, support_max = extents(support)
    overlap = min(item_max, support_max) - max(item_min, support_min)
    assert overlap >= minimum, f"{item}: only {overlap:.3f} m supported front-to-back"
    print(f"OVERLAP_OK {item}: {overlap:.3f} m on {support}")


def contact(item, support, tolerance=.015, penetration=.07):
    bottom, _ = bounds(item)
    _, top = bounds(support)
    gap = bottom - top
    assert -penetration <= gap <= tolerance, (
        f"{item} / {support}: vertical contact error {gap:+.3f} m"
    )
    print(f"CONTACT_OK {item}: {gap:+.3f} m")


def draped_contact(item, support):
    """Check the supported center, not the deliberately hanging duvet hem."""
    obj = bpy.data.objects[item]
    center_vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices
                       if abs(vertex.co.x) < .40 and abs(vertex.co.y) < .40]
    _, top = bounds(support)
    gap = min(vertex.z for vertex in center_vertices) - top
    assert -.035 <= gap <= .015, f"{item}: unsupported center {gap:+.3f} m"
    print(f"CONTACT_OK {item} center: {gap:+.3f} m; hanging hem is intentional")


def flat_duvet(item, support):
    obj = bpy.data.objects[item]
    top = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices
           if vertex.index < len(obj.data.vertices) // 2
           and abs(vertex.co.x) < .85 and abs(vertex.co.y) < .75]
    _, mattress_top = bounds(support)
    rise = max(vertex.z for vertex in top) - mattress_top
    relief = max(vertex.z for vertex in top) - min(vertex.z for vertex in top)
    assert 0 <= rise <= .04, f"Duvet rises too far above mattress: {rise:.3f} m"
    assert relief <= .035, f"Duvet center is too lumpy: {relief:.3f} m"
    duvet_front, _ = axis_bounds(item, "y")
    mattress_front, _ = axis_bounds(support, "y")
    overhang = mattress_front - duvet_front
    assert 0 <= overhang <= .08, f"Duvet foot overhang is implausible: {overhang:.3f} m"
    print(f"FLAT_DUVET_OK rise {rise:.3f} m, relief {relief:.3f} m, foot overhang {overhang:.3f} m")


if "FURN_Bed upholstered mattress" in bpy.data.objects:
    bedroom = (
        ("FURN_Bed low solid oak plinth", "FURN_Bed recessed support 0.38 0.13"),
        ("FURN_Bed recessed support 0.38 0.13", "SOFT_Full bedroom wool rug"),
        ("FURN_Bed recessed support 0.38 2.57", "SOFT_Full bedroom wool rug"),
        ("SOFT_Foot of bed folded wool throw", "SOFT_Bed flat woven duvet"),
        ("SOFT_Standing pillow 1", "FURN_Bed upholstered mattress"),
        ("SOFT_Standing pillow 2", "FURN_Bed upholstered mattress"),
        ("SOFT_Tailored lumbar cushion", "FURN_Bed upholstered mattress"),
        ("DECOR_Wardrobe niche vessel", "JOINERY_Niche shelf 0.67"),
        ("DECOR_Wardrobe niche linen books", "JOINERY_Niche shelf 1.30"),
        ("FURN_Vanity dark leg -1.79", "ARCH_Bedroom oak floating floor"),
        ("FURN_Vanity stool support", "ARCH_Bedroom oak floating floor"),
        ("DECOR_Planter 00 floor vessel", "ARCH_Bedroom oak floating floor"),
        ("SOFT_Left linen bedroom curtain", "ARCH_Bedroom oak floating floor"),
        ("SOFT_Right linen bedroom curtain", "ARCH_Bedroom oak floating floor"),
    )
    for item, support in bedroom:
        contact(item, support)
    for pillow in ("SOFT_Standing pillow 1", "SOFT_Standing pillow 2"):
        horizontal_overlap(pillow, "FURN_Bed upholstered mattress", .15)
    draped_contact("SOFT_Bed flat woven duvet", "FURN_Bed upholstered mattress")
    flat_duvet("SOFT_Bed flat woven duvet", "FURN_Bed upholstered mattress")
    headboard_clearance("FURN_Bed upholstered mattress", "JOINERY_Headboard upholstered vertical bay 3", .005, .025)
    headboard_clearance("FURN_Bed upholstered mattress", "JOINERY_Headboard lower oak shelf", .005, .03)
    headboard_clearance("FURN_Bed low solid oak plinth", "JOINERY_Headboard recessed oak backing", .01, .05)
    for pillow in ("SOFT_Standing pillow 1", "SOFT_Standing pillow 2"):
        headboard_clearance(pillow, "JOINERY_Headboard upholstered vertical bay 3", .002, .04)
    _, duvet_right = axis_bounds("SOFT_Bed flat woven duvet", "x")
    table_right, _ = axis_bounds("JOINERY_Bedside floating oak table 2", "x")
    assert table_right-duvet_right >= .005, "Duvet intersects right bedside table"
    print(f"BEDSIDE_CLEARANCE_OK right: {table_right-duvet_right:+.3f} m")
    _, table_left = axis_bounds("JOINERY_Bedside floating oak table 1", "x")
    duvet_left, _ = axis_bounds("SOFT_Bed flat woven duvet", "x")
    assert duvet_left-table_left >= .005, "Duvet intersects left bedside table"
    print(f"BEDSIDE_CLEARANCE_OK left: {duvet_left-table_left:+.3f} m")
    bed_front, _ = axis_bounds("FURN_Bed low solid oak plinth", "y")
    _, vanity_back = axis_bounds("JOINERY_Vanity oak top", "y")
    assert bed_front-vanity_back >= .35, "Bed leaves insufficient foot-side circulation"
    print(f"WALKWAY_CLEARANCE_OK foot-side: {bed_front-vanity_back:+.3f} m")
else:
    living = (
        ("JOINERY_High cabinet recessed toe support 1", "ARCH_Limestone floor finish"),
        ("FURN_Island stool pedestal 1", "ARCH_Limestone floor finish"),
        ("FURN_Coffee table tapered pedestal 1.20", "SOFT_Rug under seating"),
        ("DECOR_Coffee table book one", "FURN_Oval stone coffee table top"),
        ("DECOR_Coffee table book two", "DECOR_Coffee table book one"),
        ("DECOR_TV console book 1", "JOINERY_TV floating console body"),
        ("DECOR_Floor pot", "ARCH_Limestone floor finish"),
        ("SOFT_Left floor-length curtain", "ARCH_Limestone floor finish"),
        ("SOFT_Right floor-length curtain", "ARCH_Limestone floor finish"),
    )
    for item, support in living:
        contact(item, support)

print("CONTACT_AUDIT_PASSED")
