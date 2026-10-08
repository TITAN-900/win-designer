// Physical framing and bounded GPU budgets; no page geometry is removed to fit.
export function bookFrame(width, height, mobile) {
  const aspect = width / Math.max(1, height);
  const worldHeight = Math.max(mobile ? 1.43 : 1.58, (mobile ? 1.22 : 2.42) / aspect);
  return { worldHeight, worldWidth: worldHeight * aspect, centerX: mobile ? .40 : 0,
    cameraY: mobile ? -.8 : 0, leftAngle: .035 };
}

export function bookPixelRatio(width, height, deviceRatio = 1, mobile = false) {
  return Math.min(Math.max(1, deviceRatio), mobile ? 2 : 1.75,
    Math.sqrt(2_200_000 / Math.max(1, width * height)));
}

export function pageRasterSize(width, height, mobile, maxTextureSize = 4096) {
  // Four cached pages: ~28 MiB including mipmaps on high-density phones.
  // Keep layout CSS-independent from print resolution, so captions don't shrink.
  const maxWidth = mobile ? 1024 : 1536;
  const requested = mobile ? Math.max(768, width * 3) : Math.max(1024, width * 2.2);
  const scale = Math.min(Math.min(maxWidth, requested) / width,
    maxTextureSize / Math.max(width, height));
  return { width: Math.floor(width * scale), height: Math.floor(height * scale), scale };
}

export function visibleGrabBounds(bounds, width, height, handleWidth = 28) {
  // An off-screen paper edge remains draggable from the viewport edge. This
  // narrow gutter never overlays the center of the printed project photographs.
  const half = handleWidth / 2;
  const top = Math.max(0, bounds.y);
  return { x: Math.max(half, Math.min(width - half, bounds.x)), y: top,
    height: Math.max(0, Math.min(height, bounds.y + bounds.height) - top), width: handleWidth };
}
