// Paint the same measured page layout onto paper textures. Photos, labels and
// branding all deform with the sheet; no flat DOM image sits above the curl.
import { pageRasterSize } from './book-quality.js';

export async function paintPage(markup, width, height, mobile, maxTextureSize) {
  await document.fonts.ready;
  const source = document.createElement('div');
  source.className = 'book-texture-source';
  source.setAttribute('aria-hidden', 'true');
  Object.assign(source.style, { width: `${width}px`, height: `${height}px` });
  source.innerHTML = markup;
  document.body.append(source);
  try {
    await Promise.all([...source.querySelectorAll('img')].map(async image => {
      image.loading = 'eager';
      await image.decode();
    }));
    const canvas = document.createElement('canvas');
    const raster = pageRasterSize(width, height, mobile, maxTextureSize);
    const scale = raster.scale;
    canvas.width = raster.width;
    canvas.height = raster.height;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.scale(scale, scale);
    const origin = source.getBoundingClientRect();
    const box = element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
    };
    canvas.pageLinks = [...source.querySelectorAll('.book-cell')].map(cell => {
      const b = box(cell);
      return { x: b.x / width, y: b.y / height, w: b.w / width, h: b.h / height, href: cell.getAttribute('href') };
    });
    const cover = source.querySelector('.book-cover');
    context.fillStyle = cover ? '#bcb09d' : '#fbf9f3';
    context.fillRect(0, 0, width, height);
    if (cover) {
      const wash = context.createLinearGradient(0, 0, width, height * .6);
      wash.addColorStop(0, '#f6f2e5a8');
      wash.addColorStop(.38, '#f6f2e500');
      wash.addColorStop(1, '#6959441a');
      context.fillStyle = wash;
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#a89b88';
      context.fillRect(0, 0, 9, height);
    }
    for (const image of source.querySelectorAll('img')) {
      const { x, y, w, h } = box(image);
      const fit = getComputedStyle(image).objectFit;
      const ratio = fit === 'contain' ? Math.min(w / image.naturalWidth, h / image.naturalHeight) : Math.max(w / image.naturalWidth, h / image.naturalHeight);
      context.save();
      context.beginPath(); context.rect(x, y, w, h); context.clip();
      context.drawImage(image, x + (w - image.naturalWidth * ratio) / 2, y + (h - image.naturalHeight * ratio) / 2, image.naturalWidth * ratio, image.naturalHeight * ratio);
      context.restore();
    }
    for (const cell of source.querySelectorAll('.book-cell')) {
      const { x, y, w, h } = box(cell);
      const gradient = context.createLinearGradient(0, y + h * .5, 0, y + h);
      gradient.addColorStop(0, '#241e1800'); gradient.addColorStop(1, '#241e18a1');
      context.fillStyle = gradient;
      context.fillRect(x, y + h * .5, w, h * .5);
    }
    for (const element of source.querySelectorAll('span, strong')) {
      const { x, y, w } = box(element);
      const style = getComputedStyle(element);
      const size = parseFloat(style.fontSize);
      const lineHeight = parseFloat(style.lineHeight) || size * 1.2;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.fillStyle = style.color;
      context.textBaseline = 'middle';
      context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
      const raw = element.innerText;
      const text = style.textTransform === 'uppercase' ? raw.toUpperCase() : raw;
      const lines = [];
      for (const paragraph of text.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && context.measureText(candidate).width > w + 1) { lines.push(line); line = word; }
          else line = candidate;
        }
        lines.push(line);
      }
      context.textAlign = style.textAlign === 'right' ? 'right' : style.textAlign === 'center' ? 'center' : 'left';
      const left = context.textAlign === 'right' ? x + w : context.textAlign === 'center' ? x + w / 2 : x;
      lines.forEach((line, i) => context.fillText(line, left, y + lineHeight * (i + .5)));
    }
    return canvas;
  } finally { source.remove(); }
}
