import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Fire, ShoppingBag, Storefront } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, getCart, Product } from "@/src/api";
import { brl } from "@/src/format";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => {});
    getCart().then((c) => setCartCount(c.reduce((s, i) => s + i.quantity, 0)));
  }, []);

  const featured = products.filter((p) => p.is_featured);
  const combos = products.filter((p) => p.category === "combo").slice(0, 3);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Olá 👋</Text>
          <Text style={styles.brand}>Néia Salgados</Text>
        </View>
        <Pressable testID="header-cart-btn" onPress={() => router.push("/cart")} style={styles.cartBtn}>
          <ShoppingBag color={COLORS.onSurface} size={22} weight="regular" />
          {cartCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Pressable
          testID="hero-card"
          onPress={() => router.push("/(tabs)/menu")}
          style={styles.hero}
        >
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1641848462741-982725a92e49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHw0fHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85" }}
            style={styles.heroImg}
            contentFit="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(28,25,23,0.9)"]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroContent}>
            <View style={styles.heroTag}>
              <Fire color={COLORS.brand} size={14} weight="fill" />
              <Text style={styles.heroTagText}>Fritura 50 em 50</Text>
            </View>
            <Text style={styles.heroTitle}>Salgados fresquinhos{"\n"}direto na sua festa</Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Ver cardápio</Text>
              <ArrowRight color={COLORS.surface} size={16} weight="bold" />
            </View>
          </View>
        </Pressable>

        {/* Featured */}
        <Text style={styles.sectionTitle}>Destaques</Text>
        <FlatList
          data={featured}
          keyExtractor={(i) => i.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}
          renderItem={({ item }) => (
            <Pressable
              testID={`featured-${item.id}`}
              onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
              style={styles.featCard}
            >
              <Image source={{ uri: item.image_url }} style={styles.featImg} contentFit="cover" />
              <View style={{ padding: SPACING.md, gap: 4 }}>
                <Text style={styles.featName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.featPrice}>{brl(item.price)}</Text>
              </View>
            </Pressable>
          )}
        />

        {/* Combos */}
        <Text style={styles.sectionTitle}>Combos</Text>
        <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
          {combos.map((p) => (
            <Pressable
              key={p.id}
              testID={`combo-${p.id}`}
              onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })}
              style={styles.row}
            >
              <Image source={{ uri: p.image_url }} style={styles.rowImg} contentFit="cover" />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.badge50}>
                  <Text style={styles.badge50Text}>50 em 50</Text>
                </View>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowDesc} numberOfLines={2}>{p.description}</Text>
                <Text style={styles.rowPrice}>{brl(p.price)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          testID="see-full-menu"
          onPress={() => router.push("/(tabs)/menu")}
          style={styles.seeMore}
        >
          <Storefront color={COLORS.brand} size={18} weight="bold" />
          <Text style={styles.seeMoreText}>Ver cardápio completo</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hello: { fontSize: 12, color: COLORS.muted, fontWeight: "500" },
  brand: { fontSize: 22, fontWeight: "800", color: COLORS.onSurface, letterSpacing: -0.5 },
  cartBtn: {
    width: 44, height: 44, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  badge: {
    position: "absolute", top: -4, right: -4, backgroundColor: COLORS.brand,
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: COLORS.surface, fontSize: 11, fontWeight: "800" },
  hero: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm, height: 220,
    borderRadius: RADIUS.lg, overflow: "hidden", backgroundColor: COLORS.surfaceSecondary,
  },
  heroImg: { width: "100%", height: "100%" },
  heroContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: SPACING.lg, gap: SPACING.sm },
  heroTag: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: "rgba(252,251,248,0.95)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
  },
  heroTagText: { color: COLORS.brand, fontSize: 11, fontWeight: "800" },
  heroTitle: { color: COLORS.surface, fontSize: 22, fontWeight: "800", lineHeight: 28, letterSpacing: -0.3 },
  heroCta: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: COLORS.brand, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.pill,
  },
  heroCtaText: { color: COLORS.surface, fontWeight: "800", fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: COLORS.onSurface, paddingHorizontal: SPACING.lg, marginTop: SPACING.xl, marginBottom: SPACING.md },
  featCard: {
    width: 180, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
  },
  featImg: { width: "100%", height: 120, backgroundColor: COLORS.surfaceSecondary },
  featName: { fontSize: 14, fontWeight: "700", color: COLORS.onSurface },
  featPrice: { fontSize: 15, fontWeight: "800", color: COLORS.brand },
  row: {
    flexDirection: "row", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  rowImg: { width: 88, height: 88, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  badge50: {
    alignSelf: "flex-start", backgroundColor: COLORS.brandTertiary, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  badge50Text: { color: COLORS.onBrandTertiary, fontSize: 10, fontWeight: "800" },
  rowName: { fontSize: 15, fontWeight: "700", color: COLORS.onSurface },
  rowDesc: { fontSize: 12, color: COLORS.muted },
  rowPrice: { fontSize: 15, fontWeight: "800", color: COLORS.brand, marginTop: 2 },
  seeMore: {
    marginTop: SPACING.xl, marginHorizontal: SPACING.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.brand,
    paddingVertical: SPACING.md, backgroundColor: COLORS.brandTertiary,
  },
  seeMoreText: { color: COLORS.brand, fontWeight: "800", fontSize: 14 },
});
