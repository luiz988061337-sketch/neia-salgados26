import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle, Minus, Plus, Sparkle } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, CartItem, fileUrl, getCart, Product, saveCart } from "@/src/api";
import { brl } from "@/src/format";

const STEP = 50;

export default function BuildCombo() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fritos, setFritos] = useState<Product[]>([]);
  const [qty, setQty] = useState<number>(STEP);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.listProducts("frito").then((r) => {
      setFritos(r);
      if (r.length) setPicks({ [r[0].id]: STEP });
    }).catch(() => {});
  }, []);

  const totalPicked = useMemo(() => Object.values(picks).reduce((s, n) => s + n, 0), [picks]);
  const flavorsMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of fritos) {
      const q = picks[p.id] || 0;
      if (q > 0) m[p.name] = q;
    }
    return m;
  }, [fritos, picks]);
  const subtotal = useMemo(() => {
    let sum = 0;
    for (const p of fritos) sum += (picks[p.id] || 0) * p.price;
    return sum;
  }, [fritos, picks]);

  const canAdd = qty >= STEP && qty % STEP === 0 && totalPicked === qty;

  const changePick = (id: string, delta: number) => {
    setPicks((cur) => {
      const c = cur[id] || 0;
      const next = Math.max(0, c + delta);
      const others = Object.entries(cur).filter(([k]) => k !== id).reduce((s, [, v]) => s + v, 0);
      if (others + next > qty) return cur;
      return { ...cur, [id]: next };
    });
  };

  const distribute = () => {
    if (!fritos.length) return;
    const per = Math.floor(qty / fritos.length);
    const remainder = qty - per * (fritos.length - 1);
    const next: Record<string, number> = {};
    fritos.forEach((p, idx) => { next[p.id] = idx === 0 ? remainder : per; });
    setPicks(next);
  };

  const addToCart = async () => {
    if (!canAdd) return;
    const flavorNames = Object.keys(flavorsMap).join(" + ");
    const item: CartItem = {
      product_id: "custom-combo",
      product_name: `Combo Personalizado ${qty}un — ${flavorNames}`,
      category: "combo",
      quantity: qty,
      unit_price: subtotal / qty,
      subtotal: Number(subtotal.toFixed(2)),
      flavors: flavorsMap,
      image_url: fritos[0]?.image_url || "",
    };
    const cart = await getCart();
    await saveCart([...cart, item]);
    setToast("Combo adicionado ao carrinho!");
    setTimeout(() => { setToast(null); router.push("/cart"); }, 700);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable testID="build-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Monte seu Combo</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 200, gap: SPACING.md }}>
        <View style={styles.hint}>
          <Sparkle color={COLORS.brand} size={20} weight="fill" />
          <Text style={styles.hintText}>Escolha os sabores que você quiser, sempre em múltiplos de 50 unidades.</Text>
        </View>

        <View style={styles.qtyBlock}>
          <Text style={styles.blockTitle}>Total do combo</Text>
          <View style={styles.stepper}>
            <Pressable testID="qty-minus" onPress={() => setQty((q) => Math.max(STEP, q - STEP))} style={styles.stepBtn}>
              <Minus color={COLORS.onSurface} size={18} weight="bold" />
            </Pressable>
            <Text style={styles.qtyText}>{qty}</Text>
            <Pressable testID="qty-plus" onPress={() => setQty((q) => q + STEP)} style={[styles.stepBtn, styles.stepBtnActive]}>
              <Plus color={COLORS.surface} size={18} weight="bold" />
            </Pressable>
          </View>
          <Pressable testID="distribute" onPress={distribute} style={styles.distribute}>
            <Text style={styles.distributeText}>Distribuir igualmente entre {fritos.length} sabores</Text>
          </Pressable>
        </View>

        <View style={styles.headerFlavors}>
          <Text style={styles.blockTitle}>Sabores</Text>
          <Text style={[styles.flavorCount, totalPicked === qty ? styles.flavorOk : styles.flavorPending]}>
            {totalPicked}/{qty}
          </Text>
        </View>

        <View style={{ gap: SPACING.sm }}>
          {fritos.map((p) => (
            <View key={p.id} style={styles.row}>
              <Image source={{ uri: fileUrl(p.image_url) }} style={styles.rowImg} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.unit}>{brl(p.price)} / un</Text>
              </View>
              <View style={styles.mini}>
                <Pressable testID={`fl-minus-${p.id}`} onPress={() => changePick(p.id, -5)} style={styles.miniBtn}>
                  <Minus color={COLORS.onSurface} size={14} weight="bold" />
                </Pressable>
                <Text style={styles.miniQty}>{picks[p.id] || 0}</Text>
                <Pressable testID={`fl-plus-${p.id}`} onPress={() => changePick(p.id, 5)} style={styles.miniBtn}>
                  <Plus color={COLORS.onSurface} size={14} weight="bold" />
                </Pressable>
              </View>
            </View>
          ))}
          {fritos.length === 0 && <Text style={{ color: COLORS.muted, textAlign: "center", padding: SPACING.lg }}>Sem sabores disponíveis</Text>}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subLbl}>Total</Text>
          <Text style={styles.subVal}>{brl(subtotal)}</Text>
        </View>
        <Pressable testID="add-combo-btn" disabled={!canAdd} onPress={addToCart} style={[styles.addBtn, !canAdd && { opacity: 0.5 }]}>
          <Text style={styles.addBtnText}>{canAdd ? "Adicionar" : `Distribua ${qty - totalPicked} un`}</Text>
        </Pressable>
      </View>

      {toast && (
        <View style={[styles.toast, { top: insets.top + 12 }]}>
          <CheckCircle color={COLORS.success} size={18} weight="fill" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  hint: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md },
  hintText: { flex: 1, fontSize: 12, color: COLORS.onBrandTertiary, fontWeight: "700" },
  qtyBlock: { gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  blockTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  stepper: { flexDirection: "row", alignItems: "center", gap: SPACING.lg, justifyContent: "center" },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  stepBtnActive: { backgroundColor: COLORS.brand },
  qtyText: { fontSize: 24, fontWeight: "800", color: COLORS.onSurface, minWidth: 60, textAlign: "center" },
  distribute: { alignSelf: "center", paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.brand },
  distributeText: { color: COLORS.brand, fontWeight: "800", fontSize: 12 },
  headerFlavors: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  flavorCount: { fontSize: 12, fontWeight: "800", paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  flavorOk: { color: COLORS.success, backgroundColor: "#DFF0E7" },
  flavorPending: { color: COLORS.warning, backgroundColor: "#FFE9D3" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  rowImg: { width: 56, height: 56, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  name: { fontSize: 14, fontWeight: "700", color: COLORS.onSurface },
  unit: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  mini: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  miniBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  miniQty: { fontSize: 15, fontWeight: "800", minWidth: 28, textAlign: "center", color: COLORS.onSurface },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  subLbl: { fontSize: 11, color: COLORS.muted, fontWeight: "600" },
  subVal: { fontSize: 20, fontWeight: "800", color: COLORS.onSurface },
  addBtn: { backgroundColor: COLORS.brand, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  addBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
  toast: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.surface, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  toastText: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
});
