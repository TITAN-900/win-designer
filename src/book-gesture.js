import { unit } from './page-curl-math.js';

// Pointer intent stays unclaimed until movement clearly belongs to the book.
// The canvas keeps touch-action: pan-y, so vertical touch scrolling is native.
export function pageGesture(event, { direction, handle, distance, corner, href = null }) {
  return { pointerId: event.pointerId, direction, handle, distance, corner, href,
    startX: event.clientX, startY: event.clientY, lastX: event.clientX,
    time: event.timeStamp, velocity: 0, progress: 0, moved: 0,
    axis: 'pending', released: false };
}

export function movePageGesture(intent, event) {
  if (intent.released || event.pointerId !== intent.pointerId) return 'ignore';
  const dx = event.clientX - intent.startX, dy = event.clientY - intent.startY;
  intent.moved = Math.max(intent.moved, Math.hypot(dx, dy));
  let starting = false;
  if (intent.axis === 'pending') {
    if (Math.abs(dy) >= 8 && Math.abs(dy) >= Math.abs(dx)) intent.axis = 'vertical';
    else if (Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      intent.axis = 'horizontal'; starting = true;
    } else return 'pending';
  }
  if (intent.axis === 'vertical') return 'scroll';
  const progress = unit(-dx * intent.direction / Math.max(1, intent.distance));
  const dt = Math.max(8, event.timeStamp - intent.time) / 1000;
  intent.velocity = .35 * intent.velocity + .65 * (progress - intent.progress) / dt;
  intent.progress = progress;
  intent.lastX = event.clientX;
  intent.time = event.timeStamp;
  return starting ? 'start' : 'drag';
}

export function releasePageGesture(intent, event, cancelled = false) {
  if (intent.released || event.pointerId !== intent.pointerId) return 'ignore';
  const paused = event.timeStamp - intent.time > 100;
  // Some devices report their final movement only with pointerup.
  if (!cancelled) movePageGesture(intent, event);
  intent.released = true;
  intent.cancelled = cancelled;
  if (cancelled || paused) intent.velocity = 0;
  if (cancelled) return 'cancel';
  if (intent.axis === 'pending' && intent.moved < 7) return 'tap';
  return intent.axis === 'horizontal' ? 'release' : 'scroll';
}
