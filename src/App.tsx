import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_MENU_ITEMS, DEFAULT_STORE_SETTINGS } from './data/defaultMenu';
import { fetchPublicBootstrap } from './lib/api';
import type { MenuItem, StoreSettings } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CustomerMenuView } from './components/CustomerMenuView';
import { OfflineIndicator } from './components/OfflineIndicator';

const AdminAuthGate = lazy(() =>
  import('./components/AdminAuthGate').then((m) => ({ default: m.AdminAuthGate }))
);

const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

function getModeFromLocation(): 'customer' | 'admin' {
  if (typeof window === 'undefined') return 'customer';
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  if (path.startsWith('/admin') || hash === '#admin') {
    return 'admin';
  }
  return 'customer';
}

function AdminLoadingFallback() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#171916] flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 mx-auto rounded-full border-2 border-[#15803D] border-t-transparent animate-spin" />
        <p className="font-display text-sm font-bold text-[#4A5046]">جاري التحميل...</p>
      </div>
    </div>
  );
}

function FirstcantoApp() {
  const [viewMode, setViewMode] = useState<'customer' | 'admin'>(getModeFromLocation);

  // Admin session token lives strictly in React memory (never persisted to localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [managedByEnv, setManagedByEnv] = useState(false);

  const [publicMenuItems, setPublicMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadedFromServerRef = useRef(false);

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);

  const loadPublicData = useCallback(async (silent = false) => {
    if (!silent) {
      setMenuLoading(true);
      setLoadError(false);
    }

    try {
      const data = await fetchPublicBootstrap();
      setPublicMenuItems(data.menuItems);
      setStoreSettings({
        ...DEFAULT_STORE_SETTINGS,
        ...data.storeSettings,
      });
      loadedFromServerRef.current = true;
      setLoadedFromServer(true);
      setLoadError(false);
    } catch {
      if (!silent && !loadedFromServerRef.current) {
        setLoadError(true);
      }
      // On silent refresh, preserve last known good data untouched
    } finally {
      if (!silent) {
        setMenuLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPublicData(false);
  }, [loadPublicData]);

  // Sync viewMode with browser Back/Forward and hash navigation
  useEffect(() => {
    const syncFromLocation = () => {
      setViewMode(getModeFromLocation());
    };
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, []);

  // Periodic background refresh (every 60s) + refresh when tab becomes visible again
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadPublicData(true);
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [loadPublicData]);

  const navigateTo = (mode: 'customer' | 'admin') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      const targetUrl = mode === 'admin' ? '/#admin' : '/#top';
      window.history.pushState(null, '', targetUrl);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLogout = useCallback(() => {
    setAuthToken(null);
  }, []);

  const customerItems: MenuItem[] = loadedFromServer ? publicMenuItems : DEFAULT_MENU_ITEMS;
  const isFallbackData = (!loadedFromServer && !menuLoading) || loadError;

  if (viewMode === 'admin') {
    if (!authToken) {
      return (
        <Suspense fallback={<AdminLoadingFallback />}>
          <AdminAuthGate
            onAuthenticated={(token, isEnv) => {
              setAuthToken(token);
              setManagedByEnv(isEnv);
            }}
            onBackToMenu={() => navigateTo('customer')}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<AdminLoadingFallback />}>
        <AdminDashboard
          authToken={authToken}
          managedByEnv={managedByEnv}
          settings={storeSettings}
          onTokenChange={setAuthToken}
          onLogout={handleLogout}
          onBackToMenu={() => navigateTo('customer')}
          onPublicDataChanged={() => loadPublicData(true)}
        />
      </Suspense>
    );
  }

  return (
    <CustomerMenuView
      items={customerItems}
      settings={storeSettings}
      loading={menuLoading && !loadedFromServer}
      isFallbackData={isFallbackData}
      onRetry={() => void loadPublicData(false)}
      onOpenAdmin={() => navigateTo('admin')}
      isAdminLoggedIn={Boolean(authToken)}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirstcantoApp />
      <OfflineIndicator />
    </ErrorBoundary>
  );
}
