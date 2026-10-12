/** One-time Canvas preparation for local PNGs; original files stay untouched. */
export interface PreparedMeme {
  canvas: HTMLCanvasElement;
  backgroundRemoved: boolean;
}

const smoothstep = (min: number, max: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
};

function keyStrength(r: number, g: number, b: number): number {
  const dominance = g - Math.max(r, b);
  return smoothstep(12, 65, dominance) * smoothstep(0.07, 0.26, dominance / (g + 1)) * smoothstep(65, 120, g);
}

export function prepareMemeSource(source: HTMLImageElement | HTMLCanvasElement): PreparedMeme {
  const scale = Math.min(1, 1024 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const working = document.createElement('canvas');
  working.width = width;
  working.height = height;
  const ctx = working.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D недоступен');
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const rows = new Uint32Array(height);
  const columns = new Uint32Array(width);
  let strongGreen = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] > 16 && keyStrength(pixels[i], pixels[i + 1], pixels[i + 2]) > 0.92) {
        rows[y]++;
        columns[x]++;
        strongGreen++;
      }
    }
  }
  const backgroundRemoved = strongGreen / (width * height) > 0.03;
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  if (backgroundRemoved) {
    // A green screenshot region is distinct from phone status/navigation bars.
    while (top < bottom && rows[top] < width * 0.08) top++;
    while (bottom > top && rows[bottom] < width * 0.08) bottom--;
    while (left < right && columns[left] < height * 0.08) left++;
    while (right > left && columns[right] < height * 0.08) right--;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x < left || x > right || y < top || y > bottom) { pixels[i + 3] = 0; continue; }
      if (!backgroundRemoved) continue;
      const strength = keyStrength(pixels[i], pixels[i + 1], pixels[i + 2]);
      pixels[i + 3] = Math.round(pixels[i + 3] * (1 - strength));
      if (strength > 0) {
        // Despill removes the thin green fringe without recoloring opaque skin/clothes.
        const maximum = Math.max(pixels[i], pixels[i + 2]);
        pixels[i + 1] = Math.round(pixels[i + 1] * (1 - strength) + Math.min(pixels[i + 1], maximum + 5) * strength);
      }
    }
  }
  const originalAlpha = new Uint8ClampedArray(width * height);
  for (let p = 0; p < originalAlpha.length; p++) originalAlpha[p] = pixels[p * 4 + 3];
  let cropLeft = width;
  let cropTop = height;
  let cropRight = -1;
  let cropBottom = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const p = y * width + x;
      if (!originalAlpha[p]) continue;
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) sum += originalAlpha[py * width + px];
        }
      }
      pixels[p * 4 + 3] = Math.min(originalAlpha[p], Math.round(sum / 9));
      if (pixels[p * 4 + 3] > 8) {
        cropLeft = Math.min(cropLeft, x);
        cropRight = Math.max(cropRight, x);
        cropTop = Math.min(cropTop, y);
        cropBottom = Math.max(cropBottom, y);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  if (cropRight < cropLeft || cropBottom < cropTop) return { canvas: working, backgroundRemoved };
  const canvas = document.createElement('canvas');
  canvas.width = cropRight - cropLeft + 1;
  canvas.height = cropBottom - cropTop + 1;
  canvas.getContext('2d')!.drawImage(working, cropLeft, cropTop, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { canvas, backgroundRemoved };
}

/** A character cutout, not a photo pasted over an opaque colored disk. */
export function drawMemeCutout(ctx: CanvasRenderingContext2D, source: HTMLImageElement | HTMLCanvasElement, color: string, size: number): void {
  const prepared = prepareMemeSource(source).canvas;
  const padding = 5;
  const scale = (size - padding * 2) / Math.max(prepared.width, prepared.height);
  const width = prepared.width * scale;
  const height = prepared.height * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.shadowColor = color + '85';
  ctx.shadowBlur = 3;
  ctx.drawImage(prepared, x, y, width, height);
  ctx.restore();
  // Soft circular envelope keeps the artwork within its invisible round collider.
  const center = size / 2;
  const mask = ctx.createRadialGradient(center, center, center - 8, center, center, center - 1);
  mask.addColorStop(0, '#fff');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}
