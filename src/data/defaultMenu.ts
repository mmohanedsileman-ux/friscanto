import type { MenuCategory, MenuItem, StoreSettings } from '../types';

export const FRESCANTO_IMAGES = {
  logo: '/src/assets/images/brand_firstcanto_logo_1795463576032.jpg',
  hero: '/src/assets/images/hero_frescanto_bar_1795463021773.jpg',
  mango_cubes: '/src/assets/images/item_mango_cubes_1795463575020.jpg',
  frescanto_salad: '/src/assets/images/item_frescanto_salad_1795463574929.jpg',
  pomegranate_cup: '/src/assets/images/item_pomegranate_cup_1795463575158.jpg',
  romanengo_cup: '/src/assets/images/item_romanengo_cup_1795463575765.jpg',
  frescanto_cup: '/src/assets/images/item_frescanto_cup_1795463575376.jpg',
  choco_banana: '/src/assets/images/item_choco_banana_1795463575257.jpg',
  fresh_juices: '/src/assets/images/menu_fresh_juices_1795463022316.jpg',
  smoothies: '/src/assets/images/menu_smoothies_1795463021438.jpg',
  family_boxes: '/src/assets/images/menu_family_box_1795463021774.jpg',
};

export const CATEGORY_DEFAULT_IMAGE: Record<MenuCategory, string> = {
  cut_cups: FRESCANTO_IMAGES.mango_cubes,
  fruit_salad: FRESCANTO_IMAGES.frescanto_cup,
  addons: FRESCANTO_IMAGES.choco_banana,
  fresh_juices: FRESCANTO_IMAGES.fresh_juices,
  smoothies: FRESCANTO_IMAGES.smoothies,
  family_boxes: FRESCANTO_IMAGES.family_boxes,
};

export const STUDIO_IMAGE_OPTIONS: { label: string; url: string }[] = [
  { label: 'مانجو قطع', url: FRESCANTO_IMAGES.mango_cubes },
  { label: 'سلطة الفريستكانتو', url: FRESCANTO_IMAGES.frescanto_salad },
  { label: 'رومانينجو', url: FRESCANTO_IMAGES.romanengo_cup },
  { label: 'رمان حب', url: FRESCANTO_IMAGES.pomegranate_cup },
  { label: 'كوب فريستكانتو', url: FRESCANTO_IMAGES.frescanto_cup },
  { label: 'موزة شيكولاتة', url: FRESCANTO_IMAGES.choco_banana },
  { label: 'عصائر طبيعية', url: FRESCANTO_IMAGES.fresh_juices },
  { label: 'سموزي فريش', url: FRESCANTO_IMAGES.smoothies },
  { label: 'بوكس فواكه عائلي', url: FRESCANTO_IMAGES.family_boxes },
];

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'فريستكانتو',
  tagline: 'طازة · فريش · منعش — فواكه فريش مقطعة يومياً وأكواب سبيشال محضرة فور الطلب',
  phone: '0100 000 0000',
  address: 'يمكنك تعديل العنوان ورقم التواصل من لوحة الإدارة',
  workingHours: 'يومياً من 10 صباحاً حتى 2 بعد منتصف الليل',
  currency: 'ج.م',
  isPublic: true,
};

export const DEFAULT_MENU_ITEMS: Omit<MenuItem, 'createdBy' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'item_mango_cuts',
    name: 'مانجو قطع',
    nameEn: 'Fresh Diced Mango',
    category: 'cut_cups',
    description: 'مكعبات مانجو طازجة منتقاة يومياً، مقطعة ومبردة جاهزة للأكل بأعلى درجة حلاوة وطزاجة.',
    price: 60,
    size: 'بولة فريش',
    imageUrl: FRESCANTO_IMAGES.mango_cubes,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 1,
  },
  {
    id: 'item_frescanto_salad',
    name: 'سلطة الفريستكانتو',
    nameEn: 'Firstcanto Fruit Salad',
    category: 'fruit_salad',
    description: 'تشكيلة غنية من الفواكه الموسمية الطازجة (مانجو، فراولة، كيوي، تفاح، موز، رمان) مقطعة فور الطلب.',
    price: 70,
    size: 'علبة فريش',
    imageUrl: FRESCANTO_IMAGES.frescanto_salad,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 2,
  },
  {
    id: 'item_romanengo',
    name: 'رومانينجو',
    nameEn: 'Romanengo Cup',
    category: 'cut_cups',
    description: 'مزيج فريستكانتو الأشهر من طبقات مكعبات المانجو الذهبية مع حبات الرمان الأحمر الطازج.',
    price: 75,
    size: 'كوب كبير',
    imageUrl: FRESCANTO_IMAGES.romanengo_cup,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 3,
  },
  {
    id: 'item_pomegranate_seeds',
    name: 'رمان حب',
    nameEn: 'Fresh Pomegranate Cup',
    category: 'cut_cups',
    description: 'كوب ممتلئ بفصوص الرمان الأحمر الطازج والمفصص بعناية، مبرد ومنعش وطبيعي 100%.',
    price: 55,
    size: 'كوب كبير',
    imageUrl: FRESCANTO_IMAGES.pomegranate_cup,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 4,
  },
  {
    id: 'item_frescanto_cup',
    name: 'كوب فريستكانتو',
    nameEn: 'Firstcanto Signature Cup',
    category: 'fruit_salad',
    description: 'طبقات فاخرة من المانجو والرمان والموز وشرائح الكيوي الطازج مع طبقة كريمة مخفوقة وسبرنكلز ملون.',
    price: 90,
    size: 'كوب سبيشال',
    imageUrl: FRESCANTO_IMAGES.frescanto_cup,
    isAvailable: true,
    isFeatured: true,
    sortOrder: 5,
  },
  {
    id: 'item_choco_banana',
    name: 'موزة شيكولاتة',
    nameEn: 'Chocolate Chips Banana',
    category: 'addons',
    description: 'موزة فريش مغطاة بالكامل بشيكولاتة غنية وقطع الشوكليت شيبس المقرمشة، تقدم مبردة على ستيك.',
    price: 45,
    size: 'قطعة كاملة',
    imageUrl: FRESCANTO_IMAGES.choco_banana,
    isAvailable: true,
    isFeatured: false,
    sortOrder: 6,
  },
];

export function resolveItemImage(
  itemId: string,
  itemName: string,
  category: MenuCategory,
  storedImageUrl?: string
): string {
  if (storedImageUrl) return storedImageUrl;
  const byId = DEFAULT_MENU_ITEMS.find((i) => i.id === itemId);
  if (byId) return byId.imageUrl;
  const normalized = itemName.trim();
  if (normalized.includes('رومانينجو')) return FRESCANTO_IMAGES.romanengo_cup;
  if (normalized.includes('رمان')) return FRESCANTO_IMAGES.pomegranate_cup;
  if (normalized.includes('موز') || normalized.includes('شيكولات')) return FRESCANTO_IMAGES.choco_banana;
  if (normalized.includes('كوب')) return FRESCANTO_IMAGES.frescanto_cup;
  if (normalized.includes('سلط')) return FRESCANTO_IMAGES.frescanto_salad;
  if (normalized.includes('مانجو')) return FRESCANTO_IMAGES.mango_cubes;
  return CATEGORY_DEFAULT_IMAGE[category] || FRESCANTO_IMAGES.frescanto_cup;
}
