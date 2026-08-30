import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, Platform, StatusBar, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, runOnJS } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function injectPWAHead() {
  if (Platform.OS !== "web") return;
  const doc: any = (globalThis as any).document;
  if (!doc || (doc as any).__neiaPWAReady) return;
  (doc as any).__neiaPWAReady = true;
  const head = doc.head;
  const set = (sel: string, attrs: Record<string, string>) => {
    let el = head.querySelector(sel);
    if (!el) {
      el = doc.createElement(attrs.tag || (sel.startsWith("meta") ? "meta" : "link"));
      head.appendChild(el);
    }
    Object.entries(attrs).forEach(([k, v]) => { if (k !== "tag") el.setAttribute(k, v); });
  };
  set('link[rel="manifest"]', { rel: "manifest", href: "/manifest.webmanifest", tag: "link" });
  set('meta[name="theme-color"]', { name: "theme-color", content: "#F4B821", tag: "meta" });
  set('meta[name="apple-mobile-web-app-capable"]', { name: "apple-mobile-web-app-capable", content: "yes", tag: "meta" });
  set('meta[name="apple-mobile-web-app-status-bar-style"]', { name: "apple-mobile-web-app-status-bar-style", content: "default", tag: "meta" });
  set('meta[name="apple-mobile-web-app-title"]', { name: "apple-mobile-web-app-title", content: "Néia Salgados", tag: "meta" });
  set('meta[name="mobile-web-app-capable"]', { name: "mobile-web-app-capable", content: "yes", tag: "meta" });
  set('meta[name="description"]', { name: "description", content: "O sabor que faz a diferença — peça salgados fresquinhos com entrega ou retirada.", tag: "meta" });
  set('link[rel="apple-touch-icon"]', { rel: "apple-touch-icon", href: "/apple-touch-icon.png", tag: "link" });
  // Update title
  try { doc.title = "Néia Salgados — O sabor que faz a diferença"; } catch {}
  // Register service worker
  const win: any = (globalThis as any).window;
  if (win?.navigator?.serviceWorker) {
    win.addEventListener("load", () => {
      win.navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
    // Also try immediately if already loaded
    try { win.navigator.serviceWorker.register("/sw.js").catch(() => {}); } catch {}
  }
}

function BrandSplash({ onDone }: { onDone: () => void }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);
  const bounce = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
    scale.value = withSequence(
      withTiming(1.05, { duration: 500, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(1, { duration: 300 }),
    );
    bounce.value = withDelay(700, withSequence(
      withTiming(-10, { duration: 260 }),
      withTiming(0, { duration: 300, easing: Easing.bounce }),
    ));
    // Fade out and finish after 2s
    opacity.value = withDelay(1500, withTiming(0, { duration: 550, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: bounce.value }],
  }));

  return (
    <View pointerEvents="none" style={splashStyles.overlay}>
      <Animated.View style={[splashStyles.center, style]}>
        <Image
          source={require("@/assets/images/logo-hd.png")}
          style={splashStyles.logo}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    injectPWAHead();
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FCFBF8" } }} />
        {showSplash && <BrandSplash onDone={() => setShowSplash(false)} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const splashStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F4B821",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  center: { width: "88%", aspectRatio: 1.45 },
  logo: { width: "100%", height: "100%" },
});
