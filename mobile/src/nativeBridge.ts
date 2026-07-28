import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  Haptics,
  ImpactStyle,
  NotificationType,
} from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";

type HapticKind = "light" | "medium" | "heavy" | "shield";

export async function initializeNativeBridge() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add("capacitor-native");
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  if (Capacitor.getPlatform() === "android") {
    await StatusBar.setBackgroundColor({ color: "#071b2b" }).catch(
      () => undefined,
    );
  }

  await App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) window.dispatchEvent(new Event("shushu:pause"));
  });

  window.addEventListener("shushu:haptic", (event) => {
    const kind = (event as CustomEvent<{ kind?: HapticKind }>).detail?.kind;
    if (kind === "shield") {
      void Haptics.notification({ type: NotificationType.Warning });
    } else {
      const style =
        kind === "heavy"
          ? ImpactStyle.Heavy
          : kind === "medium"
            ? ImpactStyle.Medium
            : ImpactStyle.Light;
      void Haptics.impact({ style });
    }
  });
}
