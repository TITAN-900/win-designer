"""Render a transparent, square Space 01 poster without changing its .blend."""
import bpy
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parent
source = root / 'space-01' / 'win_space_01.blend'
target = root / 'space-01' / 'win_space_01_poster.png'
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
scene.cycles.samples = 32
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(target)
bpy.ops.render.render(write_still=True)
print('WEB_POSTER_RESULT', target, target.stat().st_size)
