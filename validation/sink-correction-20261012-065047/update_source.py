import bpy
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = root / 'assets/3d/space-01/win_space_01.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
targets = {'JOINERY_Island inset sink dark well', 'JOINERY_Island faucet arch'}

def snapshot(obj):
    data = {'type': obj.type, 'matrix': [list(row) for row in obj.matrix_world],
            'materials': [m.name for m in getattr(obj.data, 'materials', [])]}
    if obj.type == 'MESH':
        data['vertices'] = [list(v.co) for v in obj.data.vertices]
        data['polygons'] = [list(p.vertices) for p in obj.data.polygons]
        data['uv'] = [[list(p.uv) for p in layer.data] for layer in obj.data.uv_layers]
    elif obj.type == 'CURVE':
        data['splines'] = [[list(p.co) for p in s.points] for s in obj.data.splines]
    elif obj.type == 'LIGHT':
        data['light'] = [obj.data.type, obj.data.energy, list(obj.data.color), obj.data.size]
    elif obj.type == 'CAMERA':
        data['camera'] = [obj.data.type, obj.data.ortho_scale, obj.data.shift_x, obj.data.shift_y, obj.data.lens]
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

before = {obj.name: snapshot(obj) for obj in bpy.context.scene.objects}
sink = bpy.data.objects['JOINERY_Island inset sink dark well']
faucet = bpy.data.objects['JOINERY_Island faucet arch']
assert sink.type == 'MESH' and faucet.type == 'CURVE'
assert abs(sink.location.z - .927) < 1e-6
sink.location.z = .920
points = [(-1.91,.37,.9175), (-1.91,.37,1.16), (-1.91,.40,1.27),
          (-1.91,.53,1.30), (-1.91,.60,1.19)]
assert len(faucet.data.splines) == 1 and len(faucet.data.splines[0].points) == len(points)
for point, xyz in zip(faucet.data.splines[0].points, points):
    point.co = (*xyz, 1)
bpy.context.view_layer.update()
after = {obj.name: snapshot(obj) for obj in bpy.context.scene.objects}
changed = sorted(name for name in before if before[name] != after[name])
assert set(before) == set(after) and set(changed) == targets, changed
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(source))
Path(__file__).with_name('source-audit.json').write_text(json.dumps({
    'changed_objects': changed, 'unchanged_objects': len(before) - len(changed),
    'faucet_points': points, 'sink_center': list(sink.location)
}, indent=2))
print('SINK_SOURCE_AUDIT', changed, 'unchanged', len(before) - len(changed))
