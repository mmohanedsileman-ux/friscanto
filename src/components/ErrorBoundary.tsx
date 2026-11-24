import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(): State {
    return {
      hasError: true,
      message: 'حدث خطأ غير متوقع أثناء عرض الصفحة. اضغط «إعادة تحميل التطبيق» للمتابعة.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Firstcanto ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-6" dir="rtl">
          <div className="max-w-md w-full bg-white border border-[#E5E3DC] rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[#171916] mb-2">تعذر إكمال العملية</h2>
            <p className="text-sm text-[#5C6158] leading-relaxed mb-6">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] smooth-settle cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل التطبيق</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
