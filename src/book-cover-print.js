// A single, complete print master. All marks share the cover's UVs and lighting;
// nothing on the physical cover is positioned/animated as an HTML overlay.
export const COVER_TITLE = 'Between form\nand life.';

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  return result;
}

export async function paintCover(logoURL, mobile, maxTextureSize) {
  const width = Math.min(mobile ? 1024 : 1536, Math.floor(maxTextureSize / 1.34));
  const height = Math.round(width * 1.34);
  const color = canvas(width, height);
  const ink = canvas(width, height);
  const foil = canvas(width, height);
  const context = color.getContext('2d');
  const marks = ink.getContext('2d');
  const metal = foil.getContext('2d', { willReadFrequently: true });
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
  label('WIN DESIGN', .115, .092, .017, .0030);
  label('A PORTFOLIO OF INHABITED SPACE', .115, .125, .0105, .0017);
  marks.font = `720 ${width * .084}px ${heading}`;
  marks.letterSpacing = `${width * -.0028}px`;
  COVER_TITLE.split('\n').forEach((line, i) => marks.fillText(line, width * .115, height * (.59 + i * .071)));
  label('SPACE  /  LIGHT  /  MATERIAL', .115, .892, .012, .0018);

  const logo = new Image(); logo.src = logoURL; await logo.decode();
  const logoWidth = width * .24;
  const logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
  const logoX = width * .115, logoY = height * .35;
  metal.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
  const raw = metal.getImageData(0, 0, width, height);
  const printedLogo = canvas(width, height);
  const logoContext = printedLogo.getContext('2d');
  logoContext.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
  // Detect the original gold pigment only; never redraw or reshape the identity.
  for (let i = 0; i < raw.data.length; i += 4) {
    const r = raw.data[i], g = raw.data[i + 1], b = raw.data[i + 2], a = raw.data[i + 3];
    const gold = r > b * 1.15 && g > b * 1.05 && r > 95;
    raw.data[i] = raw.data[i + 1] = raw.data[i + 2] = 255;
    raw.data[i + 3] = gold ? a : 0;
  }
  metal.putImageData(raw, 0, 0);
  // Ink mask is composited separately so board color is never replaced.
  const darkInk = canvas(width, height);
  const darkContext = darkInk.getContext('2d');
  darkContext.drawImage(ink, 0, 0); darkContext.globalCompositeOperation = 'source-in';
  darkContext.fillStyle = '#302e28'; darkContext.fillRect(0, 0, width, height);
  context.drawImage(darkInk, 0, 0);
  context.drawImage(printedLogo, 0, 0);

  // Half-size physical maps: packed roughness/metalness + subtle deboss/fibre.
  // The albedo has NO baked shine, shadow, grain or fake edge gradient.
  const mapWidth = Math.min(768, Math.floor(width / 2));
  const mapHeight = Math.round(mapWidth * height / width);
  const orm = canvas(mapWidth, mapHeight), normal = canvas(mapWidth, mapHeight);
  const mask = canvas(mapWidth, mapHeight), goldMask = canvas(mapWidth, mapHeight);
  const maskContext = mask.getContext('2d', { willReadFrequently: true });
  maskContext.drawImage(ink, 0, 0, mapWidth, mapHeight);
  maskContext.drawImage(printedLogo, 0, 0, mapWidth, mapHeight);
  const goldContext = goldMask.getContext('2d', { willReadFrequently: true });
  goldContext.drawImage(foil, 0, 0, mapWidth, mapHeight);
  const inkData = maskContext.getImageData(0, 0, mapWidth, mapHeight).data;
  const goldData = goldContext.getImageData(0, 0, mapWidth, mapHeight).data;
  const packed = orm.getContext('2d').createImageData(mapWidth, mapHeight);
  const normals = normal.getContext('2d').createImageData(mapWidth, mapHeight);
  const heights = new Float32Array(mapWidth * mapHeight);
  let random = 1907;
  for (let i = 0; i < heights.length; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const fibre = random / 4294967296 - .5;
    const printed = inkData[i * 4 + 3] / 255, gold = goldData[i * 4 + 3] / 255;
    heights[i] = fibre * .012 - printed * .028;
    packed.data.set([255, Math.round(221 + fibre * 6 - printed * 20 - gold * 106), Math.round(gold * 196), 255], i * 4);
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
