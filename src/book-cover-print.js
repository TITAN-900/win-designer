// A single, complete print master. All marks share the cover's UVs and lighting;
// nothing on the physical cover is positioned/animated as an HTML overlay.
export const COVER_TITLE = 'Between form\nand life.';
export const COVER_BRAND = 'WIN JOINERY';
export const COVER_COMPANY = 'WIN JOINERY SDN BHD';

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  return result;
}

export async function paintCover(mobile, maxTextureSize) {
  const width = Math.min(mobile ? 1024 : 1536, Math.floor(maxTextureSize / 1.34));
  const height = Math.round(width * 1.34);
  const color = canvas(width, height);
  const ink = canvas(width, height);
  const context = color.getContext('2d');
  const marks = ink.getContext('2d');
  const heading = getComputedStyle(document.documentElement).getPropertyValue('--font-heading').trim() || 'sans-serif';
  const body = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'sans-serif';
  await document.fonts.ready;
  context.fillStyle = '#c6bba8'; context.fillRect(0, 0, width, height);
  marks.fillStyle = '#fff'; marks.textBaseline = 'top';
  const label = (text, x, y, size, spacing = 0) => {
    marks.font = `500 ${size * width}px ${body}`;
    marks.letterSpacing = `${spacing * width}px`;
    marks.fillText(text, x * width, y * height);
  };
  // The generous right margin remains legible in the intentional mobile crop.
  label(COVER_COMPANY, .115, .092, .0135, .0018);
  label('A PORTFOLIO OF INHABITED SPACE', .115, .125, .0105, .0017);
  // Client has not supplied a logo. This plain wordmark is printed into the
  // same physical ink/roughness master; no invented emblem or old logo loads.
  marks.font = `650 ${width * .046}px ${body}`;
  marks.letterSpacing = `${width * .0026}px`;
  marks.fillText(COVER_BRAND, width * .115, height * .35);
  marks.font = `720 ${width * .084}px ${heading}`;
  marks.letterSpacing = `${width * -.0028}px`;
  COVER_TITLE.split('\n').forEach((line, i) => marks.fillText(line, width * .115, height * (.59 + i * .071)));
  label('SPACE  /  LIGHT  /  MATERIAL', .115, .892, .012, .0018);

  // Ink mask is composited separately so board color is never replaced.
  const darkInk = canvas(width, height);
  const darkContext = darkInk.getContext('2d');
  darkContext.drawImage(ink, 0, 0); darkContext.globalCompositeOperation = 'source-in';
  darkContext.fillStyle = '#302e28'; darkContext.fillRect(0, 0, width, height);
  context.drawImage(darkInk, 0, 0);

  // Half-size physical maps: packed roughness/metalness + subtle deboss/fibre.
  // The albedo has NO baked shine, shadow, grain or fake edge gradient.
  const mapWidth = Math.min(768, Math.floor(width / 2));
  const mapHeight = Math.round(mapWidth * height / width);
  const orm = canvas(mapWidth, mapHeight), normal = canvas(mapWidth, mapHeight);
  const mask = canvas(mapWidth, mapHeight);
  const maskContext = mask.getContext('2d', { willReadFrequently: true });
  maskContext.drawImage(ink, 0, 0, mapWidth, mapHeight);
  const inkData = maskContext.getImageData(0, 0, mapWidth, mapHeight).data;
  const packed = orm.getContext('2d').createImageData(mapWidth, mapHeight);
  const normals = normal.getContext('2d').createImageData(mapWidth, mapHeight);
  const heights = new Float32Array(mapWidth * mapHeight);
  let random = 1907;
  for (let i = 0; i < heights.length; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const fibre = random / 4294967296 - .5;
    const printed = inkData[i * 4 + 3] / 255;
    heights[i] = fibre * .012 - printed * .028;
    packed.data.set([255, Math.round(221 + fibre * 6 - printed * 20), 0, 255], i * 4);
  }
  for (let y = 0; y < mapHeight; y++) for (let x = 0; x < mapWidth; x++) {
    const i = y * mapWidth + x;
    const dx = heights[y * mapWidth + Math.max(0, x - 1)] - heights[y * mapWidth + Math.min(mapWidth - 1, x + 1)];
    const dy = heights[Math.max(0, y - 1) * mapWidth + x] - heights[Math.min(mapHeight - 1, y + 1) * mapWidth + x];
    normals.data.set([Math.round(128 + dx * 95), Math.round(128 + dy * 95), 255, 255], i * 4);
  }
  orm.getContext('2d').putImageData(packed, 0, 0);
  normal.getContext('2d').putImageData(normals, 0, 0);
  color.coverMaps = { orm, normal };
  color.pageLinks = [];
  return color;
}
