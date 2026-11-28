export interface CompressedImageResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  mimeType: 'image/webp' | 'image/jpeg';
}

export const MAX_IMAGE_WIDTH = 1000;
export const MAX_IMAGE_HEIGHT = 1400;
export const MAX_IMAGE_BYTES = 450 * 1024; // Keep comfortably under the 500KB backend cap
const MAX_RAW_FILE_BYTES = 25 * 1024 * 1024; // 25MB safety guard against browser OOM

const ALLOWED_INPUT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/bmp',
]);

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64 = dataUrl.slice(commaIdx + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeImageWithOrientation(file: File): Promise<DecodedSource> {
  // Prefer createImageBitmap with EXIF orientation support when available
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement below (e.g. older Safari or unsupported options)
    }
  }

  return new Promise<DecodedSource>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذر قراءة الصورة. تأكد من أن الملف صورة سليمة وحاول مرة أخرى.'));
    };
    img.src = objectUrl;
  });
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  quality: number
): { dataUrl: string; mimeType: 'image/webp' | 'image/jpeg' } {
  const webpUrl = canvas.toDataURL('image/webp', quality);
  if (webpUrl.startsWith('data:image/webp;base64,')) {
    return { dataUrl: webpUrl, mimeType: 'image/webp' };
  }
  const jpegUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl: jpegUrl, mimeType: 'image/jpeg' };
}

function computeTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let scale = 1;
  if (srcWidth > maxWidth) {
    scale = Math.min(scale, maxWidth / srcWidth);
  }
  if (srcHeight > maxHeight) {
    scale = Math.min(scale, maxHeight / srcHeight);
  }
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

/**
 * Validates, EXIF-orients, resizes (max width 1000px), and compresses an image
 * file in the browser using Canvas before upload.
 */
export async function compressImageFile(file: File): Promise<CompressedImageResult> {
  const normalizedType = (file.type || '').toLowerCase().trim();
  const isImageMime = normalizedType.startsWith('image/');
  const isSvg = normalizedType === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

  if (!isImageMime || isSvg || (normalizedType && !ALLOWED_INPUT_TYPES.has(normalizedType))) {
    throw new Error('الملف المختار ليس صورة مدعومة. يرجى اختيار صورة من نوع JPG أو PNG أو WebP.');
  }

  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('حجم الصورة الأصلي كبير جداً. يرجى اختيار صورة أصغر من 25 ميجابايت.');
  }

  const decoded = await decodeImageWithOrientation(file);
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error('تعذر قراءة أبعاد الصورة. يرجى تجربة صورة أخرى.');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('المتصفح لا يدعم معالجة الصور حالياً.');
    }

    const attempts: Array<{ maxW: number; maxH: number; quality: number }> = [
      { maxW: MAX_IMAGE_WIDTH, maxH: MAX_IMAGE_HEIGHT, quality: 0.8 },
      { maxW: MAX_IMAGE_WIDTH, maxH: MAX_IMAGE_HEIGHT, quality: 0.7 },
      { maxW: MAX_IMAGE_WIDTH, maxH: MAX_IMAGE_HEIGHT, quality: 0.58 },
      { maxW: 800, maxH: 1120, quality: 0.68 },
      { maxW: 720, maxH: 1000, quality: 0.55 },
    ];

    let lastResult: CompressedImageResult | null = null;

    for (const attempt of attempts) {
      const { width, height } = computeTargetDimensions(
        decoded.width,
        decoded.height,
        attempt.maxW,
        attempt.maxH
      );

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        // Fill white background so transparent PNGs convert cleanly to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(decoded.source, 0, 0, width, height);
      }

      const { dataUrl, mimeType } = encodeCanvas(canvas, attempt.quality);
      const sizeBytes = estimateDataUrlBytes(dataUrl);
      lastResult = { dataUrl, sizeBytes, width, height, mimeType };

      if (sizeBytes > 0 && sizeBytes <= MAX_IMAGE_BYTES) {
        return lastResult;
      }
    }

    if (lastResult && lastResult.sizeBytes <= 500 * 1024) {
      return lastResult;
    }

    throw new Error('حجم الصورة بعد الضغط ما زال أكبر من الحد المسموح (500 كيلوبايت). يرجى اختيار صورة أخرى.');
  } finally {
    decoded.cleanup();
  }
}
