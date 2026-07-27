# 薯薯雪线

一款桌面浏览器优先的 2D 单板无尽滑雪游戏。

## 操作

- `Space`：换刃
- `K` / `↑`：加速
- `L` / `↓`：减速
- `J` / `Shift`：跳跃
- `Esc` / `P`：暂停
- `Enter`：开始或重开

游戏自动前进，仓鼠和蓝金渐层猫会沿着雪板轨迹跟在身后。树木和大岩石必须绕行，小石块和裂缝可以跳过。本地最高距离保存在浏览器中。

## 开发

项目使用 vinext 与 Canvas 2D。关键手感参数集中在 `app/game/config.ts`，游戏状态、生成和轨道逻辑位于 `app/game/engine.ts`，渲染与输入位于 `app/game/SnowGame.tsx`。

```bash
npm ci
npm run dev
npm test
```

## 在另一台电脑继续

代码仓库是项目的唯一交接源，不要手工复制 `node_modules`、`dist` 或浏览器缓存。

1. 在新电脑安装 Git 与 Node.js 22 或更高版本。
2. 从私人 GitHub 仓库克隆项目。
3. 在项目目录运行 `npm ci`，然后运行 `npm run dev`。
4. 每次开始工作前先拉取最新代码；完成一段工作后提交并推送。

`.openai/hosting.json` 会跟随仓库，因而两台电脑都能继续发布到同一个网页站点。最高距离保存在每台电脑的浏览器本地，不会通过 Git 同步。
