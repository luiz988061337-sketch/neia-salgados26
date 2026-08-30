import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MagnifyingGlass, Receipt } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, getCustomer, Order, saveCustomer } from "@/src/api";
import { brl, statusLabel, timeAgo } from "@/src/format";

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: string) => {
    if (!p) return;
    setLoading(true);
    try {
      const r = await api.listOrdersByPhone(p);
      setOrders(r);
    } catch { setOrders([]); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    getCustomer().then((c: any) => {
      if (c?.phone) { setPhone(c.phone); load(c.phone); }
    });
  }, [load]));

  const onSearch = async () => {
    await saveCustomer({ phone });
    load(phone);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus Pedidos</Text>
        <View style={styles.searchRow}>
          <MagnifyingGlass color={COLORS.muted} size={18} />
          <TextInput
            testID="orders-phone-input"
            placeholder="Telefone (ex: 11999998888)"
            placeholderTextColor={COLORS.muted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.input}
          />
          <Pressable testID="orders-search-btn" onPress={onSearch} style={styles.searchBtn}>
            <Text style={styles.searchBtnText}>Buscar</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={orders || []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Receipt color={COLORS.muted} size={48} weight="light" />
            <Text style={styles.emptyText}>
              {orders === null ? "Digite seu telefone para ver seus pedidos" : loading ? "Carregando..." : "Nenhum pedido encontrado"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`order-${item.id}`}
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: item.id } })}
            style={styles.card}
          >
            <View style={styles.cardHead}>
              <Text style={styles.code}>#{item.short_code}</Text>
              <View style={[styles.statusPill, statusStyle(item.status)]}>
                <Text style={[styles.statusText, statusTextStyle(item.status)]}>{statusLabel(item.status)}</Text>
              </View>
            </View>
            <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            <Text style={styles.items} numberOfLines={2}>
              {item.items.map((i) => `${i.quantity}x ${i.product_name}`).join(" • ")}
            </Text>
            <View style={styles.foot}>
              <Text style={styles.total}>{brl(item.total)}</Text>
              {item.motoboy_name ? <Text style={styles.moto}>🛵 {item.motoboy_name}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const statusStyle = (s: string) => {
  if (s === "entregue") return { backgroundColor: "#DFF0E7" };
  if (s === "saiu_entrega") return { backgroundColor: "#FFE9D3" };
  if (s === "fritando") return { backgroundColor: COLORS.brandTertiary };
  if (s === "cancelado") return { backgroundColor: "#F3D8D3" };
  return { backgroundColor: COLORS.surfaceSecondary };
};
const statusTextStyle = (s: string) => {
  if (s === "entregue") return { color: COLORS.success };
  if (s === "saiu_entrega") return { color: COLORS.warning };
  if (s === "fritando") return { color: COLORS.onBrandTertiary };
  if (s === "cancelado") return { color: COLORS.error };
  return { color: COLORS.onSurface };
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.onSurface },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 14, color: COLORS.onSurface, paddingVertical: 8 },
  searchBtn: { backgroundColor: COLORS.brand, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill },
  searchBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyText: { color: COLORS.muted, textAlign: "center" },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: 6 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  statusText: { fontSize: 11, fontWeight: "800" },
  time: { fontSize: 11, color: COLORS.muted },
  items: { fontSize: 13, color: COLORS.onSurfaceSecondary },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  total: { fontSize: 16, fontWeight: "800", color: COLORS.brand },
  moto: { fontSize: 12, color: COLORS.info, fontWeight: "700" },
});
