export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Use the phone's share menu when there is one; otherwise copy to the clipboard. */
export async function shareOrCopy(data: { title: string; text: string; url: string }): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(`${data.text}\n${data.url}`)) ? 'copied' : 'failed';
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw a shareable 1080×1350 verse card. */
export async function verseImage(opts: { text: string; reference: string }): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const PAD = 110;
  const serif = '"Literata Variable", Georgia, serif';
  const sans = '"Inter Variable", system-ui, sans-serif';
  try {
    await Promise.all([document.fonts.load(`400 48px ${serif}`), document.fonts.load(`600 32px ${sans}`)]);
  } catch {
    // fall back to system fonts
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fbf6ea');
  bg.addColorStop(1, '#efe2c6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Page-edge frame
  ctx.strokeStyle = 'rgba(138, 59, 46, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  // Big opening quote mark
  ctx.fillStyle = 'rgba(138, 59, 46, 0.18)';
  ctx.font = `700 260px ${serif}`;
  ctx.textBaseline = 'top';
  ctx.fillText('“', PAD - 20, 70);

  // Fit the verse text into the middle of the card
  const quote = `${opts.text}`;
  const maxW = W - PAD * 2;
  const maxH = H - 520;
  let size = 64;
  let lines: string[] = [];
  for (; size >= 26; size -= 2) {
    ctx.font = `400 ${size}px ${serif}`;
    lines = wrap(ctx, quote, maxW);
    if (lines.length * size * 1.45 <= maxH) break;
  }
  const lineH = size * 1.45;
  const blockH = lines.length * lineH;
  let y = 300 + (maxH - blockH) / 2;
  ctx.fillStyle = '#2b2520';
  ctx.font = `400 ${size}px ${serif}`;
  for (const l of lines) {
    ctx.fillText(l, PAD, y);
    y += lineH;
  }

  // Reference
  ctx.fillStyle = '#8a3b2e';
  ctx.font = `600 38px ${sans}`;
  ctx.fillText(`— ${opts.reference}`, PAD, y + 36);

  // Footer
  ctx.fillStyle = '#7a6f63';
  ctx.font = `500 28px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText('booksor.com', W - PAD, H - PAD - 10);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'),
  );
}

/** Share the image on phones that support it, otherwise download it. */
export async function shareOrDownloadImage(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** [16,17,18,20] -> "16-18, 20" */
export function compressVerses(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`);
  }
  return parts.join(', ');
}
