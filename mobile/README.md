# 薯薯雪线 Mobile

此目录只用于 Android/iOS 手游封装；网页版仍位于 `../web/` 并由 Sites 独立部署。

## 目录边界

- `src/`：手机入口和原生能力桥接。
- `android/`：Android Studio 工程。
- `ios/`：Xcode 工程。
- `www/`：移动端静态构建产物，不提交。
- 游戏玩法源码唯一保存在 `../web/app/game/`，移动端直接复用，不复制第二份。

Capacitor 配置没有 `server.url`，安装包始终读取本地 `www/`，因此不会依赖线上网页地址。

## 常用命令

```bash
pnpm install
pnpm run build
pnpm run sync
pnpm run android
pnpm run ios
```

Android 需要 Android Studio 和对应 SDK。iOS 工程可以保存在 Windows 仓库中，但最终签名、真机调试和 App Store/TestFlight 构建必须在装有 Xcode 的 macOS 上完成。
