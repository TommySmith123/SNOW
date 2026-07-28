import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server renders the playable Shushu Snowline shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>薯薯雪线 — 单板无尽滑雪<\/title>/i);
  assert.match(html, /无限滑雪游戏画布/);
  assert.match(html, /开始滑行/);
  assert.match(html, /SPACE/);
  assert.match(html, /K \/ L/);
  assert.match(html, /本地最佳/);
  assert.match(html, /薯薯商城/);
  assert.match(html, /薯薯币/);
  assert.match(html, /音乐[\s\S]{0,20}开/);
  assert.match(html, /brand-title-cn/);
  assert.match(html, />薯薯<\/span>/);
  assert.match(html, />雪线<\/span>/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps core game contracts explicit and configurable", async () => {
  const [config, engine, game, shop, shopModal, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/game/config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SnowGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/shop.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/ShopModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(config, /minSpeed:\s*30/);
  assert.match(config, /maxSpeed:\s*150/);
  assert.match(config, /acceleration:\s*16/);
  assert.match(config, /edgeAcceleration/);
  assert.match(config, /jumpDuration:\s*1\.04/);
  assert.match(config, /boundaryTurnLock/);
  assert.match(config, /trackSampleMeters/);
  assert.match(config, /treeColliderX/);
  assert.match(config, /crevasseColliderDepth:\s*0\.3/);
  assert.match(config, /crevasseClearance:\s*7/);
  assert.match(config, /"START"[\s\S]*"COUNTDOWN"[\s\S]*"PLAYING"/);
  assert.match(engine, /localStorage\.getItem\("snowline-best"\)/);
  assert.match(engine, /spawnPattern/);
  assert.match(engine, /trackWidth/);
  assert.match(game, /event\.repeat/);
  assert.match(game, /Math\.min\(0\.034/);
  assert.match(game, /visibilitychange/);
  assert.match(game, /obstacle\.type === "crevasse"/);
  assert.match(game, /const boardGap = Math\.abs\(y - boardY\)/);
  assert.match(game, /boardClearance < GAME\.crevasseClearance/);
  assert.match(game, /Crevasses collide with the snowboard contact point/);
  assert.doesNotMatch(game, /yGap < obstacle\.height \* 0\.52/);
  assert.match(game, /Only the clearly marked trunk base is solid/);
  assert.match(game, /model\.edge = inward/);
  assert.match(game, /model\.queuedEdge = inward/);
  assert.match(game, /model\.trackMarks\.push/);
  assert.match(game, /boardContact\(model\)/);
  assert.match(game, /drawHamster/);
  assert.match(game, /drawGoldenCat/);
  assert.match(game, /drawPawPrints/);
  assert.match(game, /tangentStart/);
  assert.match(game, /Keep longitudinal lag monotonic/);
  assert.doesNotMatch(game, /perpendicularY/);
  assert.match(game, /Start a fresh segment after take-off/);
  assert.match(game, /pattern shared by its shop preview/);
  assert.doesNotMatch(game, /rgba\(104, 191, 214/);
  assert.doesNotMatch(game, /rgba\(119, 202, 222/);
  assert.match(game, /key === "k"/);
  assert.match(game, /key === "l"/);
  assert.doesNotMatch(game, /key === "w"/);
  assert.doesNotMatch(game, /key === "s"/);
  assert.match(game, /model\.stance = "tuck"/);
  assert.match(game, /model\.stance = "brake"/);
  assert.match(game, /startMusic/);
  assert.match(game, /createDynamicsCompressor/);
  assert.match(game, /exponentialRampToValueAtTime\(0\.24/);
  assert.match(game, /rewardForDistance/);
  assert.match(game, /getBoard\(currentProfile\)/);
  assert.doesNotMatch(game, /offTrack > 68/);
  assert.match(shop, /shushu-profile-v2/);
  assert.match(shop, /15 \+ Math\.floor\(Math\.max\(0, distance\) \/ 10\)/);
  assert.match(shop, /id: "board-comet"[\s\S]*maxSpeed: 215[\s\S]*acceleration: 27/);
  assert.match(shop, /id: "board-hyper"[\s\S]*maxSpeed: 305[\s\S]*acceleration: 36/);
  assert.equal((shop.match(/category: "board"/g) ?? []).length, 8);
  assert.match(shop, /name: "挖挖机"/);
  assert.match(shop, /name: "车车"/);
  assert.match(shop, /coins: Math\.max\(99_999, profile\.coins\)/);
  assert.match(shopModal, /启用商城测试模式/);
  assert.match(shopModal, /服装只改变外观/);
  assert.match(shopModal, /PetPortrait/);
  assert.doesNotMatch(shopModal, /🐹|🐈/);
  assert.match(layout, /lang="zh-CN"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
