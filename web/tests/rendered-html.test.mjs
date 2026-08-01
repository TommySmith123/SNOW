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
  const [config, engine, game, petFollow, turning, shop, shopModal, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/game/config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SnowGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/pet-follow.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/turning.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/shop.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/ShopModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(config, /minSpeed:\s*30/);
  assert.match(config, /maxSpeed:\s*150/);
  assert.match(config, /acceleration:\s*16/);
  assert.match(config, /edgeAcceleration/);
  assert.match(config, /ACTIVE_TURN_STYLE:\s*TurnStyle = "carve"/);
  assert.match(config, /carveEdgeAcceleration:\s*430/);
  assert.match(config, /carveVisualMaxAngle:\s*0\.72/);
  assert.match(config, /jumpDuration:\s*1\.04/);
  assert.match(config, /boundaryTurnLock/);
  assert.match(config, /trackSampleMeters/);
  assert.match(config, /treeColliderX/);
  assert.match(config, /crevasseColliderDepth:\s*0\.3/);
  assert.match(config, /crevasseClearance:\s*7/);
  assert.match(config, /"START"[\s\S]*"COUNTDOWN"[\s\S]*"PLAYING"/);
  assert.match(engine, /localStorage\.getItem\("snowline-best"\)/);
  assert.match(engine, /ACTIVE_TURN_STYLE === "carve"/);
  assert.match(engine, /GAME\.lateralSpeed[\s\S]*GAME\.cruiseSpeed \/ GAME\.maxSpeed/);
  assert.match(engine, /spawnPattern/);
  assert.match(engine, /trackWidth/);
  assert.match(game, /event\.repeat/);
  assert.match(game, /onPointerDown/);
  assert.match(game, /onPointerCancel/);
  assert.match(game, /onLostPointerCapture/);
  assert.match(game, /setTouchSpeed/);
  assert.match(game, /beforeinstallprompt/);
  assert.match(game, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(game, /shushu:pause/);
  assert.match(game, /shushu:haptic/);
  assert.match(game, /Math\.min\(0\.034/);
  assert.match(game, /visibilitychange/);
  assert.match(game, /obstacle\.type === "crevasse"/);
  assert.match(game, /const boardGap = Math\.abs\(y - boardY\)/);
  assert.match(game, /boardClearance < GAME\.crevasseClearance/);
  assert.match(game, /Crevasses collide with the snowboard contact point/);
  assert.doesNotMatch(game, /yGap < obstacle\.height \* 0\.52/);
  assert.match(game, /Only the clearly marked trunk base is solid/);
  assert.match(game, /!airborne && obstacle\.type === "tree"/);
  assert.match(game, /else if \(!airborne\)/);
  assert.match(game, /model\.shieldCharges > 0/);
  assert.match(game, /model\.shieldCharges -= 1/);
  assert.match(game, /drawShield/);
  assert.match(game, /model\.edge = inward/);
  assert.match(game, /model\.queuedEdge = inward/);
  assert.match(game, /model\.trackMarks\.push/);
  assert.match(game, /boardContact\(model\)/);
  assert.match(game, /stable pivot/);
  assert.match(game, /fixed physical tail/);
  assert.match(game, /tailLocalX = -29/);
  assert.match(game, /distance: model\.distance \+ boardPivotY \/ GAME\.metersToPixels/);
  assert.match(game, /The snowboard stays pinned to the snow/);
  assert.match(game, /ctx\.translate\(model\.playerX, y\)/);
  assert.doesNotMatch(game, /GAME\.playerY \+ crouch \+ Math\.cos/);
  assert.match(game, /drawHamster/);
  assert.match(game, /drawGoldenCat/);
  assert.match(game, /drawPetSnowTrail/);
  assert.match(game, /resolvePetTrailPosition/);
  assert.match(game, /viewportMinX:\s*38/);
  assert.match(game, /followEnvelope:\s*84/);
  assert.match(petFollow, /"latest-hold"/);
  assert.match(petFollow, /findIndex\(\)[\s\S]*returns -1/);
  assert.match(petFollow, /"gap-bridge"/);
  assert.match(petFollow, /false,\s*"gap-bridge"/);
  assert.match(petFollow, /prefer staying near the rider/);
  assert.match(petFollow, /playerY - input\.lagMeters \* input\.metersToPixels/);
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
  assert.match(game, /model\.edge \* \(Math\.PI \/ 2\)/);
  assert.match(game, /\+ boardTurn\(model\)/);
  assert.match(game, /function boardRotation/);
  assert.match(game, /resolveBoardHeading/);
  assert.match(game, /boardRelativeTurn/);
  assert.match(game, /drawCarveNoseMarker/);
  assert.match(game, /noseX = brake \? 29 : 25/);
  assert.match(game, /Rotate the complete rider around the board pivot/);
  assert.match(game, /rotatePointAround/);
  assert.match(game, /Flip only the body/);
  assert.match(game, /const bodyFlip = brake \? Math\.PI : 0/);
  assert.match(game, /-bodyFlip/);
  assert.match(game, /ctx\.rotate\(bodyFlip\)/);
  assert.match(game, /function drawBrakeSparks/);
  assert.match(game, /model\.stance !== "brake"/);
  assert.match(game, /sparkCount = 3 \+ Math\.floor\(speedIntensity \* 3\)/);
  assert.doesNotMatch(game, /globalCompositeOperation = "lighter"/);
  assert.match(game, /#d96b32/);
  assert.match(game, /#ffe5a1/);
  assert.match(game, /Sparks sit under the board/);
  assert.ok(
    game.indexOf("drawBrakeSparks(ctx, model);") <
      game.indexOf("// A conventional snowboard"),
  );
  assert.ok(
    game.indexOf("// A conventional snowboard") <
      game.indexOf("// Broad, outlined snow pants"),
  );
  assert.match(game, /resolveTurnMotion/);
  assert.match(game, /resolveBoundaryVelocity/);
  assert.match(game, /resolveRiderBaseRotation/);
  assert.match(game, /carveFaceBlend/);
  assert.match(game, /resolveCarveView/);
  assert.match(game, /resolveCarveBindingProjection/);
  assert.match(game, /projectedBindings\.left/);
  assert.match(game, /projectedBindings\.right/);
  assert.match(game, /Binding markers share the projected foot coordinates/);
  assert.match(game, /carveFrontAmount/);
  assert.match(game, /carveSideAmount/);
  assert.match(game, /carveBackAmount/);
  assert.match(game, /bodyWidthScale/);
  assert.match(game, /whole upper silhouette narrows at the side-view apex/);
  assert.match(game, /ctx\.scale\(bodyWidthScale, 1\)/);
  assert.match(game, /A crash rotates the already assembled carve pose/);
  assert.match(game, /const carving = ACTIVE_TURN_STYLE === "carve" && !brake/);
  assert.match(game, /model\.status !== "CRASHED"/);
  assert.match(game, /front three-quarter view/);
  assert.match(game, /faceReveal/);
  assert.match(game, /frontDetailReveal/);
  assert.match(game, /long red hair lies over the jacket in back view/);
  assert.match(game, /carveBackAmount \+ carveSideAmount \* 0\.32/);
  assert.match(game, /farAmount/);
  assert.match(game, /tuckSide = carving \? carveFaceBlend : model\.edge/);
  assert.match(game, /face therefore recedes/);
  assert.match(turning, /style === "carve"/);
  assert.match(turning, /fallingLeafAcceleration/);
  assert.match(turning, /Math\.max\(76, Math\.min\(132/);
  assert.match(turning, /Follow the actual velocity vector/);
  assert.match(turning, /continuous 0\.\.PI C-shaped heading/);
  assert.match(turning, /Math\.atan2\(projectedDownhill, input\.lateralVelocity\)/);
  assert.match(turning, /stationaryEdge/);
  assert.match(turning, /lateralVelocity \/ 72/);
  assert.match(turning, /function resolveCarveView/);
  assert.match(turning, /bodyWidthScale: 1 - \(1 - Math\.abs\(turnBlend\)\) \* 0\.38/);
  assert.match(turning, /function resolveCarveBindingProjection/);
  assert.match(turning, /halfScreenWidth = 4 \+ cosine \* cosine \* 10/);
  assert.match(turning, /halfDepth = sine \* cosine \* 10/);
  const trackSource = game.slice(
    game.indexOf("function drawTracks"),
    game.indexOf("function trailPosition"),
  );
  assert.match(trackSource, /ctx\.lineWidth = 2\.6/);
  assert.doesNotMatch(trackSource, /offsetX|offsetY|\[-1, 1\]/);
  assert.doesNotMatch(game, /brake \? model\.edge \* 0\.12/);
  assert.match(game, /ctx\.lineWidth = 15/);
  assert.match(game, /ctx\.lineWidth = 11/);
  assert.match(game, /Both identical-width legs are drawn after the snowboard/);
  assert.match(game, /startMusic/);
  assert.match(game, /createDynamicsCompressor/);
  assert.match(game, /const beat = 60 \/ 92 \/ 2/);
  assert.match(game, /chordProgression/);
  assert.match(game, /scheduleKick/);
  assert.match(game, /exponentialRampToValueAtTime\(1\.05/);
  assert.match(game, /compressor\.threshold\.setValueAtTime\(-10/);
  assert.match(game, /compressor\.ratio\.setValueAtTime\(5/);
  assert.match(game, /makeup\.gain\.setValueAtTime\(1\.22/);
  assert.match(game, /"triangle",\s*0\.05,\s*0\.32/);
  assert.match(game, /"sine",\s*0\.13,\s*0\.045,\s*420/);
  assert.match(game, /"sine",\s*0\.08,\s*0\.08,\s*1450/);
  assert.match(game, /gain\.gain\.setValueAtTime\(0\.14, at\)/);
  assert.doesNotMatch(game, /"square"/);
  assert.match(game, /rewardForRun/);
  assert.match(game, /equippedPets\.includes\("pet-digger"\)/);
  assert.match(game, /equippedPets\.includes\("pet-car"\) \? 1 : 0/);
  assert.match(game, /function drawPetSnowTrail/);
  assert.doesNotMatch(game, /function drawPawPrints/);
  assert.match(game, /if \(!position\.historyReady\) break/);
  assert.match(game, /if \(positions\.length < 2\) continue/);
  assert.match(game, /Long-haired golden Syrian hamster/);
  assert.match(game, /illustrated[\s\S]*shop portrait/);
  assert.match(game, /getBoard\(currentProfile\)/);
  assert.doesNotMatch(game, /offTrack > 68/);
  assert.match(shop, /shushu-profile-v2/);
  assert.match(shop, /15 \+ Math\.floor\(Math\.max\(0, distance\) \/ 10\)/);
  assert.match(shop, /Math\.floor\(base \* 0\.25\)/);
  assert.match(shop, /id: "board-comet"[\s\S]*maxSpeed: 215[\s\S]*acceleration: 27/);
  assert.match(shop, /id: "board-hyper"[\s\S]*maxSpeed: 305[\s\S]*acceleration: 36/);
  assert.equal((shop.match(/category: "board"/g) ?? []).length, 8);
  assert.equal((shop.match(/category: "pants"/g) ?? []).length, 8);
  assert.equal((shop.match(/category: "jacket"/g) ?? []).length, 8);
  assert.equal((shop.match(/category: "hat"/g) ?? []).length, 8);
  assert.match(shop, /id: "pants-flame"/);
  assert.match(shop, /id: "jacket-star"/);
  assert.match(shop, /id: "hat-trapper"/);
  assert.match(shop, /name: "挖挖机"/);
  assert.match(shop, /毛茸茸金丝熊/);
  assert.match(shopModal, /digger-golden-hamster\.png/);
  assert.match(shop, /name: "车车"/);
  assert.match(shop, /毛茸茸金渐层幼猫/);
  assert.match(shopModal, /car-golden-shaded-cat\.png/);
  assert.match(shop, /coins: Math\.max\(99_999, profile\.coins\)/);
  assert.match(shopModal, /启用商城测试模式/);
  assert.match(shopModal, /服装只改变外观/);
  assert.match(shopModal, /PetPortrait/);
  assert.doesNotMatch(shopModal, /🐹|🐈/);
  assert.match(shopModal, /data-style=\{item\.style\}/);
  assert.match(layout, /lang="zh-CN"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("keeps PWA and native mobile delivery separate", async () => {
  const [
    manifest,
    serviceWorker,
    layout,
    mobileConfig,
    mobileEntry,
    nativeBridge,
    mobileCss,
    globalCss,
    game,
    androidManifest,
    iosInfo,
  ] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../mobile/capacitor.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../../mobile/src/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../mobile/src/nativeBridge.ts", import.meta.url), "utf8"),
    readFile(new URL("../../mobile/src/mobile.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SnowGame.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../mobile/android/app/src/main/AndroidManifest.xml", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../mobile/ios/App/App/Info.plist", import.meta.url), "utf8"),
  ]);

  const pwa = JSON.parse(manifest);
  assert.equal(pwa.name, "薯薯雪线");
  assert.equal(pwa.display, "standalone");
  assert.equal(pwa.orientation, "portrait");
  assert.ok(pwa.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(pwa.icons.some((icon) => icon.sizes === "512x512"));
  assert.match(serviceWorker, /shushu-snowline-v3/);
  assert.match(serviceWorker, /digger-golden-hamster\.png/);
  assert.match(serviceWorker, /car-golden-shaded-cat\.png/);
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /appleWebApp/);

  assert.match(mobileConfig, /appId:\s*"com\.shushu\.snowline"/);
  assert.match(mobileConfig, /webDir:\s*"www"/);
  assert.doesNotMatch(mobileConfig, /\burl\s*:/);
  assert.match(mobileEntry, /\.\.\/\.\.\/web\/app\/game\/SnowGame/);
  assert.match(nativeBridge, /Capacitor\.isNativePlatform/);
  assert.match(nativeBridge, /Haptics/);
  assert.match(nativeBridge, /appStateChange/);
  assert.match(mobileCss, /grid-template-columns:\s*1fr/);
  assert.match(mobileCss, /\.touch-brake\s*\{[\s\S]*?order:\s*1/);
  assert.match(mobileCss, /\.touch-accelerate\s*\{[\s\S]*?order:\s*2/);
  assert.match(mobileCss, /5\.4rem minmax\(1\.2rem, 1fr\) 6rem/);
  assert.match(mobileCss, /bottom:\s*max\([\s\S]*?env\(safe-area-inset-bottom\)[\s\S]*?2\.5rem/);
  assert.match(mobileCss, /width:\s*6rem/);
  assert.match(mobileCss, /min-height:\s*5rem/);
  assert.match(mobileCss, /\.touch-speed-controls \.touch-action\s*\{[\s\S]*?opacity:\s*0/);
  assert.match(mobileCss, /\.touch-edge::before\s*\{[\s\S]*?content:\s*"↔"/);
  assert.match(mobileCss, /\.touch-jump::before\s*\{[\s\S]*?content:\s*"↑"/);
  assert.match(globalCss, /@media \(max-width:\s*980px\)/);
  assert.match(globalCss, /5\.4rem minmax\(1\.2rem, 1fr\) 6rem/);
  assert.match(globalCss, /bottom:\s*max\([\s\S]*?env\(safe-area-inset-bottom\)[\s\S]*?2\.5rem/);
  assert.match(globalCss, /width:\s*6rem/);
  assert.match(globalCss, /min-height:\s*5rem/);
  assert.match(globalCss, /\.touch-brake\s*\{[\s\S]*?order:\s*1/);
  assert.match(globalCss, /\.touch-accelerate\s*\{[\s\S]*?order:\s*2/);
  assert.match(globalCss, /\.touch-speed-controls \.touch-action\s*\{[\s\S]*?opacity:\s*0/);
  assert.match(globalCss, /max-height:\s*calc\(100dvh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)/);
  assert.match(globalCss, /@media \(max-width:\s*560px\)[\s\S]*?height:\s*calc\(100dvh/);
  assert.match(globalCss, /\.game-canvas\s*\{[\s\S]*?object-fit:\s*cover/);
  assert.match(game, /aria-label="加速"/);
  assert.match(game, /aria-label="减速"/);
  assert.match(androidManifest, /android:screenOrientation="portrait"/);
  assert.match(iosInfo, /UIInterfaceOrientationPortrait/);
  assert.doesNotMatch(iosInfo, /UIInterfaceOrientationLandscape/);
});
