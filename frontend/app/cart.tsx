import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Trash, ShoppingBagOpen } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { CartItem, getCart, saveCart } from "@/src/api";
import { brl } from "@/src/format";

export default function Cart() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);

  useFocusEffect(useCallback(() => { getCart().then(setItems); }, []));

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const deliveryFee = items.length ? 8.0 : 0;

  const remove = async (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    await saveCart(next);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="cart-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Carrinho</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(_, idx) => String(idx)}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 200 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ShoppingBagOpen color={COLORS.muted} size={56} weight="light" />
            <Text style={styles.emptyText}>Seu carrinho está vazio</Text>
            <Pressable testID="cart-goto-menu" onPress={() => router.push("/(tabs)/menu")} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Ver cardápio</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => (
          <View testID={`cart-item-${index}`} style={styles.card}>
            <Image source={{ uri: item.image_url }} style={styles.img} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.name} numberOfLines={2}>{item.product_name}</Text>
              <Text style={styles.qty}>{item.quantity} un</Text>
              {Object.keys(item.flavors).length > 0 && (
                <Text style={styles.flavors} numberOfLines={2}>
                  {Object.entries(item.flavors).filter(([, v]) => v > 0).map(([k, v]) => `${v}x ${k}`).join(", ")}
                </Text>
              )}
              <Text style={styles.subtotal}>{brl(item.subtotal)}</Text>
            </View>
            <Pressable testID={`cart-remove-${index}`} onPress={() => remove(index)} style={styles.removeBtn}>
              <Trash color={COLORS.error} size={18} weight="regular" />
            </Pressable>
          </View>
        )}
      />

      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Subtotal</Text>
            <Text style={styles.rowVal}>{brl(subtotal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Taxa de entrega</Text>
            <Text style={styles.rowVal}>{brl(deliveryFee)}</Text>
          </View>
          <View style={[styles.row, { marginTop: 6 }]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>{brl(subtotal + deliveryFee)}</Text>
          </View>
          <Pressable testID="checkout-btn" onPress={() => router.push("/checkout")} style={styles.cta}>
            <Text style={styles.ctaText}>Ir para checkout</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  empty: { alignItems: "center", padding: SPACING.xxxl, gap: SPACING.md },
  emptyText: { fontSize: 15, fontWeight: "600", color: COLORS.muted },
  emptyBtn: { backgroundColor: COLORS.brand, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  emptyBtnText: { color: COLORS.surface, fontWeight: "800" },
  card: { flexDirection: "row", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center" },
  img: { width: 72, height: 72, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  name: { fontSize: 14, fontWeight: "700", color: COLORS.onSurface },
  qty: { fontSize: 12, fontWeight: "600", color: COLORS.muted },
  flavors: { fontSize: 11, color: COLORS.info },
  subtotal: { fontSize: 15, fontWeight: "800", color: COLORS.brand, marginTop: 2 },
  removeBtn: { padding: SPACING.sm },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: SPACING.lg,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: COLORS.muted, fontSize: 13 },
  rowVal: { color: COLORS.onSurface, fontSize: 13, fontWeight: "700" },
  totalLabel: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  totalVal: { fontSize: 20, fontWeight: "800", color: COLORS.brand },
  cta: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.sm },
  ctaText: { color: COLORS.surface, fontSize: 15, fontWeight: "800" },
});
