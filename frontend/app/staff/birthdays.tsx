import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChatCircleText, Gift } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, BirthdayCustomer } from "@/src/api";
import { openWhatsApp } from "@/src/whatsapp";

export default function StaffBirthdays() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<BirthdayCustomer[]>([]);
  const [date, setDate] = useState("");
  const [sending, setSending] = useState(false);
  const [twilioReady, setTwilioReady] = useState(false);

  const load = async () => {
    try {
      const [birthdays, s] = await Promise.all([api.adminBirthdaysToday(), api.adminGetSettings()]);
      setItems(birthdays.customers); setDate(birthdays.date);
      setTwilioReady(!!s.twilio_ready);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const sendAll = async () => {
    setSending(true);
    try {
      const r = await api.adminSendBirthdays();
      const successCount = r.sent.filter((x: any) => x.result?.sent).length;
      Alert.alert(
        "Envio de cupons",
        r.twilio_ready
          ? `${successCount}/${r.sent.length} cupons enviados via WhatsApp.`
          : "Twilio não configurado. Toque em cada aniversariante para enviar manualmente pelo WhatsApp.",
      );
      load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSending(false); }
  };

  const sendOne = (c: BirthdayCustomer) => {
    const msg = `🎉 Feliz aniversário, ${c.name}! A Néia preparou um mimo pra você: cupom ANIVERSARIO20 com 20% off, válido só hoje. Peça pelo app 💛`;
    openWhatsApp(c.phone, msg);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="birthdays-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Aniversariantes</Text>
          <Text style={styles.subtitle}>{date} • {items.length} cliente(s)</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          {twilioReady
            ? "✅ Twilio configurado — o botão envia direto pelo servidor"
            : "⚠️ Twilio não configurado — envio será via wa.me (abre WhatsApp no seu celular)"}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.phone}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Gift color={COLORS.muted} size={48} weight="light" />
            <Text style={styles.emptyText}>Ninguém faz aniversário hoje 🎂</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cake}>🎂</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phone}</Text>
            </View>
            <Pressable testID={`send-${item.phone}`} onPress={() => sendOne(item)} style={styles.sendBtn}>
              <ChatCircleText color={COLORS.surface} size={16} weight="bold" />
              <Text style={styles.sendText}>Enviar</Text>
            </Pressable>
          </View>
        )}
      />

      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <Pressable testID="send-all-birthdays" onPress={sendAll} disabled={sending} style={[styles.cta, sending && { opacity: 0.6 }]}>
            <Gift color={COLORS.surface} size={18} weight="fill" />
            <Text style={styles.ctaText}>{sending ? "Enviando…" : "Enviar cupons para todos"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: 11, color: COLORS.muted },
  banner: { padding: SPACING.md, margin: SPACING.lg, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md },
  bannerText: { fontSize: 12, color: COLORS.onBrandTertiary, fontWeight: "700" },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyText: { color: COLORS.muted, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cake: { fontSize: 28 },
  name: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  phone: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  sendBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#25D366", paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill },
  sendText: { color: COLORS.surface, fontWeight: "800", fontSize: 12 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: SPACING.lg, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  ctaText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
