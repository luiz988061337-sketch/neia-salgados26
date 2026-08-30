import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, fileUrl, Product } from "@/src/api";
import { brl } from "@/src/format";

const CATS = [
  { id: "all", label: "Tudo" },
  { id: "combo", label: "Combos" },
  { id: "frito", label: "Fritos" },
  { id: "congelado", label: "Congelados" },
];

export default function Menu() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cat, setCat] = useState("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listProducts().then((r) => { setProducts(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = cat === "all" ? products : products.filter((p) => p.category === cat);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Cardápio</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm, paddingVertical: SPACING.sm }}
        >
          {CATS.map((c) => {
            const active = cat === c.id;
            return (
              <Pressable
                key={c.id}
                testID={`chip-${c.id}`}
                onPress={() => setCat(c.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{loading ? "Carregando..." : "Nenhum produto encontrado"}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`product-${item.id}`}
            onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
            style={styles.card}
          >
            <Image source={{ uri: fileUrl(item.image_url) }} style={styles.img} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.tagRow}>
                <View style={[styles.tag, item.category === "congelado" ? styles.tagBlue : styles.tagBrand]}>
                  <Text style={[styles.tagText, item.category === "congelado" ? styles.tagBlueText : styles.tagBrandText]}>
                    {item.category === "congelado" ? "A partir de 1un" : "50 em 50"}
                  </Text>
                </View>
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.price}>
                {brl(item.price)}{item.category !== "combo" && item.category === "frito" ? " /un" : item.category === "congelado" ? "" : ""}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  headerBlock: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.onSurface, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  chip: {
    height: 36, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 13, fontWeight: "600", color: COLORS.onSurface },
  chipTextActive: { color: COLORS.surface, fontWeight: "800" },
  card: {
    flexDirection: "row", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  img: { width: 92, height: 92, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  tagRow: { flexDirection: "row", gap: 6 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  tagBrand: { backgroundColor: COLORS.brandTertiary },
  tagBlue: { backgroundColor: "#DDECF5" },
  tagText: { fontSize: 10, fontWeight: "800" },
  tagBrandText: { color: COLORS.onBrandTertiary },
  tagBlueText: { color: "#1F5A7A" },
  name: { fontSize: 15, fontWeight: "700", color: COLORS.onSurface },
  desc: { fontSize: 12, color: COLORS.muted },
  price: { fontSize: 15, fontWeight: "800", color: COLORS.brand, marginTop: 2 },
  empty: { alignItems: "center", padding: SPACING.xxl },
  emptyText: { color: COLORS.muted },
});
