import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.shushu.snowline",
  appName: "薯薯雪线",
  webDir: "www",
  backgroundColor: "#071b2b",
  server: {
    androidScheme: "https"
  },
  android: {
    backgroundColor: "#071b2b"
  }
};

export default config;
