import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus, Trash, Trophy } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, LoyaltyTier, Settings } from "@/src/api";

export default function StaffLoyalty() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [active, setActive] = useState(true);
  const [pointsPerReal, setPointsPerReal] = useState("1");
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.adminGetSettings().then((s) => {
      setSettings(s);
      setActive(!!s.loyalty_active);
      setPointsPerReal(String(s.loyalty_points_per_real ?? 1));
      setTiers(s.loyalty_tiers && s.loyalty_tiers.length ? s.loyalty_tiers : [
        { points: 100, discount_pct: 5 },
        { points: 200, discount_pct: 10 },
      ]);
    }).catch((e) => Alert.alert("Erro", e.message));
  }, []);

  const updateTier = (idx: number, field: keyof LoyaltyTier, val: string) => {
    setTiers((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: Math.max(0, Number(val) || 0) } : t));
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    setTiers([...tiers, { points: (last?.points ?? 0) + 100, discount_pct: Math.min(25, (last?.discount_pct ?? 0) + 5) }]);
  };
  const removeTier = (idx: number) => setTiers((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    // validate tiers
    const sorted = [...tiers].filter(t => t.points > 0 && t.discount_pct > 0 && t.discount_pct <= 100)
      .sort((a, b) => a.points - b.points);
    if (sorted.length === 0) { Alert.alert("Erro", "Adicione pelo menos 1 nível de resgate"); return; }
    setSaving(true);
    try {
      await api.adminUpdateSettings({
        loyalty_active: active,
        loyalty_points_per_real: Math.max(0.1, Number(pointsPerReal.replace(",", ".")) || 1),
        loyalty_tiers: sorted,
      } as any);
      Alert.alert("Sucesso", "Plano de fidelidade atualizado!");
      router.back();
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSaving(false); }
  };

  if (!settings) return <View style={styles.root}><Text style={{ color: COLORS.muted, padding: SPACING.xl }}>Carregando…</Text></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="loyalty-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Plano de Fidelidade</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 80 }}>
        <View style={styles.heroCard}>
          <Trophy color={COLORS.warning} size={30} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Programa ativo?</Text>
            <Text style={styles.heroSub}>Ao ativar, clientes ganham pontos automaticamente</Text>
          </View>
          <Switch value={active} onValueChange={setActive} />
        </View>

        <Field label="Pontos por R$ 1 gasto">
          <TextInput
            testID="ppr"
            value={pointsPerReal}
            onChangeText={setPointsPerReal}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.hint}>Ex: 1 = 1 ponto/R$, 2 = 2 pontos/R$ (mais generoso)</Text>
        </Field>

        <View style={{ gap: SPACING.sm }}>
          <View style={styles.rowSpread}>
            <Text style={styles.section}>Níveis de resgate</Text>
            <Pressable testID="add-tier" onPress={addTier} style={styles.addBtn}>
              <Plus color={COLORS.brand} size={16} weight="bold" />
              <Text style={styles.addBtnText}>Adicionar</Text>
            </Pressable>
          </View>

          {tiers.map((t, idx) => (
            <View key={idx} style={styles.tierRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.tierLbl}>Pontos</Text>
                <TextInput
                  testID={`tier-pts-${idx}`}
                  value={String(t.points)}
                  onChangeText={(v) => updateTier(idx, "points", v)}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.tierLbl}>Desconto (%)</Text>
                <TextInput
                  testID={`tier-pct-${idx}`}
                  value={String(t.discount_pct)}
                  onChangeText={(v) => updateTier(idx, "discount_pct", v)}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
              <Pressable testID={`tier-rm-${idx}`} onPress={() => removeTier(idx)} style={styles.rmBtn}>
                <Trash color={COLORS.error} size={16} weight="bold" />
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable testID="loyalty-save" disabled={saving} onPress={save} style={[styles.saveBtn, saving && { opacity: 0.5 }]}>
          <Text style={styles.saveText}>{saving ? "Salvando…" : "Salvar alterações"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const Field = ({ label, children }: any) => (
  <View style={{ gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  heroCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: "#FFF8E7", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.warning },
  heroTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  heroSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface },
  hint: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  rowSpread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.md },
  section: { fontSize: 13, fontWeight: "800", color: COLORS.onSurface },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.brandTertiary, borderWidth: 1, borderColor: COLORS.brand },
  addBtnText: { fontSize: 11, fontWeight: "800", color: COLORS.brand },
  tierRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  tierLbl: { fontSize: 10, color: COLORS.muted, fontWeight: "800", textTransform: "uppercase" },
  arrow: { fontSize: 20, color: COLORS.brand, marginBottom: 10, fontWeight: "800" },
  rmBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FDE5E5", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
