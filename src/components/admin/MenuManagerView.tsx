import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  Save,
  Sparkles,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatCurrency,
  type MenuCategory,
  type MenuItem,
  type StoreSettings,
} from '../../types';
import {
  CATEGORY_DEFAULT_IMAGE,
  STUDIO_IMAGE_OPTIONS,
} from '../../data/defaultMenu';
import {
  createMenuItem,
  deleteMenuItem,
  seedDefaultMenu,
  UnauthorizedError,
  updateMenuItem,
  updateStoreSettings,
} from '../../lib/api';
import { SafeImage } from '../SafeImage';

interface MenuManagerViewProps {
  menuItems: MenuItem[];
  isUsingFallbackMenu: boolean;
  settings: StoreSettings;
  authToken: string;
  onDataChanged: () => Promise<void>;
  onPublicDataChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

interface ItemFormState {
  id: string | null;
  name: string;
  nameEn: string;
  category: MenuCategory;
  description: string;
  price: string;
  size: string;
  imageUrl: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: string;
}

const EMPTY_FORM: ItemFormState = {
  id: null,
  name: '',
  nameEn: '',
  category: 'cut_cups',
  description: '',
  price: '',
  size: 'كوب كبير',
  imageUrl: STUDIO_IMAGE_OPTIONS[0].url,
  isAvailable: true,
  isFeatured: false,
  sortOrder: '10',
};

export function MenuManagerView({
  menuItems,
  isUsingFallbackMenu,
  settings,
  authToken,
  onDataChanged,
  onPublicDataChanged,
  onUnauthorized,
}: MenuManagerViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [savingItem, setSavingItem] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Store Settings Form
  const [storeName, setStoreName] = useState(settings.storeName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [workingHours, setWorkingHours] = useState(settings.workingHours);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setStoreName(settings.storeName);
    setTagline(settings.tagline);
    setPhone(settings.phone);
    setAddress(settings.address);
    setWorkingHours(settings.workingHours);
  }, [settings]);

  const handleSeedDefaultMenu = async () => {
    if (seeding) return;
    setSeeding(true);
    setStatusMessage(null);
    setErrorMsg(null);
    try {
      await seedDefaultMenu(authToken);
      setStatusMessage(
        'تم حفظ أصناف فريستكانتو الستة بنجاح! يمكنك الآن تعديل أي سعر أو إضافة أصناف جديدة.'
      );
      await Promise.all([onDataChanged(), onPublicDataChanged()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تحميل القائمة الافتراضية.');
    } finally {
      setSeeding(false);
    }
  };

  const openCreateModal = () => {
    setForm({
      ...EMPTY_FORM,
      sortOrder: String(menuItems.length + 1),
    });
    setModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setForm({
      id: item.id,
      name: item.name,
      nameEn: item.nameEn || '',
      category: item.category,
      description: item.description,
      price: String(item.price),
      size: item.size,
      imageUrl: item.imageUrl || CATEGORY_DEFAULT_IMAGE[item.category],
      isAvailable: item.isAvailable,
      isFeatured: item.isFeatured,
      sortOrder: String(item.sortOrder ?? 10),
    });
    setModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(form.price);
    if (!form.name.trim() || !Number.isFinite(priceNum) || priceNum < 0 || savingItem) {
      return;
    }

    setSavingItem(true);
    setStatusMessage(null);
    setErrorMsg(null);
    const sortNum = Math.min(10000, Math.max(0, Number(form.sortOrder) || 1));

    const payload = {
      name: form.name.trim().slice(0, 100),
      nameEn: form.nameEn.trim().slice(0, 100),
      category: form.category,
      description: form.description.trim().slice(0, 300),
      price: Number(priceNum.toFixed(2)),
      size: form.size.trim().slice(0, 40),
      imageUrl: (form.imageUrl.trim() || CATEGORY_DEFAULT_IMAGE[form.category]).slice(0, 500),
      isAvailable: form.isAvailable,
      isFeatured: form.isFeatured,
      sortOrder: sortNum,
    };

    try {
      if (form.id && !isUsingFallbackMenu) {
        await updateMenuItem(authToken, form.id, payload);
        setStatusMessage(`تم تحديث "${payload.name}" بنجاح.`);
      } else {
        await createMenuItem(authToken, payload);
        setStatusMessage(`تم إضافة "${payload.name}" إلى المنيو بنجاح.`);
      }
      setModalOpen(false);
      await Promise.all([onDataChanged(), onPublicDataChanged()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر حفظ الصنف.');
    } finally {
      setSavingItem(false);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    if (isUsingFallbackMenu) {
      await handleSeedDefaultMenu();
      return;
    }
    setErrorMsg(null);
    try {
      await updateMenuItem(authToken, item.id, { isAvailable: !item.isAvailable });
      await Promise.all([onDataChanged(), onPublicDataChanged()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تحديث حالة الصنف.');
    }
  };

  const handleDeleteItem = async (item: MenuItem) => {
    if (isUsingFallbackMenu) return;
    setErrorMsg(null);
    try {
      await deleteMenuItem(authToken, item.id);
      setStatusMessage(`تم حذف "${item.name}" من المنيو.`);
      await Promise.all([onDataChanged(), onPublicDataChanged()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر حذف الصنف.');
    }
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || savingSettings) return;
    setSavingSettings(true);
    setStatusMessage(null);
    setErrorMsg(null);
    try {
      await updateStoreSettings(authToken, {
        storeName: storeName.trim().slice(0, 80),
        tagline: tagline.trim().slice(0, 160),
        phone: phone.trim().slice(0, 32),
        address: address.trim().slice(0, 200),
        workingHours: workingHours.trim().slice(0, 100),
        currency: 'ج.م',
      });
      setStatusMessage('تم تحديث بيانات ومعلومات المحل في صفحة العملاء بنجاح.');
      await Promise.all([onDataChanged(), onPublicDataChanged()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'تعذر تحديث بيانات المحل.');
    } finally {
      setSavingSettings(false);
    }
  };

  const sortedItems = [...menuItems].sort(
    (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E3DC]">
        <div>
          <h2 className="font-display text-xl font-bold text-[#171916]">
            إدارة المنيو والأسعار
          </h2>
          <p className="text-xs text-[#676D62] mt-1">
            أي تعديل في الأسعار أو الأصناف ينعكس فوراً في منيو العملاء وشاشة الكاشير.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isUsingFallbackMenu && (
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedDefaultMenu}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {seeding
                  ? 'جاري تفعيل القائمة...'
                  : 'اعتماد وتخزين أصناف فريستكانتو (6 أصناف)'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#15803D] text-white text-xs sm:text-sm font-bold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>
      </div>

      {isUsingFallbackMenu && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
          القائمة الظاهرة حالياً هي قائمة فريستكانتو المبدئية (مانجو قطع، سلطة الفريستكانتو،
          رومانينجو، رمان حب، كوب فريستكانتو، موزة شيكولاتة). اضغط زر{' '}
          <strong>«اعتماد وتخزين أصناف فريستكانتو»</strong> أعلاه لحفظها في قاعدة البيانات
          والبدء في تعديل أسعارها بحرية.
        </div>
      )}

      {statusMessage && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Menu Table */}
      <div className="bg-white border border-[#E5E3DC] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F6F1] text-xs text-[#676D62]">
              <tr>
                <th className="text-right py-3.5 px-4 font-semibold">الصنف</th>
                <th className="text-right py-3.5 px-4 font-semibold">القسم</th>
                <th className="text-right py-3.5 px-4 font-semibold">الحجم</th>
                <th className="text-left py-3.5 px-4 font-semibold">السعر</th>
                <th className="text-center py-3.5 px-4 font-semibold">الحالة</th>
                <th className="text-center py-3.5 px-4 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EFE9]">
              {sortedItems.map((item) => (
                <tr key={item.id} className="hover:bg-[#FAF9F5]">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F3F2EC] border border-[#E7E5DE] shrink-0">
                        <SafeImage
                          src={item.imageUrl || CATEGORY_DEFAULT_IMAGE[item.category]}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-[#171916]">{item.name}</p>
                        <p className="text-xs text-[#676D62] line-clamp-1 max-w-xs">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-[#52584D]">
                    {CATEGORY_LABELS[item.category]}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-[#52584D]">{item.size}</td>
                  <td className="py-3.5 px-4 text-left font-mono-num font-bold text-[#14532D]">
                    {formatCurrency(item.price, settings.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => void handleToggleAvailability(item)}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                        item.isAvailable ? 'text-[#15803D]' : 'text-[#8B9186]'
                      }`}
                    >
                      {item.isAvailable ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>متاح</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>مخفي</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="p-2 rounded-lg text-[#4A5046] hover:bg-[#EFECE4] hover:text-[#171916] cursor-pointer"
                        aria-label={`تعديل ${item.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!isUsingFallbackMenu && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteItem(item)}
                          className="p-2 rounded-lg text-[#8B9186] hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          aria-label={`حذف ${item.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Store Settings Editor */}
      <form
        onSubmit={handleSaveStoreSettings}
        className="bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-5"
      >
        <div>
          <h3 className="font-display text-base font-bold text-[#171916]">
            بيانات المحل الظاهرة للعملاء
          </h3>
          <p className="text-xs text-[#676D62] mt-0.5">
            تظهر هذه البيانات في واجهة المنيو العامة (العنوان، الهاتف، ومواعيد العمل).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#52584D] mb-1">
              اسم المحل
            </label>
            <input
              type="text"
              required
              maxLength={80}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#52584D] mb-1">
              رقم الهاتف / الواتساب
            </label>
            <input
              type="text"
              maxLength={32}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
              dir="ltr"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[#52584D] mb-1">
              الوصف التعريفي (السلوجان)
            </label>
            <input
              type="text"
              maxLength={160}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#52584D] mb-1">
              العنوان
            </label>
            <input
              type="text"
              maxLength={200}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#52584D] mb-1">
              مواعيد العمل
            </label>
            <input
              type="text"
              maxLength={100}
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#171916] text-white text-sm font-bold hover:bg-[#14532D] cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ بيانات المحل'}</span>
          </button>
        </div>
      </form>

      {/* Add / Edit Item Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E5E3DC] max-w-xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#EFECE4] mb-5">
              <h3 className="font-display text-lg font-bold text-[#171916]">
                {form.id ? 'تعديل الصنف والسعر' : 'إضافة صنف جديد للمنيو'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#676D62] hover:text-[#171916] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    اسم الصنف بالعربي *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: رومانينجو"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    الاسم بالإنجليزي (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={form.nameEn}
                    onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                    placeholder="Romanengo Cup"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    القسم *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as MenuCategory })
                    }
                    className="w-full px-3 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  >
                    {CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    السعر ({settings.currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100000}
                    step="any"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1">
                    الحجم / العبوة
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    placeholder="كوب كبير / علبة"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-1">
                  وصف المكونات
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="وصف مختصر للفواكه والمكونات..."
                  className="w-full px-3.5 py-2 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-2">
                  اختر صورة الصنف
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 mb-2">
                  {STUDIO_IMAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.url}
                      type="button"
                      onClick={() => setForm({ ...form, imageUrl: opt.url })}
                      className={`rounded-xl overflow-hidden border text-right cursor-pointer ${
                        form.imageUrl === opt.url
                          ? 'border-[#15803D] ring-2 ring-[#15803D]/25'
                          : 'border-[#E5E3DC]'
                      }`}
                    >
                      <div className="aspect-[4/3] bg-[#F3F2EC]">
                        <SafeImage
                          src={opt.url}
                          alt={opt.label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-[10px] font-semibold text-[#4A5046] p-1 truncate text-center">
                        {opt.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#171916] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isAvailable}
                    onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                    className="accent-[#15803D] w-4 h-4"
                  />
                  <span>متاح في منيو العملاء</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#171916] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                    className="accent-[#15803D] w-4 h-4"
                  />
                  <span>تمييز الصنف (الأكثر طلباً)</span>
                </label>
              </div>

              <div className="pt-4 border-t border-[#EFECE4] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#DEDCD3] text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-6 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                >
                  {savingItem ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'إضافة للمنيو'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
