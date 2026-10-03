"""Export the editable Space 01/02 .blend scenes as stage-grouped web GLBs."""
import bpy
import sys
from pathlib import Path

PROJECT=Path(__file__).resolve().parents[2]
SOURCE=Path(__file__).resolve().parent

slugs=tuple(sys.argv[sys.argv.index('--')+1:]) if '--' in sys.argv else ('space-01','space-02')
if not slugs or any(slug not in {'space-01','space-02'} for slug in slugs):
    raise ValueError('Choose space-01 and/or space-02 after --')

for slug in slugs:
    source=SOURCE/slug/f'win_{slug.replace("-", "_")}.blend'
    dest=PROJECT/'public'/'3d'/slug/f'win_{slug.replace("-", "_")}.glb'
    dest.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    collections=[c for c in bpy.data.collections if c.name[:2].isdigit()]
    for c in collections:
        parent=bpy.data.objects.new(c.name,None)
        bpy.context.scene.collection.objects.link(parent)
        for obj in list(c.objects):
            if obj.type not in {'MESH','CURVE'}:continue
            if obj.type=='CURVE':
                bpy.ops.object.select_all(action='DESELECT')
                obj.select_set(True);bpy.context.view_layer.objects.active=obj
                bpy.ops.object.convert(target='MESH')
                obj=bpy.context.view_layer.objects.active
            matrix=obj.matrix_world.copy()
            obj.parent=parent
            obj.matrix_world=matrix
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type in {'MESH','EMPTY'}:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',
                              use_selection=True,export_apply=True,
                              export_cameras=False,export_lights=False)
    print('ROOM_EXPORT_RESULT',slug,dest,dest.stat().st_size)
