import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { DownloadSimple, X } from "phosphor-react-native";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

/**
 * Card "Instalar o app" — só aparece no web quando o browser suporta o prompt PWA.
 * Também exibe dica alternativa no iOS Safari (não há prompt automático).
 */
export default function PWAInstallCard() {
  const [prompt, setPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIOS] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const w: any = (globalThis as any).window;
    if (!w) return;
    // iOS detection
    const ua = w.navigator?.userAgent || "";
    setIOS(/iPhone|iPad|iPod/.test(ua));
    // Se já rodando como PWA, esconde
    try {
      const standalone =
        w.matchMedia?.("(display-mode: standalone)").matches ||
        w.navigator?.standalone === true;
      if (standalone) { setAlreadyInstalled(true); return; }
    } catch {}
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); };
    w.addEventListener("beforeinstallprompt", handler);
    w.addEventListener("appinstalled", () => { setAlreadyInstalled(true); setPrompt(null); });
    return () => w.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (Platform.OS !== "web" || alreadyInstalled || dismissed) return null;

  // Caso 1: navegador suporta o prompt automático (Chrome/Edge/Android)
  if (prompt) {
    return (
      <View style={styles.card}>
        <DownloadSimple color={COLORS.brand} size={26} weight="fill" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Instale o Néia Salgados</Text>
          <Text style={styles.sub}>Fica na tela do seu celular, sem loja de apps.</Text>
        </View>
        <Pressable
          testID="pwa-install"
          onPress={async () => { try { await prompt.prompt(); } catch {} setPrompt(null); }}
          style={styles.installBtn}
        >
          <Text style={styles.installText}>Instalar</Text>
        </Pressable>
        <Pressable testID="pwa-dismiss" onPress={() => setDismissed(true)} style={styles.closeBtn}>
          <X color={COLORS.muted} size={16} weight="bold" />
        </Pressable>
      </View>
    );
  }

  // Caso 2: iOS Safari — sem prompt, mostrar instruções
  if (isIOS) {
    return (
      <View style={styles.card}>
        <DownloadSimple color={COLORS.brand} size={26} weight="fill" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Adicione à tela inicial</Text>
          <Text style={styles.sub}>Toque no ícone de compartilhar do Safari e escolha "Adicionar à Tela de Início".</Text>
        </View>
        <Pressable testID="pwa-dismiss-ios" onPress={() => setDismissed(true)} style={styles.closeBtn}>
          <X color={COLORS.muted} size={16} weight="bold" />
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: "#FFF8E7",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    marginBottom: SPACING.sm,
  },
  title: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  sub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  installBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.brand },
  installText: { color: COLORS.surface, fontWeight: "800", fontSize: 12 },
  closeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
});
