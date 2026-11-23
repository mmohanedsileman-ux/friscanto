import { useCallback, useEffect, useState } from 'react';
import {
  ShoppingBag,
  BookOpenText,
  Calculator,
  CalendarRange,
  TrendingUp,
  UtensilsCrossed,
  Store,
  LogOut,
  Menu,
  X,
  KeyRound,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import {
  type AdminTab,
  type DailyClosing,
  type Expense,
  type MenuItem,
  type MonthlyClosing,
  type Order,
  type StoreSettings,
} from '../types';
import { DEFAULT_MENU_ITEMS, FRESCANTO_IMAGES } from '../data/defaultMenu';
import {
  changeAdminPassword,
  fetchAdminBootstrap,
  resetTestData,
  UnauthorizedError,
} from '../lib/api';
import { SafeImage } from './SafeImage';
import { PosView } from './admin/PosView';
import { AccountingView } from './admin/AccountingView';
import { DailyClosingView } from './admin/DailyClosingView';
import { MonthlyClosingView } from './admin/MonthlyClosingView';
import { AnalyticsView } from './admin/AnalyticsView';
import { MenuManagerView } from './admin/MenuManagerView';
import { StoreSettingsView } from './admin/StoreSettingsView';
import { PWAInstallButton } from './PWAInstallButton';

interface AdminDashboardProps {
  authToken: string;
  managedByEnv: boolean;
  settings: StoreSettings;
  onTokenChange: (nextToken: string) => void;
  onLogout: () => void;
  onBackToMenu: () => void;
  onPublicDataChanged: () => Promise<void>;
}

const NAV_ITEMS: { id: AdminTab; label: string; icon: typeof ShoppingBag }[] = [
  { id: 'pos', label: 'الكاشير والأوردرات', icon: ShoppingBag },
  { id: 'accounts', label: 'نظام الحسابات والخزينة', icon: BookOpenText },
  { id: 'daily', label: 'تقفيل الحساب اليومي', icon: Calculator },
  { id: 'monthly', label: 'تقفيل الحساب الشهري', icon: CalendarRange },
  { id: 'analytics', label: 'الأصناف الأكثر طلباً', icon: TrendingUp },
  { id: 'menu', label: 'إدارة المنيو والأسعار', icon: UtensilsCrossed },
  { id: 'settings', label: 'بيانات المحل والتواصل', icon: MapPin },
];

export function AdminDashboard({
  authToken,
  managedByEnv,
  settings,
  onTokenChange,
  onLogout,
  onBackToMenu,
  onPublicDataChanged,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('pos');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [serverMenu, setServerMenu] = useState<MenuItem[]>([]);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([]);
  const [monthlyClosings, setMonthlyClosings] = useState<MonthlyClosing[]>([]);
  const [adminSettings, setAdminSettings] = useState<StoreSettings>(settings);
  const [envManaged, setEnvManaged] = useState(managedByEnv);
  const [storageMode, setStorageMode] = useState<'cloud_kv' | 'local_file' | 'tmp_ephemeral' | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Security & Reset Modal State
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resettingData, setResettingData] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    try {
      setLoadingError(null);
      const data = await fetchAdminBootstrap(authToken);
      setServerMenu(data.menuItems);
      setOrders(data.orders);
      setExpenses(data.expenses);
      setDailyClosings(data.dailyClosings);
      setMonthlyClosings(data.monthlyClosings);
      setAdminSettings(data.storeSettings);
      setEnvManaged(data.managedByEnv);
      setStorageMode(data.storageMode ?? null);
      setMenuLoaded(true);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onLogout();
        return;
      }
      setLoadingError(
        err instanceof Error ? err.message : 'تعذر تحميل بيانات لوحة الإدارة.'
      );
    }
  }, [authToken, onLogout]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const isUsingFallbackMenu = menuLoaded && serverMenu.length === 0;
  const effectiveMenu: MenuItem[] =
    serverMenu.length > 0 ? serverMenu : DEFAULT_MENU_ITEMS;

  const currentTabLabel =
    NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'لوحة الإدارة';

  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const openSecurityModal = () => {
    setPasswordFeedback(null);
    setPasswordError(null);
    setResetFeedback(null);
    setResetError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setResetPasswordInput('');
    setSecurityModalOpen(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordFeedback(null);

    if (newPassword.length < 4) {
      setPasswordError('يجب أن تتكون كلمة السر الجديدة من 4 أحرف أو أرقام على الأقل.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('كلمتا السر الجديدتان غير متطابقتين.');
      return;
    }

    setSavingPassword(true);
    try {
      const { token } = await changeAdminPassword(authToken, currentPassword, newPassword);
      onTokenChange(token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordFeedback('تم تغيير كلمة سر الإدارة بنجاح.');
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'تعذر تغيير كلمة السر. تأكد من كلمة السر الحالية.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResetTestData = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetFeedback(null);

    if (!resetPasswordInput) {
      setResetError('أدخل كلمة سر الإدارة لتأكيد مسح بيانات التجربة.');
      return;
    }

    setResettingData(true);
    try {
      await resetTestData(authToken, resetPasswordInput);
      setResetPasswordInput('');
      setResetFeedback(
        'تم تصفير جميع الأوردرات والمصروفات وتقفيلات الحسابات بنجاح (مع الاحتفاظ بالمنيو والأسعار).'
      );
      await loadAdminData();
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : 'كلمة السر غير صحيحة؛ لم يتم مسح أي بيانات.'
      );
    } finally {
      setResettingData(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F5F0] text-[#171916] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-l border-[#E5E3DC] shrink-0 sticky top-0 h-screen no-print">
        <div className="p-5 border-b border-[#EFECE4] flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden border border-[#E5B84B] shrink-0">
            <SafeImage
              src={FRESCANTO_IMAGES.logo}
              alt="فريستكانتو"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold text-[#14532D] truncate">
              {adminSettings.storeName || 'فريستكانتو'}
            </p>
            <p className="text-xs text-[#676D62]">لوحة الإدارة والحسابات</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold smooth-settle cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#15803D] text-white'
                    : 'text-[#4A5046] hover:bg-[#F3F2EC] hover:text-[#171916]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#EFECE4] space-y-2">
          <PWAInstallButton variant="sidebar" />
          <button
            type="button"
            onClick={openSecurityModal}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#DEDCD3] text-xs font-bold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-[#15803D]" />
            <span>كلمة السر وتصفير التجربة</span>
          </button>

          <button
            type="button"
            onClick={onBackToMenu}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-[#DEDCD3] text-xs font-bold text-[#171916] hover:bg-[#F4F3EE] cursor-pointer"
          >
            <Store className="w-4 h-4 text-[#15803D]" />
            <span>عرض منيو العملاء</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#171916] text-white text-xs font-bold hover:bg-red-700 smooth-settle cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>قفل لوحة الإدارة</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 lg:hidden no-print"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] h-full bg-white p-5 flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#EFECE4] mb-4">
                <span className="font-display text-lg font-extrabold text-[#14532D]">
                  {adminSettings.storeName || 'فريستكانتو'}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 text-[#52584D] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold cursor-pointer ${
                        active
                          ? 'bg-[#15803D] text-white'
                          : 'text-[#4A5046] hover:bg-[#F3F2EC]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-2 pt-4 border-t border-[#EFECE4]">
              <PWAInstallButton variant="sidebar" />
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  openSecurityModal();
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-[#DEDCD3] text-xs font-bold text-[#171916] flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-[#15803D]" />
                <span>كلمة السر وتصفير التجربة</span>
              </button>
              <button
                type="button"
                onClick={onBackToMenu}
                className="w-full py-2.5 px-3 rounded-xl border border-[#DEDCD3] text-xs font-bold text-[#171916] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Store className="w-4 h-4 text-[#15803D]" />
                <span>عرض منيو العملاء</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-2.5 px-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>قفل اللوحة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Contextual Top Bar */}
        <header className="h-16 bg-white border-b border-[#E5E3DC] px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="فتح القائمة"
              className="lg:hidden p-2 rounded-lg text-[#171916] hover:bg-[#F3F2EC] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-[#7A8075] hidden sm:inline">
                {adminSettings.storeName || 'فريستكانتو'}
              </span>
              <span className="text-[#C7C4BA] hidden sm:inline">/</span>
              <span className="font-display font-bold text-[#171916] truncate">
                {currentTabLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openSecurityModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#DEDCD3] text-xs font-bold text-[#171916] hover:bg-[#F4F3EE] whitespace-nowrap cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#15803D]" />
              <span className="hidden sm:inline">الأمان وكلمة السر</span>
            </button>
            <button
              type="button"
              onClick={onBackToMenu}
              className="px-3 py-2 rounded-lg border border-[#DEDCD3] text-xs font-bold text-[#171916] hover:bg-[#F4F3EE] whitespace-nowrap cursor-pointer"
            >
              معاينة المنيو
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#171916] text-white text-xs font-bold hover:bg-red-700 smooth-settle whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>قفل اللوحة</span>
            </button>
          </div>
        </header>

        {/* Active View Content */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {storageMode === 'tmp_ephemeral' && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start gap-2.5 no-print">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                تنبيه مهم لحفظ البيانات على Vercel: قاعدة البيانات السحابية (Upstash Redis) غير
                مربوطة بعد. قم بربطها من تبويب <strong>Storage</strong> في مشروعك على Vercel ثم
                اعمل <strong>Redeploy</strong> لضمان حفظ الأوردرات والحسابات بشكل دائم.
              </span>
            </div>
          )}

          {loadingError && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900 flex items-center justify-between gap-3">
              <span>{loadingError}</span>
              <button
                type="button"
                onClick={() => void loadAdminData()}
                className="text-xs font-bold underline cursor-pointer shrink-0"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {activeTab === 'pos' && (
            <PosView
              menuItems={effectiveMenu}
              orders={orders}
              settings={adminSettings}
              authToken={authToken}
              onDataChanged={loadAdminData}
              onUnauthorized={onLogout}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountingView
              orders={orders}
              expenses={expenses}
              settings={adminSettings}
              authToken={authToken}
              onDataChanged={loadAdminData}
              onUnauthorized={onLogout}
            />
          )}

          {activeTab === 'daily' && (
            <DailyClosingView
              orders={orders}
              expenses={expenses}
              dailyClosings={dailyClosings}
              settings={adminSettings}
              authToken={authToken}
              onDataChanged={loadAdminData}
              onUnauthorized={onLogout}
            />
          )}

          {activeTab === 'monthly' && (
            <MonthlyClosingView
              orders={orders}
              expenses={expenses}
              dailyClosings={dailyClosings}
              monthlyClosings={monthlyClosings}
              settings={adminSettings}
              authToken={authToken}
              onDataChanged={loadAdminData}
              onUnauthorized={onLogout}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              orders={orders}
              menuItems={effectiveMenu}
              settings={adminSettings}
            />
          )}

          {activeTab === 'menu' && (
            <MenuManagerView
              menuItems={effectiveMenu}
              isUsingFallbackMenu={isUsingFallbackMenu}
              settings={adminSettings}
              authToken={authToken}
              onDataChanged={loadAdminData}
              onPublicDataChanged={onPublicDataChanged}
              onUnauthorized={onLogout}
            />
          )}

          {activeTab === 'settings' && (
            <StoreSettingsView
              settings={adminSettings}
              authToken={authToken}
              onDataChanged={loadAdminData}
              onPublicDataChanged={onPublicDataChanged}
              onUnauthorized={onLogout}
            />
          )}
        </main>
      </div>

      {/* Security & Test Data Reset Modal */}
      {securityModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 no-print"
          onClick={() => setSecurityModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E5E3DC] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#EFECE4]">
              <h3 className="font-display text-lg font-bold text-[#171916]">
                إعدادات الأمان وكلمة السر
              </h3>
              <button
                type="button"
                onClick={() => setSecurityModalOpen(false)}
                className="text-[#676D62] hover:text-[#171916] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Change Password */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#15803D]" />
                <h4 className="font-display text-sm font-bold text-[#171916]">
                  تغيير كلمة سر لوحة الإدارة
                </h4>
              </div>

              {envManaged ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
                  كلمة السر مُعيّنة حالياً عبر متغير البيئة{' '}
                  <strong dir="ltr">ADMIN_PASSWORD</strong>. لتغييرها، عدّل قيمة المتغير من
                  إعدادات الاستضافة (Secrets / Vercel) ثم أعد التشغيل.
                </div>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-3">
                  {passwordFeedback && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{passwordFeedback}</span>
                    </div>
                  )}
                  {passwordError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 font-semibold">
                      {passwordError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#52584D] mb-1">
                      كلمة السر الحالية
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      dir="ltr"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#52584D] mb-1">
                        كلمة السر الجديدة
                      </label>
                      <input
                        type="password"
                        required
                        minLength={4}
                        maxLength={128}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        dir="ltr"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#52584D] mb-1">
                        تأكيد كلمة السر الجديدة
                      </label>
                      <input
                        type="password"
                        required
                        minLength={4}
                        maxLength={128}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        dir="ltr"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-[#15803D]"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="px-5 py-2.5 rounded-xl bg-[#15803D] text-white text-xs font-bold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                  >
                    {savingPassword ? 'جاري التحديث...' : 'حفظ كلمة السر الجديدة'}
                  </button>
                </form>
              )}
            </div>

            {/* Section 2: Reset Test Data */}
            <div className="pt-5 border-t border-[#EFECE4] space-y-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-red-700" />
                <h4 className="font-display text-sm font-bold text-[#171916]">
                  تصفير بيانات التجربة قبل التشغيل الفعلي
                </h4>
              </div>
              <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200 text-xs text-red-950 flex items-start gap-2.5 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span>
                  يمسح هذا الإجراء جميع الأوردرات والمصروفات وتقفيلات الحساب اليومي والشهري
                  فقط، مع الإبقاء على أصناف المنيو والأسعار كما هي.
                </span>
              </div>

              {resetFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{resetFeedback}</span>
                </div>
              )}
              {resetError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 font-semibold">
                  {resetError}
                </div>
              )}

              <form onSubmit={handleResetTestData} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="password"
                  required
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  placeholder="أدخل كلمة سر الإدارة للتأكيد"
                  dir="ltr"
                  className="flex-1 px-3.5 py-2.5 text-sm bg-[#FAFAF8] border border-[#DEDCD3] rounded-xl focus:outline-none focus:border-red-600"
                />
                <button
                  type="submit"
                  disabled={resettingData}
                  className="px-4 py-2.5 rounded-xl bg-red-700 text-white text-xs font-bold hover:bg-red-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {resettingData ? 'جاري التصفير...' : 'تصفير بيانات التجربة'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
