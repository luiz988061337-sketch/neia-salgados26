import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle, Minus, Plus } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, CartItem, getCart, Product, saveCart } from "@/src/api";
import { brl } from "@/src/format";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [flavors, setFlavors] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getProduct(id).then((p) => {
      setProduct(p);
      const step = p.unit_size;
      setQty(step);
      if (p.flavors?.length && p.category !== "congelado") {
        const per = Math.floor(step / p.flavors.length);
        const init: Record<string, number> = {};
        p.flavors.forEach((f, idx) => { init[f] = idx === 0 ? step - per * (p.flavors.length - 1) : per; });
        setFlavors(init);
      }
    }).catch(() => {});
  }, [id]);

  const step = product?.unit_size ?? 1;
  const totalFlavors = useMemo(() => Object.values(flavors).reduce((s, n) => s + n, 0), [flavors]);
  const hasFlavors = (product?.flavors?.length ?? 0) > 0 && product?.category !== "congelado";
  const flavorsOk = !hasFlavors || totalFlavors === qty;
  const canAdd = qty >= step && qty % step === 0 && flavorsOk;

  const subtotal = product ? (product.category === "combo" ? (qty / product.unit_size) * product.price : qty * product.price) : 0;

  const addToCart = async () => {
    if (!product || !canAdd) return;
    const cart = await getCart();
    const newItem: CartItem = {
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      quantity: qty,
      unit_price: product.category === "combo" ? product.price / product.unit_size : product.price,
      subtotal: Number(subtotal.toFixed(2)),
      flavors,
      image_url: product.image_url,
    };
    await saveCart([...cart, newItem]);
    setToast("Adicionado ao carrinho!");
    setTimeout(() => { setToast(null); router.push("/cart"); }, 700);
  };

  const changeFlavor = (name: string, delta: number) => {
    setFlavors((f) => {
      const cur = f[name] || 0;
      const next = Math.max(0, cur + delta);
      const others = Object.entries(f).filter(([k]) => k !== name).reduce((s, [, v]) => s + v, 0);
      if (others + next > qty) return f;
      return { ...f, [name]: next };
    });
  };

  if (!product) {
    return <View style={[styles.root, { paddingTop: insets.top, justifyContent: "center", alignItems: "center" }]}>
      <Text style={{ color: COLORS.muted }}>Carregando…</Text>
    </View>;
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: product.image_url }} style={styles.hero} contentFit="cover" />
          <LinearGradient colors={["rgba(28,25,23,0.4)", "transparent"]} style={{ ...StyleSheet.absoluteFillObject, height: 100 }} />
          <Pressable testID="back-btn" onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 8 }]}>
            <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
          </Pressable>
          <View style={[styles.tag, product.category === "congelado" ? styles.tagBlue : styles.tagBrand]}>
            <Text style={[styles.tagText, product.category === "congelado" ? styles.tagBlueText : styles.tagBrandText]}>
              {product.category === "congelado" ? "A partir de 1un" : "Fritura 50 em 50"}
            </Text>
          </View>
        </View>

        <View style={{ padding: SPACING.lg, gap: SPACING.sm }}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.desc}>{product.description}</Text>
          <Text style={styles.price}>{brl(product.price)}{product.category === "combo" ? " / lote de 50" : product.category === "frito" ? " / unidade" : ""}</Text>
        </View>

        <View style={styles.qtyBlock}>
          <Text style={styles.blockTitle}>Quantidade{product.category !== "congelado" && " (múltiplos de 50)"}</Text>
          <View style={styles.stepper}>
            <Pressable
              testID="qty-minus"
              onPress={() => setQty((q) => Math.max(step, q - step))}
              style={styles.stepBtn}
            >
              <Minus color={COLORS.onSurface} size={18} weight="bold" />
            </Pressable>
            <Text style={styles.qtyText}>{qty}</Text>
            <Pressable
              testID="qty-plus"
              onPress={() => setQty((q) => q + step)}
              style={[styles.stepBtn, styles.stepBtnActive]}
            >
              <Plus color={COLORS.surface} size={18} weight="bold" />
            </Pressable>
          </View>
        </View>

        {hasFlavors && (
          <View style={styles.qtyBlock}>
            <View style={styles.flavorHeader}>
              <Text style={styles.blockTitle}>Sabores</Text>
              <Text style={[styles.flavorCount, totalFlavors === qty ? styles.flavorOk : styles.flavorPending]}>
                {totalFlavors}/{qty}
              </Text>
            </View>
            <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
              {product.flavors.map((f) => (
                <View key={f} style={styles.flavorRow}>
                  <Text style={styles.flavorName}>{f}</Text>
                  <View style={styles.miniStepper}>
                    <Pressable testID={`flavor-minus-${f}`} onPress={() => changeFlavor(f, -5)} style={styles.miniBtn}>
                      <Minus color={COLORS.onSurface} size={14} weight="bold" />
                    </Pressable>
                    <Text style={styles.miniQty}>{flavors[f] || 0}</Text>
                    <Pressable testID={`flavor-plus-${f}`} onPress={() => changeFlavor(f, 5)} style={styles.miniBtn}>
                      <Plus color={COLORS.onSurface} size={14} weight="bold" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bottomLabel}>Subtotal</Text>
          <Text style={styles.bottomPrice}>{brl(subtotal)}</Text>
        </View>
        <Pressable
          testID="add-to-cart-btn"
          disabled={!canAdd}
          onPress={addToCart}
          style={[styles.addBtn, !canAdd && { opacity: 0.5 }]}
        >
          <Text style={styles.addBtnText}>Adicionar</Text>
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
  heroWrap: { height: 300, backgroundColor: COLORS.surfaceSecondary },
  hero: { width: "100%", height: "100%" },
  backBtn: {
    position: "absolute", left: SPACING.lg, width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(252,251,248,0.95)", alignItems: "center", justifyContent: "center",
  },
  tag: {
    position: "absolute", left: SPACING.lg, bottom: SPACING.lg, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  tagBrand: { backgroundColor: COLORS.brandTertiary },
  tagBlue: { backgroundColor: "#DDECF5" },
  tagText: { fontSize: 11, fontWeight: "800" },
  tagBrandText: { color: COLORS.onBrandTertiary },
  tagBlueText: { color: "#1F5A7A" },
  name: { fontSize: 24, fontWeight: "800", color: COLORS.onSurface, letterSpacing: -0.5 },
  desc: { fontSize: 14, color: COLORS.onSurfaceSecondary, lineHeight: 20 },
  price: { fontSize: 20, fontWeight: "800", color: COLORS.brand, marginTop: SPACING.sm },
  qtyBlock: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  blockTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  stepper: { flexDirection: "row", alignItems: "center", gap: SPACING.lg, marginTop: SPACING.md },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  stepBtnActive: { backgroundColor: COLORS.brand },
  qtyText: { fontSize: 24, fontWeight: "800", color: COLORS.onSurface, minWidth: 60, textAlign: "center" },
  flavorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  flavorCount: { fontSize: 12, fontWeight: "800", paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  flavorOk: { color: COLORS.success, backgroundColor: "#DFF0E7" },
  flavorPending: { color: COLORS.warning, backgroundColor: "#FFE9D3" },
  flavorRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  flavorName: { fontSize: 14, fontWeight: "600", color: COLORS.onSurface },
  miniStepper: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  miniBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  miniQty: { fontSize: 15, fontWeight: "800", minWidth: 28, textAlign: "center", color: COLORS.onSurface },
  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border, padding: SPACING.lg,
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
  },
  bottomLabel: { fontSize: 11, color: COLORS.muted, fontWeight: "600" },
  bottomPrice: { fontSize: 20, fontWeight: "800", color: COLORS.onSurface },
  addBtn: { backgroundColor: COLORS.brand, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  addBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
  toast: {
    position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    backgroundColor: COLORS.surface, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  toastText: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
});
