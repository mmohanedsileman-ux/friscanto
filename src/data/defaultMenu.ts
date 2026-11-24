import type { MenuCategory, MenuItem, StoreSettings } from '../types';

export const FRESCANTO_IMAGES = {
  logo: '/pwa-192x192.png',
  hero: '/assets/aistudio/Screenshot_20261123_231959_f47e20a2.jpg',
};

const menuImage = '/assets/aistudio/Screenshot_20261124_001358_33b03969.jpg';

export const CATEGORY_DEFAULT_IMAGE: Record<MenuCategory, string> = {
  fruit_salad: menuImage,
  fresh_juices: menuImage,
  smoothies: menuImage,
  cut_cups: menuImage,
  family_boxes: menuImage,
  addons: menuImage,
};

export const STUDIO_IMAGE_OPTIONS = [
  { label: 'فواكه طازجة', url: '/assets/aistudio/Screenshot_20261124_001358_33b03969.jpg' },
  { label: 'عصائر طبيعية', url: '/assets/aistudio/Screenshot_20261124_010634_495f402d.jpg' },
  { label: 'سموزي', url: '/assets/aistudio/Screenshot_20261124_010940_e2ae06e7.jpg' },
  { label: 'أكواب فواكه', url: '/assets/aistudio/Screenshot_20261124_011513_fce0ef18.jpg' },
  { label: 'بوكسات', url: '/assets/aistudio/Screenshot_20261124_011847_3bc7d7f2.jpg' },
] as const;

export function resolveItemImage(
  _itemId: string,
  _itemName: string,
  category: MenuCategory,
  imageUrl?: string | null
): string {
  return imageUrl?.trim() || CATEGORY_DEFAULT_IMAGE[category] || STUDIO_IMAGE_OPTIONS[0].url;
}

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'default-fruit-salad',
    name: 'سبيشال فريستكانتو',
    nameEn: 'Frescanto Special',
    category: 'fruit_salad',
    description: 'تشكيلة فواكه طازجة مع إضافات حسب الاختيار.',
    price: 85,
    size: 'كوب كبير',
    imageUrl: STUDIO_IMAGE_OPTIONS[0].url,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 10,
  },
  {
    id: 'default-cut-cup',
    name: 'كوب فواكه فريش',
    nameEn: 'Fresh Fruit Cup',
    category: 'cut_cups',
    description: 'قطع فاكهة موسمية طازجة.',
    price: 65,
    size: 'كوب كبير',
    imageUrl: STUDIO_IMAGE_OPTIONS[3].url,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 20,
  },
  {
    id: 'default-fresh-juice',
    name: 'عصير فريش',
    nameEn: 'Fresh Juice',
    category: 'fresh_juices',
    description: 'عصير طبيعي محضر طازجًا.',
    price: 55,
    size: 'كوب كبير',
    imageUrl: STUDIO_IMAGE_OPTIONS[1].url,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 30,
  },
  {
    id: 'default-smoothie',
    name: 'سموزي فريش',
    nameEn: 'Fresh Smoothie',
    category: 'smoothies',
    description: 'سموزي بارد من الفاكهة الطازجة.',
    price: 75,
    size: 'كوب كبير',
    imageUrl: STUDIO_IMAGE_OPTIONS[2].url,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 40,
  },
  {
    id: 'default-family-box',
    name: 'بوكس العيلة',
    nameEn: 'Family Box',
    category: 'family_boxes',
    description: 'تشكيلة فواكه مناسبة للمشاركة.',
    price: 180,
    size: 'بوكس',
    imageUrl: STUDIO_IMAGE_OPTIONS[4].url,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 50,
  },
  {
    id: 'default-dessert-addon',
    name: 'إضافة حلوة',
    nameEn: 'Sweet Add-on',
    category: 'addons',
    description: 'إضافة اختيارية لطلبك.',
    price: 20,
    size: 'إضافة',
    imageUrl: STUDIO_IMAGE_OPTIONS[0].url,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 60,
  },
];

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'فريستكانتو',
  tagline: 'طعم الفاكهة الطازة',
  phone: '',
  address: '',
  workingHours: '',
  currency: 'ج.م',
  isPublic: true,
};
