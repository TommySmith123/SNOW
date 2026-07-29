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
  pattern?: "classic" | "sprout" | "ice" | "comet" | "tiger" | "aurora" | "dragon" | "hyper";
  style?:
    | "checker"
    | "cargo"
    | "flame"
    | "aurora"
    | "puffer"
    | "star"
    | "pom"
    | "cat"
    | "trapper"
    | "helmet";
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
    description: "均衡可靠 · 150 极速 / 16 加速",
    color: "#e34a38",
    accent: "#fff3e8",
    pattern: "classic",
    maxSpeed: 150,
    acceleration: 16,
  },
  {
    id: "board-sprout",
    name: "雪芽板",
    category: "board",
    price: 260,
    description: "灵敏入门 · 170 极速 / 23 加速",
    color: "#8fcf35",
    accent: "#eaff9f",
    pattern: "sprout",
    maxSpeed: 170,
    acceleration: 23,
  },
  {
    id: "board-ice",
    name: "冰箭板",
    category: "board",
    price: 560,
    description: "高速巡航 · 190 极速 / 19 加速",
    color: "#329bc6",
    accent: "#d7f7ff",
    pattern: "ice",
    maxSpeed: 190,
    acceleration: 19,
  },
  {
    id: "board-comet",
    name: "薯星彗尾",
    category: "board",
    price: 980,
    description: "中阶全能 · 215 极速 / 27 加速",
    color: "#7e52d9",
    accent: "#ffc95c",
    pattern: "comet",
    maxSpeed: 215,
    acceleration: 27,
  },
  {
    id: "board-tiger",
    name: "雪岭虎纹",
    category: "board",
    price: 1450,
    description: "强劲巡航 · 235 极速 / 22 加速",
    color: "#f28b32",
    accent: "#1b2028",
    pattern: "tiger",
    maxSpeed: 235,
    acceleration: 22,
  },
  {
    id: "board-aurora",
    name: "极光流光",
    category: "board",
    price: 2100,
    description: "迅猛全能 · 255 极速 / 31 加速",
    color: "#163d79",
    accent: "#54f2c1",
    pattern: "aurora",
    maxSpeed: 255,
    acceleration: 31,
  },
  {
    id: "board-dragon",
    name: "赤焰龙脊",
    category: "board",
    price: 3000,
    description: "极速专精 · 280 极速 / 25 加速",
    color: "#8d1729",
    accent: "#ffd05a",
    pattern: "dragon",
    maxSpeed: 280,
    acceleration: 25,
  },
  {
    id: "board-hyper",
    name: "薯薯超新星",
    category: "board",
    price: 4200,
    description: "终极雪板 · 305 极速 / 36 加速",
    color: "#171126",
    accent: "#ef59ff",
    pattern: "hyper",
    maxSpeed: 305,
    acceleration: 36,
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
    id: "pants-checker",
    name: "雪线棋盘裤",
    category: "pants",
    price: 380,
    description: "青柠棋盘护膝",
    color: "#17385e",
    accent: "#d7ff45",
    style: "checker",
  },
  {
    id: "pants-cargo",
    name: "山地机能裤",
    category: "pants",
    price: 520,
    description: "宽松工装与侧袋",
    color: "#526044",
    accent: "#ede3c5",
    style: "cargo",
  },
  {
    id: "pants-flame",
    name: "赤焰雪裤",
    category: "pants",
    price: 720,
    description: "黑色裤身与橙红火焰",
    color: "#17191d",
    accent: "#ff633c",
    style: "flame",
  },
  {
    id: "pants-aurora",
    name: "极光流线裤",
    category: "pants",
    price: 900,
    description: "深紫裤身与青蓝流线",
    color: "#3a275f",
    accent: "#5df2d0",
    style: "aurora",
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
    id: "jacket-puffer",
    name: "薯黄羽绒服",
    category: "jacket",
    price: 420,
    description: "奶油滚边横向绗缝",
    color: "#d9a52f",
    accent: "#fff0c7",
    style: "puffer",
  },
  {
    id: "jacket-checker",
    name: "冰湖棋盘衣",
    category: "jacket",
    price: 600,
    description: "冰蓝与深海蓝棋盘格",
    color: "#61b9d2",
    accent: "#17385e",
    style: "checker",
  },
  {
    id: "jacket-flame",
    name: "赤焰冲锋衣",
    category: "jacket",
    price: 840,
    description: "黑色衣身与红橙火焰",
    color: "#17191d",
    accent: "#ff563c",
    style: "flame",
  },
  {
    id: "jacket-star",
    name: "薯星夜行衣",
    category: "jacket",
    price: 1100,
    description: "荧光薯星与夜空星点",
    color: "#30214f",
    accent: "#d7ff45",
    style: "star",
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
    id: "hat-pom",
    name: "奶油绒球帽",
    category: "hat",
    price: 340,
    description: "莓红翻边与柔软绒球",
    color: "#eee2ca",
    accent: "#a8394d",
    style: "pom",
  },
  {
    id: "hat-cat",
    name: "金渐层猫耳帽",
    category: "hat",
    price: 480,
    description: "暖金色猫耳轮廓",
    color: "#d6a55e",
    accent: "#755033",
    style: "cat",
  },
  {
    id: "hat-trapper",
    name: "雪原护耳帽",
    category: "hat",
    price: 650,
    description: "奶油毛边与双侧护耳",
    color: "#53634b",
    accent: "#f1dfbe",
    style: "trapper",
  },
  {
    id: "hat-helmet",
    name: "薯星竞速盔",
    category: "hat",
    price: 880,
    description: "流线硬壳与青柠星纹",
    color: "#332254",
    accent: "#d7ff45",
    style: "helmet",
  },
  {
    id: "pet-digger",
    name: "挖挖机",
    category: "pet",
    price: 360,
    description: "毛茸茸金丝熊 · 跟随时本局薯薯币 +25%",
    color: "#e6a348",
    accent: "#fff0ca",
  },
  {
    id: "pet-car",
    name: "车车",
    category: "pet",
    price: 520,
    description: "金渐层猫 · 跟随时开局获得一次护盾",
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

export function rewardForRun(distance: number, hasDigger: boolean) {
  const base = rewardForDistance(distance);
  const petBonus = hasDigger ? Math.floor(base * 0.25) : 0;
  return { base, petBonus, total: base + petBonus };
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
