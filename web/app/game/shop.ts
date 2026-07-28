export type ShopCategory = "board" | "pants" | "jacket" | "goggles" | "hat" | "pet";
export type GearSlot = Exclude<ShopCategory, "pet">;

export interface ShopItem {
  id: string;
  name: string;
  category: ShopCategory;
  price: number;
  description: string;
  color: string;
  accent?: string;
  maxSpeed?: number;
  acceleration?: number;
}

export interface EquippedGear {
  board: string;
  pants: string;
  jacket: string;
  goggles: string;
  hat: string;
}

export interface ShopProfile {
  version: 2;
  coins: number;
  ownedItemIds: string[];
  equipped: EquippedGear;
  equippedPets: string[];
  musicEnabled: boolean;
  testMode: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "board-classic",
    name: "经典红板",
    category: "board",
    price: 0,
    description: "均衡可靠 · 152 极速 / 18 加速",
    color: "#e34a38",
    accent: "#fff3e8",
    maxSpeed: 152,
    acceleration: 18,
  },
  {
    id: "board-sprout",
    name: "雪芽板",
    category: "board",
    price: 240,
    description: "更快进入节奏 · 158 极速 / 20 加速",
    color: "#8fcf35",
    accent: "#eaff9f",
    maxSpeed: 158,
    acceleration: 20,
  },
  {
    id: "board-ice",
    name: "冰箭板",
    category: "board",
    price: 520,
    description: "高速巡航型 · 170 极速 / 17 加速",
    color: "#329bc6",
    accent: "#d7f7ff",
    maxSpeed: 170,
    acceleration: 17,
  },
  {
    id: "board-comet",
    name: "薯星彗尾",
    category: "board",
    price: 900,
    description: "高级全能板 · 182 极速 / 22 加速",
    color: "#7e52d9",
    accent: "#ffc95c",
    maxSpeed: 182,
    acceleration: 22,
  },
  {
    id: "pants-black",
    name: "夜行雪裤",
    category: "pants",
    price: 0,
    description: "默认深色雪裤",
    color: "#071b2b",
  },
  {
    id: "pants-navy",
    name: "深海雪裤",
    category: "pants",
    price: 100,
    description: "沉静的高山深蓝",
    color: "#183b64",
  },
  {
    id: "pants-scarlet",
    name: "枫红雪裤",
    category: "pants",
    price: 180,
    description: "与红发呼应的暗红色",
    color: "#8f2430",
  },
  {
    id: "pants-white",
    name: "雪原雪裤",
    category: "pants",
    price: 240,
    description: "雪白板面与灰色护边",
    color: "#dce8ea",
    accent: "#6b7d87",
  },
  {
    id: "jacket-black",
    name: "原点连帽衫",
    category: "jacket",
    price: 0,
    description: "保留参考形象的黑色上衣",
    color: "#15191d",
  },
  {
    id: "jacket-blue",
    name: "冰湖外套",
    category: "jacket",
    price: 140,
    description: "清透冰蓝，保留心形鹿角图案",
    color: "#397f9f",
  },
  {
    id: "jacket-berry",
    name: "山莓外套",
    category: "jacket",
    price: 220,
    description: "浓郁深红，雪地中醒目",
    color: "#8e243e",
  },
  {
    id: "jacket-lime",
    name: "极光外套",
    category: "jacket",
    price: 320,
    description: "高饱和极光黄绿",
    color: "#a8d632",
  },
  {
    id: "goggles-graphite",
    name: "星点石墨镜",
    category: "goggles",
    price: 0,
    description: "默认深灰镜片与浅蓝星点",
    color: "#4d5255",
    accent: "#91a9df",
  },
  {
    id: "goggles-amber",
    name: "琥珀雪镜",
    category: "goggles",
    price: 120,
    description: "温暖的金橙镜片",
    color: "#d68131",
    accent: "#ffe07a",
  },
  {
    id: "goggles-aurora",
    name: "极光雪镜",
    category: "goggles",
    price: 240,
    description: "蓝紫渐变般的冷色镜片",
    color: "#665fc2",
    accent: "#9be8f3",
  },
  {
    id: "goggles-rose",
    name: "玫瑰雪镜",
    category: "goggles",
    price: 320,
    description: "柔亮玫瑰粉镜片",
    color: "#be5f7f",
    accent: "#ffd1dd",
  },
  {
    id: "hat-black",
    name: "原点黑帽",
    category: "hat",
    price: 0,
    description: "参考形象的黑色针织帽",
    color: "#111519",
  },
  {
    id: "hat-cream",
    name: "奶油针织帽",
    category: "hat",
    price: 100,
    description: "温暖柔和的奶油白",
    color: "#e8dcc7",
  },
  {
    id: "hat-red",
    name: "山莓红帽",
    category: "hat",
    price: 180,
    description: "与头发形成层次的莓红色",
    color: "#9f2731",
  },
  {
    id: "hat-sky",
    name: "晴空蓝帽",
    category: "hat",
    price: 260,
    description: "明亮的高山天空蓝",
    color: "#5e9fc2",
  },
  {
    id: "pet-digger",
    name: "挖挖机",
    category: "pet",
    price: 360,
    description: "橘色仓鼠 · 购买后可跟随滑雪",
    color: "#e98732",
    accent: "#ffe1ad",
  },
  {
    id: "pet-car",
    name: "车车",
    category: "pet",
    price: 520,
    description: "金渐层猫 · 绿色眼睛与蓬松尾巴",
    color: "#d9ad67",
    accent: "#70543d",
  },
];

export const DEFAULT_EQUIPPED: EquippedGear = {
  board: "board-classic",
  pants: "pants-black",
  jacket: "jacket-black",
  goggles: "goggles-graphite",
  hat: "hat-black",
};

export const DEFAULT_PROFILE: ShopProfile = {
  version: 2,
  coins: 0,
  ownedItemIds: Object.values(DEFAULT_EQUIPPED),
  equipped: DEFAULT_EQUIPPED,
  equippedPets: [],
  musicEnabled: true,
  testMode: false,
};

const PROFILE_KEY = "shushu-profile-v2";
const ITEM_IDS = new Set(SHOP_ITEMS.map((item) => item.id));

export function getShopItem(id: string): ShopItem {
  return SHOP_ITEMS.find((item) => item.id === id) ?? SHOP_ITEMS[0];
}

export function getBoard(profile: ShopProfile): ShopItem {
  const board = getShopItem(profile.equipped.board);
  return board.category === "board" ? board : SHOP_ITEMS[0];
}

export function rewardForDistance(distance: number): number {
  return 15 + Math.floor(Math.max(0, distance) / 10);
}

export function loadProfile(): ShopProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}") as Partial<ShopProfile>;
    const owned = new Set([
      ...Object.values(DEFAULT_EQUIPPED),
      ...(Array.isArray(raw.ownedItemIds) ? raw.ownedItemIds.filter((id) => ITEM_IDS.has(id)) : []),
    ]);
    const equipped = { ...DEFAULT_EQUIPPED };
    for (const slot of Object.keys(DEFAULT_EQUIPPED) as GearSlot[]) {
      const candidate = raw.equipped?.[slot];
      if (candidate && owned.has(candidate) && getShopItem(candidate).category === slot) {
        equipped[slot] = candidate;
      }
    }
    return {
      version: 2,
      coins: Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins ?? 0)) : 0,
      ownedItemIds: [...owned],
      equipped,
      equippedPets: Array.isArray(raw.equippedPets)
        ? raw.equippedPets.filter(
            (id) => owned.has(id) && getShopItem(id).category === "pet",
          )
        : [],
      musicEnabled: raw.musicEnabled !== false,
      testMode: raw.testMode === true,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: ShopProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Local storage is optional; the current session remains playable.
  }
}

export function unlockTestProfile(profile: ShopProfile): ShopProfile {
  return {
    ...profile,
    testMode: true,
    coins: Math.max(99_999, profile.coins),
    ownedItemIds: SHOP_ITEMS.map((item) => item.id),
  };
}
