import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, MapPin, Phone, Save } from 'lucide-react';
import type { StoreSettings } from '../../types';
import { UnauthorizedError, updateStoreSettings } from '../../lib/api';

interface StoreSettingsViewProps {
  settings: StoreSettings;
  authToken: string;
  onDataChanged: () => Promise<void>;
  onPublicDataChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

export function StoreSettingsView({
  settings,
  authToken,
  onDataChanged,
  onPublicDataChanged,
  onUnauthorized,
}: StoreSettingsViewProps) {
  const [storeName, setStoreName] = useState(settings.storeName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [phone, setPhone] = useState(settings.phone);
  const [whatsapp, setWhatsapp] = useState(settings.whatsapp || '');
  const [address, setAddress] = useState(settings.address);
  const [workingHours, setWorkingHours] = useState(settings.workingHours);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setStoreName(settings.storeName);
    setTagline(settings.tagline);
    setPhone(settings.phone);
    setWhatsapp(settings.whatsapp || '');
    setAddress(settings.address);
    setWorkingHours(settings.workingHours);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || saving) return;

    setSaving(true);
    setSavedMsg(null);
    setErrorMsg(null);

    try {
      await updateStoreSettings(authToken, {
        storeName: storeName.trim().slice(0, 80),
        tagline: tagline.trim().slice(0, 160),
        phone: phone.trim().slice(0, 32),
        whatsapp: whatsapp.trim().slice(0, 32),
        address: address.trim().slice(0, 200),
        workingHours: workingHours.trim().slice(0, 100),
        currency: settings.currency || 'ج.م',
      });
      setSavedMsg('تم حفظ بيانات المحل وتحديثها في واجهة العملاء بنجاح.');
      await Promise.all([onDataChanged(), onPublicDataChanged()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(
        error instanceof Error ? error.message : 'تعذر حفظ بيانات المحل. يرجى المحاولة مجدداً.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-7">
      <div className="pb-5 border-b border-[#E5E3DC]">
        <h2 className="font-display text-xl font-bold text-[#171916]">
          بيانات المحل والتواصل
        </h2>
        <p className="text-xs text-[#676D62] mt-1">
          عدّل رقم الهاتف، الواتساب، العنوان، ومواعيد العمل لتظهر فوراً للعملاء في صفحة المنيو.
        </p>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900 font-medium">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="store-name-input"
                className="block text-xs font-bold text-[#171916] mb-1.5"
              >
                اسم المحل *
              </label>
              <input
                id="store-name-input"
                type="text"
                required
                maxLength={80}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="فريستكانتو"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
              />
            </div>

            <div>
              <label
                htmlFor="store-phone-input"
                className="block text-xs font-bold text-[#171916] mb-1.5"
              >
                رقم الهاتف
              </label>
              <input
                id="store-phone-input"
                type="tel"
                maxLength={32}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0100 000 0000"
                dir="ltr"
                className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="store-whatsapp-input"
              className="block text-xs font-bold text-[#171916] mb-1.5"
            >
              رقم واتساب للطلبات (اختياري — إذا تُرك فارغاً يُستخدم رقم الهاتف)
            </label>
            <input
              id="store-whatsapp-input"
              type="tel"
              maxLength={32}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="0100 000 0000"
              dir="ltr"
              className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>

          <div>
            <label
              htmlFor="store-address-input"
              className="block text-xs font-bold text-[#171916] mb-1.5"
            >
              العنوان التفصيلي
            </label>
            <input
              id="store-address-input"
              type="text"
              maxLength={200}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="مثال: شارع الجمهورية - بجوار ..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>

          <div>
            <label
              htmlFor="store-hours-input"
              className="block text-xs font-bold text-[#171916] mb-1.5"
            >
              مواعيد العمل
            </label>
            <input
              id="store-hours-input"
              type="text"
              maxLength={100}
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              placeholder="يومياً من 10 صباحاً حتى 2 بعد منتصف الليل"
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>

          <div>
            <label
              htmlFor="store-tagline-input"
              className="block text-xs font-bold text-[#171916] mb-1.5"
            >
              الوصف التعريفي (اختياري)
            </label>
            <input
              id="store-tagline-input"
              type="text"
              maxLength={160}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="طازة · فريش · منعش"
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] disabled:opacity-60 smooth-settle cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ بيانات المحل'}</span>
            </button>
          </div>
        </form>

        {/* Live Preview of Customer Contact Card */}
        <div className="lg:col-span-5 space-y-3">
          <p className="text-xs font-bold text-[#52584D] px-1">
            معاينة مباشرة كما ستظهر للعملاء
          </p>
          <div className="bg-white border border-[#E7E5DE] rounded-2xl divide-y divide-[#EFECE4]">
            <div className="p-5 flex items-start gap-3.5">
              <Clock className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">مواعيد العمل</p>
                <p className="text-xs sm:text-sm text-[#5C6158] mt-1">
                  {workingHours || 'لم يتم تحديد مواعيد العمل بعد'}
                </p>
              </div>
            </div>
            <div className="p-5 flex items-start gap-3.5">
              <MapPin className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">العنوان</p>
                <p className="text-xs sm:text-sm text-[#5C6158] mt-1">
                  {address || 'لم يتم إضافة العنوان بعد'}
                </p>
              </div>
            </div>
            <div className="p-5 flex items-start gap-3.5">
              <Phone className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-bold text-[#171916]">
                  للاستفسار والتواصل
                </p>
                <p className="text-xs sm:text-sm text-[#5C6158] font-mono-num mt-1" dir="ltr">
                  {phone || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
