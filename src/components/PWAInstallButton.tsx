import { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'hero' | 'sidebar';
}

export function PWAInstallButton({ variant = 'hero' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Suppress install prompt when already running as an installed standalone app
  if (isInstalled) {
    return null;
  }

  const buttonClasses =
    variant === 'sidebar'
      ? 'w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#15803D]/30 bg-emerald-50/70 text-xs font-bold text-[#14532D] hover:bg-emerald-100/70 smooth-settle cursor-pointer'
      : 'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#14532D]/25 bg-white text-[#14532D] text-sm font-bold hover:bg-[#EDF3EA] smooth-settle whitespace-nowrap shrink-0 cursor-pointer';

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={buttonClasses}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>تثبيت التطبيق على الموبايل</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={buttonClasses}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>تثبيت على الآيفون</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
            onClick={() => setShowIOSGuide(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div
              className="bg-white rounded-2xl border border-[#E5E3DC] max-w-sm w-full p-6 text-right"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#EFECE4] mb-4">
                <h3
                  id="ios-install-title"
                  className="font-display text-base font-bold text-[#14532D]"
                >
                  تثبيت فريستكانتو على الآيفون
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="إغلاق"
                  className="text-[#676D62] hover:text-[#171916] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <ol className="space-y-3 text-sm text-[#4A5046] leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <Share className="w-4 h-4 text-[#15803D] shrink-0 mt-1" />
                  <span>
                    اضغط على زر <strong>المشاركة (Share)</strong> أسفل متصفح Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <PlusSquare className="w-4 h-4 text-[#15803D] shrink-0 mt-1" />
                  <span>
                    انزل للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                  </span>
                </li>
                <li className="pr-6 text-xs text-[#676D62]">
                  بعدها سيظهر تطبيق فريستكانتو بأيقونته مباشرة على شاشة موبايلك.
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] cursor-pointer"
              >
                فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
