import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChatCircleText, Crown, Gift } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, CustomerVip } from "@/src/api";
import { brl } from "@/src/format";
import { openWhatsApp } from "@/src/whatsapp";

const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`);

export default function StaffVip() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<CustomerVip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminCustomersRanking()
      .then((r) => setItems(r.ranking))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = items.reduce((s, c) => s + c.total_spent, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="vip-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Clientes VIP</Text>
          <Text style={styles.subtitle}>{items.length} clientes • {brl(totalRevenue)} faturado</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(c) => c.phone}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Crown color={COLORS.muted} size={48} weight="light" />
            <Text style={styles.emptyText}>{loading ? "Carregando…" : "Nenhum cliente ainda"}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View testID={`vip-${item.phone}`} style={styles.card}>
            <Text style={styles.medal}>{medal(index)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phone}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaBold}>{item.orders_count} pedidos</Text>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.metaAmount}>{brl(item.total_spent)}</Text>
                {item.birthday ? (
                  <>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaBirthday}>🎂 {item.birthday.slice(-5)}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <Pressable
              testID={`vip-perk-${item.phone}`}
              onPress={() => openWhatsApp(item.phone, `Olá ${item.name}! Você é um cliente VIP da Néia 💛 Que tal um cupom especial no próximo pedido? Use VIP15 e ganhe 15% off!`)}
              style={styles.perkBtn}
            >
              <Gift color={COLORS.surface} size={14} weight="fill" />
              <Text style={styles.perkText}>Mimo</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: 11, color: COLORS.muted },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyText: { color: COLORS.muted },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  medal: { fontSize: 22, minWidth: 32 },
  name: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  phone: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  metaBold: { fontSize: 12, fontWeight: "800", color: COLORS.brand },
  metaAmount: { fontSize: 12, fontWeight: "800", color: COLORS.success },
  metaDot: { color: COLORS.muted },
  metaBirthday: { fontSize: 11, color: COLORS.warning, fontWeight: "700" },
  perkBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill },
  perkText: { color: COLORS.surface, fontWeight: "800", fontSize: 12 },
});
