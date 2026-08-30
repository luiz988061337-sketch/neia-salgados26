import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Motorcycle, Timer, TrendUp, Trophy } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, RankingItem } from "@/src/api";
import { brl } from "@/src/format";

const medal = (idx: number) => (idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`);

export default function StaffRanking() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.adminMotoboysRanking();
      setRanking(r.ranking); setDate(r.date);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const totalDeliveries = ranking.reduce((s, r) => s + r.deliveries, 0);
  const bestTime = ranking.find((r) => r.avg_minutes != null)?.avg_minutes ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="ranking-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ranking Motoboys</Text>
          <Text style={styles.subtitle}>{date}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.kpis}>
        <View style={styles.kpi}>
          <Motorcycle color={COLORS.brand} size={22} weight="fill" />
          <Text style={styles.kpiVal}>{totalDeliveries}</Text>
          <Text style={styles.kpiLbl}>entregas hoje</Text>
        </View>
        <View style={styles.kpi}>
          <Timer color={COLORS.success} size={22} weight="fill" />
          <Text style={styles.kpiVal}>{bestTime != null ? `${bestTime} min` : "—"}</Text>
          <Text style={styles.kpiLbl}>melhor média</Text>
        </View>
        <View style={styles.kpi}>
          <TrendUp color={COLORS.warning} size={22} weight="fill" />
          <Text style={styles.kpiVal}>{brl(ranking.reduce((s, r) => s + r.revenue, 0))}</Text>
          <Text style={styles.kpiLbl}>faturado</Text>
        </View>
      </View>

      <FlatList
        data={ranking}
        keyExtractor={(r) => r.motoboy_id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Trophy color={COLORS.muted} size={48} weight="light" />
            <Text style={styles.emptyText}>{loading ? "Carregando…" : "Nenhuma entrega concluída hoje"}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View testID={`ranking-${item.motoboy_id}`} style={styles.row}>
            <Text style={styles.medal}>{medal(index)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phone}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={styles.avg}>{item.avg_minutes != null ? `${item.avg_minutes} min` : "—"}</Text>
              <Text style={styles.count}>{item.deliveries} entregas • {brl(item.revenue)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: 11, color: COLORS.muted },
  kpis: { flexDirection: "row", padding: SPACING.lg, gap: SPACING.sm },
  kpi: { flex: 1, alignItems: "center", padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, gap: 4 },
  kpiVal: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  kpiLbl: { fontSize: 10, color: COLORS.muted, fontWeight: "600", textAlign: "center" },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyText: { color: COLORS.muted, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  medal: { fontSize: 26 },
  name: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  phone: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  avg: { fontSize: 15, fontWeight: "800", color: COLORS.brand },
  count: { fontSize: 11, color: COLORS.muted },
});
