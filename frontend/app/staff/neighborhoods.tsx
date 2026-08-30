import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MapPin, Plus, Trash, X } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, Neighborhood } from "@/src/api";
import { brl } from "@/src/format";

export default function StaffNeighborhoods() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Neighborhood[]>([]);
  const [editing, setEditing] = useState<Neighborhood | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");

  const load = async () => setItems(await api.adminNeighborhoods());
  useEffect(() => { load(); }, []);

  const openCreate = () => { setCreating(true); setEditing(null); setName(""); setFee(""); };
  const openEdit = (n: Neighborhood) => { setEditing(n); setCreating(false); setName(n.name); setFee(String(n.delivery_fee).replace(".", ",")); };

  const save = async () => {
    if (!name || !fee) return;
    try {
      const body = { name, delivery_fee: Number(fee.replace(",", ".")), active: true };
      if (editing) await api.adminUpdateNeighborhood(editing.id, body);
      else await api.adminCreateNeighborhood(body);
      setEditing(null); setCreating(false);
      await load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
  };

  const remove = async (id: string) => {
    await api.adminDeleteNeighborhood(id);
    load();
  };

  const showSheet = creating || !!editing;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="nbh-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Bairros</Text>
        <Pressable testID="nbh-add" onPress={openCreate} style={[styles.iconBtn, { backgroundColor: COLORS.brand }]}>
          <Plus color={COLORS.surface} size={18} weight="bold" />
        </Pressable>
      </View>

      <FlatList
        data={items.filter((n) => n.active)}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum bairro cadastrado.</Text>}
        renderItem={({ item }) => (
          <Pressable testID={`nbh-item-${item.id}`} onPress={() => openEdit(item)} style={styles.row}>
            <MapPin color={COLORS.brand} size={22} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowFee}>Taxa: {brl(item.delivery_fee)}</Text>
            </View>
            <Pressable testID={`nbh-del-${item.id}`} onPress={() => remove(item.id)} style={styles.del}>
              <Trash color={COLORS.error} size={18} />
            </Pressable>
          </Pressable>
        )}
      />

      <Modal visible={showSheet} animationType="slide" transparent onRequestClose={() => { setEditing(null); setCreating(false); }}>
        <Pressable style={styles.backdrop} onPress={() => { setEditing(null); setCreating(false); }}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{creating ? "Novo bairro" : "Editar bairro"}</Text>
              <Pressable onPress={() => { setEditing(null); setCreating(false); }}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            <Text style={styles.label}>Nome</Text>
            <TextInput testID="nbh-name" value={name} onChangeText={setName} placeholder="Centro" placeholderTextColor={COLORS.muted} style={styles.input} />
            <Text style={styles.label}>Taxa de entrega (R$)</Text>
            <TextInput testID="nbh-fee" value={fee} onChangeText={setFee} placeholder="8,00" keyboardType="numeric" placeholderTextColor={COLORS.muted} style={styles.input} />
            <Pressable testID="nbh-save" onPress={save} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Salvar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  empty: { textAlign: "center", padding: SPACING.xxxl, color: COLORS.muted },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  rowName: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  rowFee: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  del: { padding: SPACING.sm },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.overlay },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xxl },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.sm },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 6 },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, color: COLORS.onSurface },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
