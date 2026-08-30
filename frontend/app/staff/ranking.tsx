import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CurrencyDollar, Motorcycle, Timer, TrendUp, Trophy } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, RankingItem, RankingTotals } from "@/src/api";
import { brl } from "@/src/format";

const medal = (idx: number) => (idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`);
type Period = "today" | "week" | "month";

export default function StaffRanking() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [totals, setTotals] = useState<RankingTotals>({ deliveries: 0, delivery_fees_total: 0, revenue: 0 });
  const [date, setDate] = useState<string>("");
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);

  const load = async (p: Period) => {
    setLoading(true);
    try {
      const r = await api.adminMotoboysRanking({ period: p });
      setRanking(r.ranking); setDate(r.date); setTotals(r.totals);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(period); }, [period]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="ranking-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Financeiro Motoboys</Text>
          <Text style={styles.subtitle}>{date}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        {(["today", "week", "month"] as Period[]).map((p) => (
          <Pressable
            key={p}
            testID={`period-${p}`}
            onPress={() => setPeriod(p)}
            style={[styles.tab, period === p && styles.tabActive]}
          >
            <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
              {p === "today" ? "Hoje" : p === "week" ? "7 dias" : "30 dias"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.kpis}>
        <View style={styles.kpi}>
          <Motorcycle color={COLORS.brand} size={22} weight="fill" />
          <Text style={styles.kpiVal}>{totals.deliveries}</Text>
          <Text style={styles.kpiLbl}>entregas</Text>
        </View>
        <View style={[styles.kpi, styles.kpiHighlight]}>
          <CurrencyDollar color={COLORS.success} size={22} weight="fill" />
          <Text testID="kpi-fees" style={styles.kpiVal}>{brl(totals.delivery_fees_total)}</Text>
          <Text style={styles.kpiLbl}>taxa entrega</Text>
        </View>
        <View style={styles.kpi}>
          <TrendUp color={COLORS.warning} size={22} weight="fill" />
          <Text style={styles.kpiVal}>{brl(totals.revenue)}</Text>
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
            <Text style={styles.emptyText}>{loading ? "Carregando…" : "Nenhuma entrega no período"}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View testID={`ranking-${item.motoboy_id}`} style={styles.row}>
            <Text style={styles.medal}>{medal(index)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phone}</Text>
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Motorcycle color={COLORS.brand} size={12} />
                  <Text style={styles.statText}>{item.deliveries} entregas</Text>
                </View>
                <View style={styles.stat}>
                  <Timer color={COLORS.muted} size={12} />
                  <Text style={styles.statText}>{item.avg_minutes != null ? `${item.avg_minutes} min` : "—"}</Text>
                </View>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={styles.fees}>{brl(item.delivery_fees_total || 0)}</Text>
              <Text style={styles.feesLbl}>taxa total</Text>
              <Text style={styles.rev}>{brl(item.revenue)} vendas</Text>
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
  tabs: { flexDirection: "row", padding: SPACING.md, gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSecondary, alignItems: "center" },
  tabActive: { backgroundColor: COLORS.brand },
  tabText: { fontSize: 12, fontWeight: "800", color: COLORS.onSurface },
  tabTextActive: { color: COLORS.surface },
  kpis: { flexDirection: "row", padding: SPACING.lg, gap: SPACING.sm },
  kpi: { flex: 1, alignItems: "center", padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, gap: 4 },
  kpiHighlight: { backgroundColor: "#DFF0E7", borderWidth: 1, borderColor: COLORS.success },
  kpiVal: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface, textAlign: "center" },
  kpiLbl: { fontSize: 10, color: COLORS.muted, fontWeight: "700", textAlign: "center" },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyText: { color: COLORS.muted, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  medal: { fontSize: 26 },
  name: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  phone: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  stats: { flexDirection: "row", gap: SPACING.sm, marginTop: 4 },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 10, color: COLORS.muted, fontWeight: "700" },
  fees: { fontSize: 16, fontWeight: "800", color: COLORS.success },
  feesLbl: { fontSize: 9, color: COLORS.muted, fontWeight: "700", textTransform: "uppercase" },
  rev: { fontSize: 10, color: COLORS.muted, fontWeight: "600", marginTop: 2 },
});
