import type { MenuCategory, MenuItem, StoreSettings } from '../types.ts';

export const FRESCANTO_IMAGES = {
  logo: '/src/assets/images/brand_firstcanto_logo_1795463576032.jpg',
  hero: '/src/assets/images/hero_firstcanto_banner.jpg',
  mangoCubes: '/src/assets/images/item_mango_cubes_1795463575020.jpg',
  frescantoSalad: '/src/assets/images/item_frescanto_salad_1795463574929.jpg',
  romanengo: '/src/assets/images/item_romanengo_cup_1795463575765.jpg',
  pomegranateCup: '/src/assets/images/item_pomegranate_cup_1795463575158.jpg',
  frescantoCup: '/src/assets/images/item_frescanto_cup_1795463575376.jpg',
  chocoBanana: '/src/assets/images/item_choco_banana_1795463575257.jpg',
  cutCups: '/src/assets/images/menu_cut_cups_1795463022316.jpg',
  fruitSalad: '/src/assets/images/menu_fruit_salad_1795463022352.jpg',
  freshJuices: '/src/assets/images/menu_fresh_juices_1795463022316.jpg',
  smoothies: '/src/assets/images/menu_smoothies_1795463021438.jpg',
  familyBox: '/src/assets/images/menu_family_box_1795463021774.jpg',
} as const;

export const CATEGORY_DEFAULT_IMAGE: Record<MenuCategory, string> = {
  cut_cups: FRESCANTO_IMAGES.cutCups,
  fruit_salad: FRESCANTO_IMAGES.frescantoSalad,
  addons: FRESCANTO_IMAGES.chocoBanana,
  fresh_juices: FRESCANTO_IMAGES.freshJuices,
  smoothies: FRESCANTO_IMAGES.smoothies,
  family_boxes: FRESCANTO_IMAGES.familyBox,
};

export interface StudioImageOption {
  label: string;
  url: string;
}

export const STUDIO_IMAGE_OPTIONS: StudioImageOption[] = [
  { label: 'مانجو قطع', url: FRESCANTO_IMAGES.mangoCubes },
  { label: 'سلطة الفريستكانتو', url: FRESCANTO_IMAGES.frescantoSalad },
  { label: 'رومانينجو', url: FRESCANTO_IMAGES.romanengo },
  { label: 'رمان حب', url: FRESCANTO_IMAGES.pomegranateCup },
  { label: 'كوب فريستكانتو', url: FRESCANTO_IMAGES.frescantoCup },
  { label: 'موزة شيكولاتة', url: FRESCANTO_IMAGES.chocoBanana },
  { label: 'أكواب فواكه', url: FRESCANTO_IMAGES.cutCups },
  { label: 'عصائر طبيعية', url: FRESCANTO_IMAGES.freshJuices },
  { label: 'سموزي فريش', url: FRESCANTO_IMAGES.smoothies },
  { label: 'بوكس العيلة', url: FRESCANTO_IMAGES.familyBox },
];

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'mango-cubes',
    name: 'مانجو قطع',
    nameEn: 'Fresh Mango Cubes',
    category: 'cut_cups',
    description: 'مكعبات مانجو فريش طازجة ومختارة بعناية، مبردة وجاهزة للأكل فوراً.',
    price: 55,
    size: 'كوب كبير',
    imageUrl: FRESCANTO_IMAGES.mangoCubes,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 1,
  },
  {
    id: 'frescanto-salad',
    name: 'سلطة الفريستكانتو',
    nameEn: 'Firstcanto Fruit Salad',
    category: 'fruit_salad',
    description: 'تشكيلة غنية من فواكه الموسم المقطعة طازجاً مع صوص طبيعي منعش.',
    price: 65,
    size: 'طبق كبير',
    imageUrl: FRESCANTO_IMAGES.frescantoSalad,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 2,
  },
  {
    id: 'romanengo-cup',
    name: 'رومانينجو',
    nameEn: 'Romanengo Cup',
    category: 'fruit_salad',
    description: 'مزيج مميز يجمع بين حلاوة المانجو الطازج وانتعاش حبات الرمان الأحمر.',
    price: 60,
    size: 'كوب كبير',
    imageUrl: FRESCANTO_IMAGES.romanengo,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 3,
  },
  {
    id: 'pomegranate-cup',
    name: 'رمان حب',
    nameEn: 'Fresh Pomegranate Cup',
    category: 'cut_cups',
    description: 'حبات رمان أحمر فريش مفصصة يومياً وجاهزة للتقديم باردة ومنعشة.',
    price: 45,
    size: 'كوب كبير',
    imageUrl: FRESCANTO_IMAGES.pomegranateCup,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 4,
  },
  {
    id: 'frescanto-cup',
    name: 'كوب فريستكانتو',
    nameEn: 'Firstcanto Signature Cup',
    category: 'fruit_salad',
    description: 'الكوب الخاص بفريستكانتو بطبقات الفواكه الفريش والعصير الطبيعي المبرد.',
    price: 70,
    size: 'كوب سبيشال',
    imageUrl: FRESCANTO_IMAGES.frescantoCup,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 5,
  },
  {
    id: 'choco-banana',
    name: 'موزة شيكولاتة',
    nameEn: 'Chocolate Covered Banana',
    category: 'addons',
    description: 'موزة فريش مغطاة بالكامل بشيكولاتة غنية وقطع الشوكليت شيبس المقرمشة، تقدم مبردة على ستيك.',
    price: 45,
    size: 'قطعة كاملة',
    imageUrl: FRESCANTO_IMAGES.chocoBanana,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 6,
  },
];

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'فريستكانتو',
  tagline: 'طازة · فريش · منعش',
  phone: '0100 000 0000',
  whatsapp: '',
  address: 'يمكنك تعديل العنوان ورقم التواصل من لوحة الإدارة',
  workingHours: 'يومياً من 10 صباحاً حتى 2 بعد منتصف الليل',
  currency: 'ج.م',
  isPublic: true,
};

export function resolveItemImage(
  itemId: string,
  itemName: string,
  category: MenuCategory,
  imageUrl?: string | null
): string {
  if (imageUrl && imageUrl.trim() && !imageUrl.includes('/assets/aistudio/')) {
    return imageUrl.trim();
  }
  const byId = DEFAULT_MENU_ITEMS.find((i) => i.id === itemId);
  if (byId) return byId.imageUrl;

  const lower = itemName.toLowerCase();
  if (lower.includes('مانجو') || lower.includes('mango')) return FRESCANTO_IMAGES.mangoCubes;
  if (lower.includes('رومانينجو') || lower.includes('romanengo')) return FRESCANTO_IMAGES.romanengo;
  if (lower.includes('رمان') || lower.includes('pomegranate')) return FRESCANTO_IMAGES.pomegranateCup;
  if (lower.includes('شيكولات') || lower.includes('موز') || lower.includes('choco')) {
    return FRESCANTO_IMAGES.chocoBanana;
  }
  if (lower.includes('كوب')) return FRESCANTO_IMAGES.frescantoCup;
  if (lower.includes('سلطة')) return FRESCANTO_IMAGES.frescantoSalad;

  return CATEGORY_DEFAULT_IMAGE[category] || FRESCANTO_IMAGES.frescantoSalad;
}
