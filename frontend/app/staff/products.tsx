import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Camera, ImageSquare, Plus, Star, Trash, X } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, fileUrl, Product, Theme } from "@/src/api";
import { brl } from "@/src/format";

export default function StaffProducts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [themeName, setThemeName] = useState<string | null>(null);
  const [isFeatured, setIsFeatured] = useState(false);

  const load = async () => {
    setProducts(await api.adminProducts());
    setThemes(await api.adminThemes());
  };
  useEffect(() => { load(); }, []);

  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name); setDescription(p.description);
    setPriceStr(String(p.price).replace(".", ","));
    setImageUrl(p.image_url);
    setImageUrls(p.image_urls || []);
    setThemeName(p.theme || null);
    setIsFeatured(!!p.is_featured);
  };

  const pick = async (fromCamera: boolean, target: "main" | "gallery" = "main") => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso nas configurações do sistema.");
      return;
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    try {
      setSaving(true);
      const up = await api.adminUploadImage(a.uri, a.fileName || `p-${Date.now()}.jpg`, a.mimeType || "image/jpeg");
      if (target === "main") setImageUrl(up.url);
      else setImageUrls((v) => [...v, up.url]);
    } catch (e: any) {
      Alert.alert("Falha no upload", e.message || "Tente novamente");
    } finally { setSaving(false); }
  };

  const removeGalleryPhoto = (url: string) => setImageUrls((v) => v.filter((u) => u !== url));

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.adminUpdateProduct(editing.id, {
        name, description,
        price: Number(priceStr.replace(",", ".")),
        image_url: imageUrl,
        image_urls: imageUrls,
        theme: themeName || null,
        is_featured: isFeatured,
      } as any);
      setEditing(null);
      await load();
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally { setSaving(false); }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="products-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Cardápio & Fotos</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 }}
        renderItem={({ item }) => (
          <Pressable testID={`edit-${item.id}`} onPress={() => openEdit(item)} style={styles.row}>
            <Image source={{ uri: fileUrl(item.image_url) }} style={styles.img} contentFit="cover" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
              <View style={styles.tags}>
                <View style={styles.catTag}><Text style={styles.catTagText}>{item.category}</Text></View>
                {item.theme && <View style={styles.themeTag}><Text style={styles.themeTagText}>{item.theme}</Text></View>}
                {item.is_featured && <View style={styles.featTag}><Star color={COLORS.warning} size={10} weight="fill" /><Text style={styles.featTagText}>destaque</Text></View>}
              </View>
              <Text style={styles.price}>{brl(item.price)}</Text>
            </View>
          </Pressable>
        )}
      />

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={[styles.sheet, { maxHeight: "92%" }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Editar produto</Text>
              <Pressable onPress={() => setEditing(null)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
              <Pressable testID="edit-photo-preview" onPress={() => pick(false)} style={styles.previewWrap}>
                {imageUrl ? (
                  <Image source={{ uri: fileUrl(imageUrl) }} style={styles.previewImg} contentFit="cover" />
                ) : (
                  <View style={styles.previewEmpty}><ImageSquare color={COLORS.muted} size={40} weight="light" /></View>
                )}
              </Pressable>
              <View style={styles.pickRow}>
                <Pressable testID="pick-gallery" onPress={() => pick(false, "main")} style={styles.pickBtn}>
                  <ImageSquare color={COLORS.brand} size={18} />
                  <Text style={styles.pickBtnText}>Galeria</Text>
                </Pressable>
                <Pressable testID="pick-camera" onPress={() => pick(true, "main")} style={styles.pickBtn}>
                  <Camera color={COLORS.brand} size={18} />
                  <Text style={styles.pickBtnText}>Câmera</Text>
                </Pressable>
              </View>

              <Field label={`Fotos em rodízio (${imageUrls.length})`}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingVertical: 4 }}>
                  {imageUrls.map((u) => (
                    <View key={u} style={styles.thumbWrap}>
                      <Image source={{ uri: fileUrl(u) }} style={styles.thumb} contentFit="cover" />
                      <Pressable testID={`rm-gallery-${u}`} onPress={() => removeGalleryPhoto(u)} style={styles.thumbRm}>
                        <Trash color={COLORS.surface} size={14} weight="bold" />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable testID="add-gallery" onPress={() => pick(false, "gallery")} style={styles.thumbAdd}>
                    <Plus color={COLORS.brand} size={22} weight="bold" />
                    <Text style={styles.thumbAddText}>Adicionar</Text>
                  </Pressable>
                </ScrollView>
              </Field>

              <Field label="Nome"><TextInput testID="p-name" value={name} onChangeText={setName} style={styles.input} /></Field>
              <Field label="Descrição"><TextInput testID="p-desc" value={description} onChangeText={setDescription} multiline style={[styles.input, { minHeight: 80 }]} /></Field>
              <Field label="Preço (R$)"><TextInput testID="p-price" value={priceStr} onChangeText={setPriceStr} keyboardType="numeric" style={styles.input} /></Field>

              <Field label="Tema (opcional)">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingVertical: 4 }}>
                  <Pressable testID="theme-none" onPress={() => setThemeName(null)} style={[styles.chip, !themeName && styles.chipActive]}>
                    <Text style={[styles.chipText, !themeName && styles.chipTextActive]}>Nenhum</Text>
                  </Pressable>
                  {themes.map((t) => (
                    <Pressable key={t.id} testID={`theme-${t.name}`} onPress={() => setThemeName(t.name)} style={[styles.chip, themeName === t.name && styles.chipActive]}>
                      <Text style={[styles.chipText, themeName === t.name && styles.chipTextActive]}>{t.emoji} {t.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Field>

              <Pressable testID="p-featured-toggle" onPress={() => setIsFeatured((v) => !v)} style={styles.toggleRow}>
                <Star color={isFeatured ? COLORS.warning : COLORS.muted} size={18} weight={isFeatured ? "fill" : "regular"} />
                <Text style={styles.toggleLabel}>Marcar como destaque</Text>
                <View style={[styles.switch, isFeatured && styles.switchOn]}><View style={[styles.knob, isFeatured && styles.knobOn]} /></View>
              </Pressable>

              <Pressable testID="p-save" disabled={saving} onPress={save} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                <Text style={styles.saveBtnText}>{saving ? "Salvando…" : "Salvar"}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const Field = ({ label, children }: any) => (
  <View style={{ gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  row: { flexDirection: "row", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  img: { width: 84, height: 84, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  name: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  desc: { fontSize: 12, color: COLORS.muted },
  tags: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  catTag: { backgroundColor: COLORS.surfaceSecondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
  catTagText: { fontSize: 10, fontWeight: "800", color: COLORS.onSurface, textTransform: "uppercase" },
  themeTag: { backgroundColor: COLORS.brandTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
  themeTagText: { fontSize: 10, fontWeight: "800", color: COLORS.onBrandTertiary },
  featTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FFF3D8", paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
  featTagText: { fontSize: 10, fontWeight: "800", color: COLORS.warning },
  price: { fontSize: 14, fontWeight: "800", color: COLORS.brand, marginTop: 4 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.overlay },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, paddingBottom: SPACING.xxl },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  previewWrap: { alignSelf: "center", width: "100%", height: 180, borderRadius: RADIUS.md, overflow: "hidden", backgroundColor: COLORS.surfaceSecondary },
  previewImg: { width: "100%", height: "100%" },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  pickRow: { flexDirection: "row", gap: SPACING.sm },
  pickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  pickBtnText: { color: COLORS.brand, fontWeight: "800", fontSize: 13 },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface },
  chip: { height: 36, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.onSurface },
  chipTextActive: { color: COLORS.surface },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  toggleLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.onSurface },
  switch: { width: 42, height: 24, borderRadius: 12, backgroundColor: COLORS.borderStrong, padding: 2 },
  switchOn: { backgroundColor: COLORS.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.surface },
  knobOn: { transform: [{ translateX: 18 }] },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
  thumbWrap: { position: "relative" },
  thumb: { width: 84, height: 84, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  thumbRm: { position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.error, alignItems: "center", justifyContent: "center" },
  thumbAdd: { width: 84, height: 84, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.brand, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  thumbAddText: { fontSize: 10, color: COLORS.brand, fontWeight: "800" },
});
