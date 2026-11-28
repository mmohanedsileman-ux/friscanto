import { useState } from 'react';
import { Citrus } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  eager?: boolean;
}

const SAFE_DATA_IMAGE_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function isSafeImageSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  if (SAFE_DATA_IMAGE_RE.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackLabel,
  eager = false,
}: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (!isSafeImageSrc(src) || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F3F2EE] to-[#E6E8E1] text-[#4A5546] p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Citrus className="w-8 h-8 mb-2 opacity-60 text-[#15803D]" />
        <span className="text-xs font-medium opacity-75 line-clamp-1">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}
