import { useState } from 'react';
import { Citrus } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function SafeImage({ src, alt, className = '', fallbackLabel }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
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
      onError={() => setFailed(true)}
      className={className}
      loading="lazy"
    />
  );
}
