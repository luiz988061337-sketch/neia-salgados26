import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, Theme } from "@/src/api";

export default function StaffThemes() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [themes, setThemes] = useState<Theme[]>([]);

  const load = async () => setThemes(await api.adminThemes());
  useEffect(() => { load(); }, []);

  const toggle = async (t: Theme) => {
    await api.adminToggleTheme(t.id, !t.active);
    load();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="themes-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Cardápio de Feriado</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          Ative um tema para mostrar automaticamente os combos temáticos no cardápio dos clientes.
        </Text>
      </View>

      <FlatList
        data={themes}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Pressable
            testID={`theme-toggle-${item.name}`}
            onPress={() => toggle(item)}
            style={[styles.card, item.active && styles.cardActive]}
          >
            <View style={styles.emojiBox}><Text style={styles.emoji}>{item.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.label}</Text>
              <Text style={styles.slug}>#{item.name}</Text>
              <Text style={[styles.status, item.active ? styles.statusOn : styles.statusOff]}>
                {item.active ? "Ativo — combos aparecem no cardápio" : "Desligado — combos ocultos"}
              </Text>
            </View>
            {item.active ? (
              <CheckCircle color={COLORS.success} size={26} weight="fill" />
            ) : (
              <View style={styles.switch}><View style={styles.knob} /></View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  info: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md },
  infoText: { color: COLORS.onBrandTertiary, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cardActive: { borderColor: COLORS.success, backgroundColor: "#F1F9F4" },
  emojiBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 26 },
  name: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  slug: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  status: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  statusOn: { color: COLORS.success },
  statusOff: { color: COLORS.muted },
  switch: { width: 42, height: 24, borderRadius: 12, backgroundColor: COLORS.borderStrong, padding: 2 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.surface },
});
