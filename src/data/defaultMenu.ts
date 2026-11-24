import type { MenuCategory, MenuItem, StoreSettings } from '../types';

export const FRESCANTO_IMAGES = {
  logo: '/pwa-192x192.png',
  hero: '/assets/menu/hero-fruit-spread.png',
};

export const CATEGORY_DEFAULT_IMAGE: Record<MenuCategory, string> = {
  fruit_salad: '/assets/menu/fruit-salad.png',
  fresh_juices: '/assets/menu/fresh-juice.png',
  smoothies: '/assets/menu/smoothie.png',
  cut_cups: '/assets/menu/fruit-cup.png',
  family_boxes: '/assets/menu/family-box.png',
  addons: '/assets/menu/sweet-add-on.png',
};

export const STUDIO_IMAGE_OPTIONS = [
  { label: 'سلطة فواكه', url: CATEGORY_DEFAULT_IMAGE.fruit_salad },
  { label: 'عصائر طبيعية', url: CATEGORY_DEFAULT_IMAGE.fresh_juices },
  { label: 'سموزي', url: CATEGORY_DEFAULT_IMAGE.smoothies },
  { label: 'أكواب فواكه', url: CATEGORY_DEFAULT_IMAGE.cut_cups },
  { label: 'بوكسات', url: CATEGORY_DEFAULT_IMAGE.family_boxes },
  { label: 'إضافات حلوة', url: CATEGORY_DEFAULT_IMAGE.addons },
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
