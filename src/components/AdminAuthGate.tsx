import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { fetchAuthStatus, loginAdmin, setupAdminPassword } from '../lib/api';
import { FRESCANTO_IMAGES } from '../data/defaultMenu';
import { SafeImage } from './SafeImage';

interface AdminAuthGateProps {
  onAuthenticated: (token: string, managedByEnv: boolean) => void;
  onBackToMenu: () => void;
}

export function AdminAuthGate({ onAuthenticated, onBackToMenu }: AdminAuthGateProps) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatusLoading(true);
    fetchAuthStatus()
      .then((res) => {
        if (!active) return;
        setConfigured(res.configured);
      })
      .catch(() => {
        if (!active) return;
        setConfigured(true);
        setErrorMsg('تعذر الاتصال بخادم التحقق. حاول تحديث الصفحة.');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!password) {
      setErrorMsg('يرجى إدخال كلمة سر الإدارة.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await loginAdmin(password);
      setPassword('');
      onAuthenticated(res.token, res.managedByEnv);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'كلمة السر غير صحيحة. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 4) {
      setErrorMsg('يجب أن تتكون كلمة السر من 4 أحرف أو أرقام على الأقل.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('كلمتا السر غير متطابقتين. تأكد من كتابتهما بشكل متطابق.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await setupAdminPassword(password);
      setPassword('');
      setConfirmPassword('');
      onAuthenticated(res.token, res.managedByEnv);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'تعذر حفظ كلمة السر. يرجى المحاولة مرة أخرى.'
      );
      // Re-check status in case another session claimed it
      fetchAuthStatus()
        .then((s) => setConfigured(s.configured))
        .catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  if (statusLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-9 h-9 border-2 border-[#15803D] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#5C6158]">جاري تجهيز بوابة الإدارة...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col justify-between p-6">
      <div className="max-w-md w-full mx-auto pt-4">
        <button
          type="button"
          onClick={onBackToMenu}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#4A5046] hover:text-[#14532D] smooth-settle cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة إلى منيو العملاء</span>
        </button>
      </div>

      <div className="max-w-md w-full mx-auto my-auto py-8">
        <div className="bg-white border border-[#E7E5DE] rounded-2xl p-7 sm:p-8">
          <div className="flex items-center gap-3.5 mb-6 pb-5 border-b border-[#F0EFE9]">
            <div className="w-12 h-12 rounded-full overflow-hidden border border-[#E5B84B] shrink-0">
              <SafeImage
                src={FRESCANTO_IMAGES.logo}
                alt="فريستكانتو"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold text-[#14532D] leading-tight">
                لوحة إدارة فريستكانتو
              </h1>
              <p className="text-xs text-[#676D62]">
                {configured
                  ? 'أدخل كلمة سر الإدارة لفتح لوحة التحكم'
                  : 'تعيين كلمة سر لوحة الإدارة لأول مرة'}
              </p>
            </div>
          </div>

          {!configured ? (
            <>
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 mb-5">
                <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-950 leading-relaxed">
                  اختر كلمة سر خاصة بك الآن لمرة واحدة فقط. بعد حفظها لن يتمكن أي شخص من فتح
                  لوحة الإدارة أو الحسابات إلا بهذه الكلمة، ويمكنك تغييرها في أي وقت من داخل
                  اللوحة.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 mb-4 font-semibold">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSetup} className="space-y-4">
                <div>
                  <label
                    htmlFor="setup-admin-password"
                    className="block text-xs font-bold text-[#171916] mb-1.5"
                  >
                    كلمة السر الجديدة للإدارة
                  </label>
                  <div className="relative">
                    <input
                      id="setup-admin-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      maxLength={128}
                      autoFocus
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="4 أحرف أو أرقام على الأقل"
                      dir="ltr"
                      className="w-full pr-4 pl-11 py-3 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl text-[#171916] focus:outline-none focus:border-[#15803D]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7166] hover:text-[#171916] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-confirm-password"
                    className="block text-xs font-bold text-[#171916] mb-1.5"
                  >
                    تأكيد كلمة السر
                  </label>
                  <input
                    id="setup-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد كتابة كلمة السر"
                    dir="ltr"
                    className="w-full px-4 py-3 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl text-[#171916] focus:outline-none focus:border-[#15803D]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] disabled:opacity-60 smooth-settle flex items-center justify-center gap-2 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{submitting ? 'جاري الحفظ...' : 'حفظ كلمة السر ودخول اللوحة'}</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#F5F4EE] mb-5">
                <Lock className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <p className="text-xs text-[#4A5046] leading-relaxed">
                  لوحة التحكم والحسابات محمية بكلمة سر الإدارة فقط. لا يمكن فتحها بدون إدخال
                  كلمة السر الصحيحة.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 mb-4 font-semibold">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="admin-password"
                    className="block text-xs font-bold text-[#171916] mb-1.5"
                  >
                    كلمة سر الإدارة
                  </label>
                  <div className="relative">
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="أدخل كلمة السر"
                      dir="ltr"
                      className="w-full pr-4 pl-11 py-3 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl text-[#171916] focus:outline-none focus:border-[#15803D]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7166] hover:text-[#171916] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] disabled:opacity-60 smooth-settle flex items-center justify-center gap-2 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{submitting ? 'جاري التحقق...' : 'دخول إلى لوحة الإدارة'}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-[#848A7F]">
        فريستكانتو · بوابة الإدارة المحمية
      </div>
    </div>
  );
}
