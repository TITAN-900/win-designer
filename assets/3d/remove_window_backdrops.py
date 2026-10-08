"""Remove the four obsolete exterior mock-up meshes from each saved room.

No furniture, camera, material, window frame or light is re-created. Builders
also omit these meshes, so a fresh build and this in-place repair agree.
"""
import bpy
from pathlib import Path

root = Path(__file__).resolve().parent
for slug in ('space-01', 'space-02'):
    stem = 'win_' + slug.replace('-', '_')
    source = root / slug / f'{stem}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    exterior = bpy.data.collections.get('08_EXT_WindowView')
    assert exterior is not None
    targets = [o for o in exterior.objects if o.type == 'MESH']
    assert all(o.name.startswith('EXT_') and any(word in o.name.lower()
               for word in ('sky', 'residence')) for o in targets)
    assert len(targets) in (0, 4), 'Refuse to remove unexpected exterior objects'
    for obj in targets:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(root / slug / f'{stem}_preview.png')
    bpy.ops.render.render(write_still=True)
    print('WINDOW_BACKDROP_REMOVED', slug, len(targets))
