import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_MENU_ITEMS, DEFAULT_STORE_SETTINGS } from './data/defaultMenu';
import { fetchPublicBootstrap } from './lib/api';
import type { MenuItem, StoreSettings } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CustomerMenuView } from './components/CustomerMenuView';
import { AdminAuthGate } from './components/AdminAuthGate';
import { AdminDashboard } from './components/AdminDashboard';

function FrescantoApp() {
  const [viewMode, setViewMode] = useState<'customer' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.startsWith('/admin') || hash === '#admin') {
        return 'admin';
      }
    }
    return 'customer';
  });

  // Admin session token lives strictly in React memory (never persisted to localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [managedByEnv, setManagedByEnv] = useState(false);

  const [publicMenuItems, setPublicMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);

  const loadPublicData = useCallback(async () => {
    try {
      const data = await fetchPublicBootstrap();
      setPublicMenuItems(data.menuItems);
      setStoreSettings({
        ...DEFAULT_STORE_SETTINGS,
        ...data.storeSettings,
      });
    } catch {
      // Fall back smoothly to default menu & settings if API is temporarily unavailable
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPublicData();
  }, [loadPublicData]);

  const navigateTo = (mode: 'customer' | 'admin') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      const targetUrl = mode === 'admin' ? '#admin' : '#top';
      window.history.replaceState(null, '', targetUrl);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLogout = useCallback(() => {
    setAuthToken(null);
  }, []);

  const customerItems: MenuItem[] =
    publicMenuItems.length > 0 ? publicMenuItems : DEFAULT_MENU_ITEMS;

  if (viewMode === 'admin') {
    if (!authToken) {
      return (
        <AdminAuthGate
          onAuthenticated={(token, isEnv) => {
            setAuthToken(token);
            setManagedByEnv(isEnv);
          }}
          onBackToMenu={() => navigateTo('customer')}
        />
      );
    }

    return (
      <AdminDashboard
        authToken={authToken}
        managedByEnv={managedByEnv}
        settings={storeSettings}
        onTokenChange={setAuthToken}
        onLogout={handleLogout}
        onBackToMenu={() => navigateTo('customer')}
        onPublicDataChanged={loadPublicData}
      />
    );
  }

  return (
    <CustomerMenuView
      items={customerItems}
      settings={storeSettings}
      loading={menuLoading && publicMenuItems.length === 0}
      onOpenAdmin={() => navigateTo('admin')}
      isAdminLoggedIn={Boolean(authToken)}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FrescantoApp />
    </ErrorBoundary>
  );
}
