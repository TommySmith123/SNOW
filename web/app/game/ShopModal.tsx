"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import {
  SHOP_ITEMS,
  type GearSlot,
  type ShopCategory,
  type ShopItem,
  type ShopProfile,
} from "./shop";

const CATEGORIES: Array<{ id: ShopCategory; label: string }> = [
  { id: "board", label: "雪板" },
  { id: "jacket", label: "衣服" },
  { id: "pants", label: "裤子" },
  { id: "goggles", label: "雪镜" },
  { id: "hat", label: "帽子" },
  { id: "pet", label: "宠物" },
];

function PetPortrait({ id }: { id: string }) {
  const source =
    id === "pet-digger"
      ? "/pets/digger-golden-hamster.png"
      : "/pets/car-golden-shaded-cat.png";
  return (
    // The shared component also runs inside Capacitor, where next/image is
    // unavailable; these local static assets intentionally use a plain image.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="pet-portrait-image" src={source} alt="" aria-hidden="true" />
  );
}

function actionLabel(item: ShopItem, profile: ShopProfile) {
  const owned = profile.ownedItemIds.includes(item.id);
  if (!owned) {
    return profile.coins >= item.price
      ? `购买 · ${item.price}`
      : `还差 ${item.price - profile.coins} 枚`;
  }
  if (item.category === "pet") {
    return profile.equippedPets.includes(item.id) ? "休息" : "跟随";
  }
  return profile.equipped[item.category as GearSlot] === item.id ? "使用中" : "使用";
}

function isCurrent(item: ShopItem, profile: ShopProfile) {
  return item.category === "pet"
    ? profile.equippedPets.includes(item.id)
    : profile.equipped[item.category as GearSlot] === item.id;
}

export function ShopModal({
  profile,
  onClose,
  onItemAction,
  onToggleTest,
}: {
  profile: ShopProfile;
  onClose: () => void;
  onItemAction: (item: ShopItem) => void;
  onToggleTest: () => void;
}) {
  const [category, setCategory] = useState<ShopCategory>("board");
  const items = SHOP_ITEMS.filter((item) => item.category === category);

  return (
    <div className="shop-overlay" role="dialog" aria-modal="true" aria-label="薯薯商城">
      <section className="shop-panel">
        <header className="shop-header">
          <div>
            <p className="micro-label">Shushu outfitter</p>
            <h2>薯薯商城</h2>
          </div>
          <div className="shop-wallet" aria-label={`薯薯币 ${profile.coins}`}>
            <span aria-hidden="true">🥔</span>
            <strong>{profile.coins.toLocaleString()}</strong>
          </div>
          <button className="shop-close" type="button" onClick={onClose} aria-label="关闭商城">
            ×
          </button>
        </header>

        {profile.testMode && <div className="test-badge">测试模式 · 全商品已解锁</div>}

        <nav className="shop-tabs" aria-label="商品分类">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={category === entry.id ? "is-active" : ""}
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="shop-grid">
          {items.map((item) => {
            const owned = profile.ownedItemIds.includes(item.id);
            const current = isCurrent(item, profile);
            const disabled = !owned && profile.coins < item.price;
            return (
              <article className={`shop-item ${current ? "is-current" : ""}`} key={item.id}>
                <div
                  className={`item-preview is-${item.category}`}
                  data-pattern={item.pattern}
                  data-style={item.style}
                  style={{
                    "--item-color": item.color,
                    "--item-accent": item.accent ?? item.color,
                  } as CSSProperties}
                  aria-hidden="true"
                >
                  {item.category === "pet" && <PetPortrait id={item.id} />}
                </div>
                <div className="item-copy">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  {!owned && <span className="item-price">🥔 {item.price}</span>}
                </div>
                <button
                  type="button"
                  className={current ? "is-equipped" : ""}
                  disabled={disabled || (owned && current && item.category !== "pet")}
                  onClick={() => onItemAction(item)}
                >
                  {actionLabel(item, profile)}
                </button>
              </article>
            );
          })}
        </div>

        <p className="shop-note">
          服装只改变外观；雪板会改变最高速度与加速度。挖挖机增加结算收入，车车提供一次护盾；宠物休息时收益不生效。
        </p>

        <button
          className="test-mode-secret"
          type="button"
          onClick={onToggleTest}
          aria-label={profile.testMode ? "关闭商城测试模式" : "启用商城测试模式"}
          title={profile.testMode ? "关闭测试模式" : undefined}
        >
          ❄
        </button>
      </section>
    </div>
  );
}
