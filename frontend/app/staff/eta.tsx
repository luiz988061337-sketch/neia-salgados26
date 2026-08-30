import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Motorcycle, Storefront, Timer } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, Settings } from "@/src/api";

export default function StaffEta() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pickup, setPickup] = useState("30");
  const [delivery, setDelivery] = useState("45");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.adminGetSettings().then((s) => {
      setSettings(s);
      setPickup(String(s.pickup_eta_min ?? 30));
      setDelivery(String(s.delivery_eta_min ?? 45));
    }).catch((e) => Alert.alert("Erro", e.message));
  }, []);

  const save = async () => {
    const p = Math.max(1, Math.min(240, Number(pickup) || 30));
    const d = Math.max(1, Math.min(240, Number(delivery) || 45));
    setSaving(true);
    try {
      await api.adminUpdateSettings({ pickup_eta_min: p, delivery_eta_min: d } as any);
      Alert.alert("Sucesso", "Prazos atualizados! ⏱️");
      router.back();
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSaving(false); }
  };

  if (!settings) return <View style={styles.root}><Text style={{ color: COLORS.muted, padding: SPACING.xl }}>Carregando…</Text></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="eta-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Previsão de Prazos</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 80 }}>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Motorcycle color={COLORS.brand} size={26} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Prazo de entrega</Text>
              <Text style={styles.cardSub}>Tempo médio para chegar ao cliente</Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              testID="delivery-eta"
              value={delivery}
              onChangeText={setDelivery}
              keyboardType="numeric"
              style={styles.input}
            />
            <Text style={styles.unit}>min</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Storefront color={COLORS.success} size={26} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Prazo de retirada</Text>
              <Text style={styles.cardSub}>Tempo médio pra ficar pronto no balcão</Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              testID="pickup-eta"
              value={pickup}
              onChangeText={setPickup}
              keyboardType="numeric"
              style={styles.input}
            />
            <Text style={styles.unit}>min</Text>
          </View>
        </View>

        <View style={styles.helpBox}>
          <Timer color={COLORS.warning} size={20} weight="fill" />
          <Text style={styles.helpText}>
            Estes prazos são enviados automaticamente ao cliente por WhatsApp quando o pedido é confirmado e aparecem no card de acompanhamento.
          </Text>
        </View>

        <Pressable testID="eta-save" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
          <Text style={styles.saveText}>{saving ? "Salvando…" : "Salvar prazos"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  card: { padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  cardTitle: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  cardSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  input: { flex: 1, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 14, fontSize: 22, fontWeight: "800", color: COLORS.onSurface, textAlign: "center" },
  unit: { fontSize: 14, color: COLORS.muted, fontWeight: "700" },
  helpBox: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, backgroundColor: "#FFF8E7", borderWidth: 1, borderColor: COLORS.warning, borderRadius: RADIUS.md },
  helpText: { flex: 1, fontSize: 12, color: COLORS.onSurface, lineHeight: 18 },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
