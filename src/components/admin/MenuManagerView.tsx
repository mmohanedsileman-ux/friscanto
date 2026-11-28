import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
  ImagePlus,
  Camera,
  Loader2,
  Download,
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
  resolveItemImage,
  STUDIO_IMAGE_OPTIONS,
} from '../../data/defaultMenu';
import {
  createMenuItem,
  deleteMenuItem,
  seedDefaultMenu,
  UnauthorizedError,
  updateMenuItem,
  uploadMenuImage,
} from '../../lib/api';
import { compressImageFile } from '../../lib/imageUpload';
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
  imageUrl: '',
  isAvailable: true,
  isFeatured: false,
  sortOrder: '10',
};

function formatKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}

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
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState<string | null>(null);
  const [pendingImageSize, setPendingImageSize] = useState<number | null>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const resetImageInputs = () => {
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const closeModal = () => {
    if (savingItem) return;
    setModalOpen(false);
    setPendingImageDataUrl(null);
    setPendingImageSize(null);
    setImageError(null);
    setFormError(null);
    resetImageInputs();
  };

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
    setPendingImageDataUrl(null);
    setPendingImageSize(null);
    setImageError(null);
    setFormError(null);
    resetImageInputs();
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
      imageUrl: item.imageUrl || '',
      isAvailable: item.isAvailable,
      isFeatured: item.isFeatured,
      sortOrder: String(item.sortOrder ?? 10),
    });
    setPendingImageDataUrl(null);
    setPendingImageSize(null);
    setImageError(null);
    setFormError(null);
    resetImageInputs();
    setModalOpen(true);
  };

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input immediately so picking the same file again triggers onChange
    e.target.value = '';
    if (!file) return;

    setImageError(null);
    setFormError(null);
    setProcessingImage(true);

    try {
      const compressed = await compressImageFile(file);
      setPendingImageDataUrl(compressed.dataUrl);
      setPendingImageSize(compressed.sizeBytes);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'تعذر معالجة الصورة المختارة. يرجى المحاولة بصورة أخرى.'
      );
    } finally {
      setProcessingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setPendingImageDataUrl(null);
    setPendingImageSize(null);
    setImageError(null);
    setForm((prev) => ({ ...prev, imageUrl: '' }));
    resetImageInputs();
  };

  const handleSelectStudioPreset = (url: string) => {
    setPendingImageDataUrl(null);
    setPendingImageSize(null);
    setImageError(null);
    setForm((prev) => ({ ...prev, imageUrl: url }));
    resetImageInputs();
  };

  const handleSaveItem = async (e: FormEvent) => {
    e.preventDefault();
    if (savingItem || processingImage) return;

    setFormError(null);
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError('يرجى إدخال اسم الصنف بالعربي.');
      return;
    }

    const priceTrimmed = form.price.trim();
    const priceNum = Number(priceTrimmed);
    if (priceTrimmed === '' || !Number.isFinite(priceNum) || priceNum < 0) {
      setFormError('يرجى إدخال سعر صحيح (رقم أكبر من أو يساوي صفر).');
      return;
    }

    const parsedSort = Number(form.sortOrder);
    const sortNum = Number.isFinite(parsedSort)
      ? Math.min(10000, Math.max(0, Math.round(parsedSort)))
      : 10;

    setSavingItem(true);
    setStatusMessage(null);
    setErrorMsg(null);

    try {
      let finalImageUrl = form.imageUrl.trim();
      if (pendingImageDataUrl) {
        const uploaded = await uploadMenuImage(authToken, pendingImageDataUrl);
        finalImageUrl = uploaded.imageUrl;
      }
      if (!finalImageUrl) {
        finalImageUrl = CATEGORY_DEFAULT_IMAGE[form.category];
      }

      const payload = {
        name: trimmedName.slice(0, 100),
        nameEn: form.nameEn.trim().slice(0, 100),
        category: form.category,
        description: form.description.trim().slice(0, 500),
        price: Number(priceNum.toFixed(2)),
        size: form.size.trim().slice(0, 40),
        imageUrl: finalImageUrl.slice(0, 500),
        isAvailable: form.isAvailable,
        isFeatured: form.isFeatured,
        sortOrder: sortNum,
      };

      if (form.id && !isUsingFallbackMenu) {
        await updateMenuItem(authToken, form.id, payload);
        setStatusMessage(`تم تحديث الصنف "${payload.name}" بنجاح.`);
      } else {
        await createMenuItem(authToken, payload);
        setStatusMessage(`تمت إضافة الصنف "${payload.name}" بنجاح.`);
      }

      setModalOpen(false);
      setPendingImageDataUrl(null);
      setPendingImageSize(null);
      resetImageInputs();
      await Promise.all([onDataChanged(), onPublicDataChanged()]);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      const message = error instanceof Error ? error.message : 'تعذر حفظ الصنف. يرجى المحاولة مرة أخرى.';
      setFormError(message);
      setErrorMsg(message);
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

  const handleExportMenuBackup = () => {
    const today = new Date().toISOString().slice(0, 10);
    const backup = {
      exportedAt: new Date().toISOString(),
      storeSettings: {
        storeName: settings.storeName,
        tagline: settings.tagline,
        phone: settings.phone,
        whatsapp: settings.whatsapp || '',
        address: settings.address,
        workingHours: settings.workingHours,
        currency: settings.currency,
      },
      menuItems: sortedItems.map((item) => ({
        id: item.id,
        name: item.name,
        nameEn: item.nameEn || '',
        category: item.category,
        description: item.description,
        price: item.price,
        size: item.size,
        imageUrl: item.imageUrl,
        isAvailable: item.isAvailable,
        isFeatured: item.isFeatured,
        sortOrder: item.sortOrder,
      })),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `firstcanto-menu-backup-${today}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusMessage('تم تصدير نسخة احتياطية للمنيو (JSON) بنجاح.');
  };

  const sortedItems = [...menuItems].sort(
    (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
  );

  const previewSrc =
    pendingImageDataUrl || form.imageUrl.trim() || CATEGORY_DEFAULT_IMAGE[form.category];
  const hasCustomOrSelectedImage = Boolean(pendingImageDataUrl || form.imageUrl.trim());

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
            onClick={handleExportMenuBackup}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white border border-[#DEDCD3] text-[#171916] text-xs sm:text-sm font-bold hover:bg-[#F4F3EE] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#15803D]" />
            <span>تصدير نسخة احتياطية (JSON)</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#15803D] text-white text-xs sm:text-sm font-bold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
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
                          src={resolveItemImage(item.id, item.name, item.category, item.imageUrl)}
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

      {/* Add / Edit Item Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl border border-[#E5E3DC] max-w-xl w-full max-h-[92dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#EFECE4] shrink-0 bg-white">
              <h3 className="font-display text-lg font-bold text-[#171916]">
                {form.id ? 'تعديل الصنف والسعر' : 'إضافة صنف جديد للمنيو'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={savingItem}
                aria-label="إغلاق النافذة"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[#676D62] hover:bg-[#F3F2EC] hover:text-[#171916] cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form
              id="menu-item-form"
              onSubmit={handleSaveItem}
              noValidate
              className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5"
            >
              {formError && (
                <div
                  role="alert"
                  className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-900 font-semibold"
                >
                  {formError}
                </div>
              )}

              {/* Image Upload Section (Top of Form for Immediate Mobile Access) */}
              <div className="space-y-3 p-4 rounded-2xl bg-[#FAFAF8] border border-[#E5E3DC]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#171916]">
                    صورة الصنف
                  </span>
                  <span className="text-[11px] text-[#676D62]">
                    {pendingImageSize
                      ? `مضغوطة جاهزة للرفع (${formatKb(pendingImageSize)})`
                      : hasCustomOrSelectedImage
                      ? 'صورة مخصصة للصنف'
                      : 'بدون صورة — ستُستخدم الصورة الافتراضية للقسم'}
                  </span>
                </div>

                {/* Live Image Preview */}
                <div className="relative rounded-xl overflow-hidden border border-[#DEDCD3] bg-[#F3F2EC] aspect-[16/10] max-h-52 w-full">
                  <SafeImage
                    src={previewSrc}
                    alt={form.name || 'معاينة صورة الصنف'}
                    className="w-full h-full object-cover"
                  />
                  {processingImage && (
                    <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-2 text-white text-xs font-bold">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>جاري ضغط وتجهيز الصورة...</span>
                    </div>
                  )}
                  {hasCustomOrSelectedImage && !processingImage && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white/95 border border-red-200 text-red-700 text-xs font-bold shadow-sm hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الصورة</span>
                    </button>
                  )}
                </div>

                {/* Native Label-Wrapped Gallery & Camera Inputs (100% Mobile Compatible) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-[#15803D] text-[#14532D] text-sm font-bold hover:bg-emerald-50/70 inline-flex items-center justify-center gap-2 select-none ${
                      processingImage || savingItem
                        ? 'opacity-50 pointer-events-none'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      disabled={processingImage || savingItem}
                      onChange={handleFileSelected}
                      className="sr-only"
                    />
                    <ImagePlus className="w-4 h-4 shrink-0" />
                    <span>اختيار من الاستوديو</span>
                  </label>

                  <label
                    className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-[#DEDCD3] text-[#171916] text-sm font-bold hover:bg-[#F3F2EC] inline-flex items-center justify-center gap-2 select-none ${
                      processingImage || savingItem
                        ? 'opacity-50 pointer-events-none'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={processingImage || savingItem}
                      onChange={handleFileSelected}
                      className="sr-only"
                    />
                    <Camera className="w-4 h-4 shrink-0 text-[#15803D]" />
                    <span>التقاط صورة</span>
                  </label>
                </div>

                {imageError && (
                  <p
                    role="alert"
                    className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-semibold"
                  >
                    {imageError}
                  </p>
                )}

                {/* Built-in Studio Presets (Optional Quick Pick) */}
                <div className="pt-2 border-t border-[#EAE8E0]">
                  <p className="text-[11px] font-semibold text-[#676D62] mb-2">
                    أو اختر من صور فريستكانتو الجاهزة:
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {STUDIO_IMAGE_OPTIONS.map((opt) => {
                      const isSelected = !pendingImageDataUrl && form.imageUrl === opt.url;
                      return (
                        <button
                          key={opt.url}
                          type="button"
                          onClick={() => handleSelectStudioPreset(opt.url)}
                          className={`rounded-xl overflow-hidden border text-right cursor-pointer bg-white ${
                            isSelected
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
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Arabic & English Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                    اسم الصنف بالعربي *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: رومانينجو"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                    الاسم بالإنجليزي (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={form.nameEn}
                    onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                    placeholder="Romanengo Cup"
                    dir="ltr"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>

              {/* Category, Price, Size, Sort Order */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                    القسم *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as MenuCategory })
                    }
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  >
                    {CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                    السعر ({settings.currency}) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    required
                    min={0}
                    max={100000}
                    step="any"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="0"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                    الحجم / العبوة (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    placeholder="كوب كبير / علبة"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                    ترتيب العرض
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10000}
                    step={1}
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                    placeholder="1"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm font-mono-num bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[#52584D] mb-1.5">
                  وصف المكونات
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="وصف مختصر للفواكه والمكونات..."
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                />
              </div>

              {/* Availability & Featured Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-3 p-3 min-h-[46px] rounded-xl border border-[#E5E3DC] bg-[#FAFAF8] text-xs sm:text-sm font-semibold text-[#171916] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isAvailable}
                    onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                    className="accent-[#15803D] w-5 h-5 shrink-0"
                  />
                  <span>متاح في منيو العملاء</span>
                </label>
                <label className="flex items-center gap-3 p-3 min-h-[46px] rounded-xl border border-[#E5E3DC] bg-[#FAFAF8] text-xs sm:text-sm font-semibold text-[#171916] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                    className="accent-[#15803D] w-5 h-5 shrink-0"
                  />
                  <span>تمييز الصنف (الأكثر طلباً)</span>
                </label>
              </div>
            </form>

            {/* Sticky Modal Footer */}
            <div className="px-5 sm:px-6 py-4 border-t border-[#EFECE4] bg-white flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                disabled={savingItem}
                onClick={closeModal}
                className="min-h-[46px] px-5 py-2.5 rounded-xl border border-[#DEDCD3] text-sm font-semibold text-[#171916] hover:bg-[#F4F3EE] disabled:opacity-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                form="menu-item-form"
                disabled={savingItem || processingImage}
                className="flex-1 sm:flex-none min-h-[46px] px-6 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {savingItem ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : form.id ? (
                  <span>حفظ التعديلات</span>
                ) : (
                  <span>إضافة للمنيو</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
