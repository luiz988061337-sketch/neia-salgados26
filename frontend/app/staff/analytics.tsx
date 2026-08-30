import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChartBar, Package, Receipt, TrendUp } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { Analytics, api } from "@/src/api";
import { brl } from "@/src/format";

const PERIODS: { key: "today" | "week" | "month"; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
];

export default function StaffAnalytics() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => { api.adminAnalytics(period).then(setData).catch(() => {}); }, [period]);

  const maxSeries = Math.max(1, ...(data?.series || []).map((s) => s.revenue));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="analytics-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Análise de Vendas</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.chipRow}>
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <Pressable key={p.key} testID={`period-${p.key}`} onPress={() => setPeriod(p.key)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}>
        <View style={styles.kpis}>
          <Kpi icon={<TrendUp color={COLORS.brand} size={22} weight="fill" />} value={brl(data?.total_revenue || 0)} label="faturado" />
          <Kpi icon={<Receipt color={COLORS.success} size={22} weight="fill" />} value={String(data?.orders_count || 0)} label="pedidos" />
          <Kpi icon={<Package color={COLORS.warning} size={22} weight="fill" />} value={brl(data?.avg_ticket || 0)} label="ticket médio" />
        </View>

        <Text style={styles.section}>Faturamento por dia</Text>
        <View style={styles.chart}>
          {(data?.series || []).map((s, idx) => {
            const h = Math.max(4, Math.round((s.revenue / maxSeries) * 130));
            return (
              <View key={idx} style={styles.barCol}>
                <Text style={styles.barVal}>{s.revenue > 0 ? brl(s.revenue).replace("R$", "").trim() : ""}</Text>
                <View style={[styles.bar, { height: h, backgroundColor: s.revenue > 0 ? COLORS.brand : COLORS.borderStrong }]} />
                <Text style={styles.barLbl}>{s.label}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.section}>Top produtos</Text>
        <View style={{ gap: SPACING.sm }}>
          {(data?.top_products || []).map((p, i) => (
            <View key={i} style={styles.row}>
              <ChartBar color={COLORS.brand} size={18} weight="fill" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowSub}>{p.qty} unidades vendidas</Text>
              </View>
              <Text style={styles.rowRev}>{brl(p.revenue)}</Text>
            </View>
          ))}
          {(!data || !data.top_products?.length) && <Text style={styles.emptyText}>Sem dados no período</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const Kpi = ({ icon, value, label }: any) => (
  <View style={styles.kpi}>
    {icon}
    <Text style={styles.kpiValue}>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  chipRow: { flexDirection: "row", gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  chip: { flex: 1, height: 36, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
  chipTextActive: { color: COLORS.surface, fontWeight: "800" },
  kpis: { flexDirection: "row", gap: SPACING.sm },
  kpi: { flex: 1, alignItems: "center", padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, gap: 4 },
  kpiValue: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface, textAlign: "center" },
  kpiLabel: { fontSize: 10, color: COLORS.muted, fontWeight: "700", textAlign: "center" },
  section: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface, marginTop: SPACING.md },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 4, minHeight: 170, padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "70%", minWidth: 8, borderRadius: 6 },
  barVal: { fontSize: 9, color: COLORS.onSurface, fontWeight: "800" },
  barLbl: { fontSize: 9, color: COLORS.muted, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  rowName: { fontSize: 14, fontWeight: "700", color: COLORS.onSurface },
  rowSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  rowRev: { fontSize: 14, fontWeight: "800", color: COLORS.brand },
  emptyText: { color: COLORS.muted, textAlign: "center", padding: SPACING.lg },
});
