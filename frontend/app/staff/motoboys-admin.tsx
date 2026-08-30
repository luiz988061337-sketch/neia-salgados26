import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Camera, ImageSquare, Motorcycle, Pencil, Plus, Trash, X } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, fileUrl } from "@/src/api";

type Moto = {
  id: string; name: string; phone: string; photo_url?: string; active?: boolean;
  current_lat?: number; current_lng?: number; commission_pct?: number;
};

export default function StaffMotoboysAdmin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Moto[]>([]);
  const [editing, setEditing] = useState<Moto | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(true);
  const [photoUrl, setPhotoUrl] = useState("");
  const [commissionPct, setCommissionPct] = useState("0");

  const load = async () => {
    try { setItems(await api.adminAllMotoboys()); } catch (e: any) { Alert.alert("Erro", e.message); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName(""); setPhone(""); setPassword(""); setActive(true);
    setPhotoUrl(""); setCommissionPct("0");
    setCreating(true);
  };
  const openEdit = (m: Moto) => {
    setEditing(m);
    setName(m.name); setPhone(m.phone); setPassword(""); setActive(!!m.active);
    setPhotoUrl(m.photo_url || "");
    setCommissionPct(String(m.commission_pct ?? 0));
    setCreating(true);
  };

  const pickPhoto = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso nas configurações.");
      return;
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    try {
      setSaving(true);
      const up = await api.adminUploadImage(a.uri, a.fileName || `m-${Date.now()}.jpg`, a.mimeType || "image/jpeg");
      setPhotoUrl(up.url);
    } catch (e: any) { Alert.alert("Falha no upload", e.message); }
    finally { setSaving(false); }
  };

  const save = async () => {
    if (!name.trim() || !phone.trim()) { Alert.alert("Erro", "Preencha nome e telefone"); return; }
    if (!editing && !password.trim()) { Alert.alert("Erro", "Defina uma senha"); return; }
    setSaving(true);
    try {
      const pct = Math.max(0, Math.min(100, Number(commissionPct.replace(",", ".")) || 0));
      if (editing) {
        const body: any = { name, phone, active, photo_url: photoUrl, commission_pct: pct };
        if (password.trim()) body.password = password.trim();
        await api.adminUpdateMotoboy(editing.id, body);
      } else {
        await api.adminCreateMotoboy({ name, phone, password: password.trim(), active, photo_url: photoUrl, commission_pct: pct });
      }
      setCreating(false);
      await load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSaving(false); }
  };

  const remove = (m: Moto) => {
    Alert.alert("Desativar motoboy", `Remover ${m.name}? Ele não conseguirá mais fazer login.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Desativar", style: "destructive", onPress: async () => {
        try { await api.adminDeleteMotoboy(m.id); await load(); }
        catch (e: any) { Alert.alert("Erro", e.message); }
      } },
    ]);
  };

  const toggle = async (m: Moto) => {
    try { await api.adminUpdateMotoboy(m.id, { active: !m.active }); await load(); }
    catch (e: any) { Alert.alert("Erro", e.message); }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="motoboys-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Motoboys</Text>
        <Pressable testID="new-motoboy" onPress={openCreate} style={[styles.iconBtn, { backgroundColor: COLORS.brand }]}>
          <Plus color={COLORS.surface} size={18} weight="bold" />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 60 }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: "center", padding: SPACING.xl }}>Nenhum motoboy cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.active && { opacity: 0.6 }]}>
            <View style={styles.avatar}>
              <Motorcycle color={COLORS.surface} size={22} weight="fill" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phone}</Text>
              <View style={styles.tagRow}>
                {!!item.active && item.current_lat && item.current_lng
                  ? <View style={[styles.tag, styles.tagOk]}><Text style={styles.tagOkText}>📍 GPS ativo</Text></View>
                  : <View style={styles.tag}><Text style={styles.tagText}>{item.active ? "Ativo" : "Inativo"}</Text></View>}
              </View>
            </View>
            <Switch value={!!item.active} onValueChange={() => toggle(item)} />
            <Pressable testID={`edit-${item.id}`} onPress={() => openEdit(item)} style={styles.iconBtnSm}>
              <Pencil color={COLORS.brand} size={16} weight="bold" />
            </Pressable>
            <Pressable testID={`rm-${item.id}`} onPress={() => remove(item)} style={[styles.iconBtnSm, { backgroundColor: "#FDE5E5" }]}>
              <Trash color={COLORS.error} size={16} weight="bold" />
            </Pressable>
          </View>
        )}
      />

      <Modal visible={creating} animationType="slide" transparent onRequestClose={() => setCreating(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreating(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editing ? "Editar motoboy" : "Novo motoboy"}</Text>
              <Pressable onPress={() => setCreating(false)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
              <Pressable testID="m-photo-preview" onPress={() => pickPhoto(false)} style={styles.photoWrap}>
                {photoUrl ? (
                  <Image source={{ uri: fileUrl(photoUrl) }} style={styles.photoImg} contentFit="cover" />
                ) : (
                  <View style={styles.photoEmpty}><ImageSquare color={COLORS.muted} size={38} weight="light" /></View>
                )}
              </Pressable>
              <View style={styles.pickRow}>
                <Pressable testID="m-pick-gallery" onPress={() => pickPhoto(false)} style={styles.pickBtn}>
                  <ImageSquare color={COLORS.brand} size={16} />
                  <Text style={styles.pickBtnText}>Galeria</Text>
                </Pressable>
                <Pressable testID="m-pick-camera" onPress={() => pickPhoto(true)} style={styles.pickBtn}>
                  <Camera color={COLORS.brand} size={16} />
                  <Text style={styles.pickBtnText}>Câmera</Text>
                </Pressable>
              </View>

              <Field label="Nome">
                <TextInput testID="m-name" value={name} onChangeText={setName} style={styles.input} placeholder="Ex: Carlos Silva" />
              </Field>
              <Field label="Telefone (só números)">
                <TextInput testID="m-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} placeholder="Ex: 11999990001" />
              </Field>
              <Field label={editing ? "Nova senha (deixe em branco para manter)" : "Senha"}>
                <TextInput testID="m-password" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholder="Mín 4 dígitos" />
              </Field>
              <Field label="Comissão (% da taxa de entrega)">
                <TextInput testID="m-commission" value={commissionPct} onChangeText={setCommissionPct} keyboardType="decimal-pad" style={styles.input} placeholder="Ex: 50" />
              </Field>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLbl}>Ativo (pode fazer login)</Text>
                <Switch value={active} onValueChange={setActive} />
              </View>
              <Pressable testID="m-save" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                <Text style={styles.saveText}>{saving ? "Salvando…" : (editing ? "Salvar" : "Cadastrar")}</Text>
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
  iconBtnSm: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  phone: { fontSize: 12, color: COLORS.muted },
  tagRow: { flexDirection: "row", gap: 4, marginTop: 3 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSecondary },
  tagOk: { backgroundColor: "#DFF0E7" },
  tagText: { fontSize: 10, fontWeight: "800", color: COLORS.muted },
  tagOkText: { fontSize: 10, fontWeight: "800", color: COLORS.success },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.overlay },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, paddingBottom: SPACING.xxl, maxHeight: "90%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  toggleLbl: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
