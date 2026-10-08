"""Render transparent square posters without changing the saved room sources."""
import bpy
import sys
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parent
slugs = tuple(sys.argv[sys.argv.index('--')+1:]) if '--' in sys.argv else ('space-01', 'space-02')
if not slugs or any(slug not in {'space-01','space-02'} for slug in slugs):
    raise ValueError('Choose space-01 and/or space-02 after --')
for slug in slugs:
    stem = 'win_' + slug.replace('-', '_')
    source = root / slug / f'{stem}.blend'
    target = root / slug / f'{stem}_poster.png'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    camera = scene.camera
    camera.data.shift_x = 0
    camera.data.ortho_scale = 11.9
    camera.location = (9.7, -11.5, 9.2)
    camera.rotation_euler = (Vector((0, 0, 1.08)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.film_transparent = True
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 48
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)
    print('WEB_POSTER_RESULT', target, target.stat().st_size)
