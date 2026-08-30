import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus, Ticket, Trash, X } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Coupon = {
  code: string;
  discount_percent: number;
  active: boolean;
  expires_at?: string | null;
  max_uses?: number | null;
  uses_count?: number;
  first_order_only?: boolean;
  description?: string;
  belongs_to?: string;
  reason?: string;
};

export default function StaffCoupons() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Coupon[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [pct, setPct] = useState("10");
  const [firstOnly, setFirstOnly] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [desc, setDesc] = useState("");

  const load = async () => {
    try { setItems(await api.adminCoupons()); } catch (e: any) { Alert.alert("Erro", e.message); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!code.trim()) { Alert.alert("Erro", "Informe o código"); return; }
    const n = Number(pct);
    if (!n || n <= 0 || n > 100) { Alert.alert("Erro", "Percentual entre 1 e 100"); return; }
    setSaving(true);
    try {
      await api.adminCreateCoupon({
        code: code.trim().toUpperCase(),
        discount_percent: n,
        active: true,
        first_order_only: firstOnly,
        max_uses: maxUses ? Number(maxUses) : null,
        description: desc,
      });
      setCreating(false);
      setCode(""); setPct("10"); setFirstOnly(false); setMaxUses(""); setDesc("");
      await load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSaving(false); }
  };

  const toggle = async (c: Coupon) => {
    try {
      await api.adminUpdateCoupon(c.code, { active: !c.active });
      await load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
  };

  const del = (c: Coupon) => {
    Alert.alert("Excluir cupom", `Remover ${c.code}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => {
        try { await api.adminDeleteCoupon(c.code); await load(); }
        catch (e: any) { Alert.alert("Erro", e.message); }
      } },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="coupons-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Cupons Promocionais</Text>
        <Pressable testID="new-coupon" onPress={() => setCreating(true)} style={[styles.iconBtn, { backgroundColor: COLORS.brand }]}>
          <Plus color={COLORS.surface} size={18} weight="bold" />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(c) => c.code}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 60 }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: "center", padding: SPACING.xl }}>Nenhum cupom cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowHead}>
              <Ticket color={COLORS.brand} size={22} weight="fill" />
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{item.code}</Text>
                {!!item.description && <Text style={styles.desc}>{item.description}</Text>}
              </View>
              <Text style={styles.pct}>{item.discount_percent}% off</Text>
            </View>
            <View style={styles.tags}>
              {item.first_order_only && <View style={styles.tag}><Text style={styles.tagText}>1ª compra</Text></View>}
              {item.belongs_to && <View style={[styles.tag, { backgroundColor: "#E5F0FF" }]}><Text style={[styles.tagText, { color: "#2A6FB3" }]}>pessoal</Text></View>}
              {item.reason === "loyalty" && <View style={[styles.tag, { backgroundColor: "#FFF3D8" }]}><Text style={[styles.tagText, { color: COLORS.warning }]}>fidelidade</Text></View>}
              {item.max_uses != null && <View style={styles.tag}><Text style={styles.tagText}>{item.uses_count || 0}/{item.max_uses}</Text></View>}
            </View>
            <View style={styles.actions}>
              <View style={styles.toggle}>
                <Text style={styles.toggleLbl}>Ativo</Text>
                <Switch value={!!item.active} onValueChange={() => toggle(item)} />
              </View>
              <Pressable testID={`del-${item.code}`} onPress={() => del(item)} style={styles.delBtn}>
                <Trash color={COLORS.error} size={16} weight="bold" />
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal visible={creating} animationType="slide" transparent onRequestClose={() => setCreating(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreating(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Novo cupom</Text>
              <Pressable onPress={() => setCreating(false)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
              <Field label="Código (ex: BEMVINDO)">
                <TextInput testID="c-code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" style={styles.input} />
              </Field>
              <Field label="Desconto (%)">
                <TextInput testID="c-pct" value={pct} onChangeText={setPct} keyboardType="numeric" style={styles.input} />
              </Field>
              <Field label="Máx. usos (vazio = ilimitado)">
                <TextInput testID="c-max" value={maxUses} onChangeText={setMaxUses} keyboardType="numeric" style={styles.input} />
              </Field>
              <Field label="Descrição (opcional)">
                <TextInput testID="c-desc" value={desc} onChangeText={setDesc} style={styles.input} />
              </Field>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLbl}>Somente 1ª compra</Text>
                <Switch value={firstOnly} onValueChange={setFirstOnly} />
              </View>
              <Pressable testID="c-save" onPress={create} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                <Text style={styles.saveBtnText}>{saving ? "Salvando…" : "Criar cupom"}</Text>
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
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.sm },
  rowHead: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  code: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface, letterSpacing: 0.5 },
  desc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  pct: { fontSize: 16, fontWeight: "800", color: COLORS.brand },
  tags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { backgroundColor: COLORS.surfaceSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  tagText: { fontSize: 10, fontWeight: "800", color: COLORS.onSurface, textTransform: "uppercase" },
  actions: { flexDirection: "row", alignItems: "center", gap: SPACING.md, marginTop: 4 },
  toggle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  toggleLbl: { fontSize: 12, fontWeight: "700", color: COLORS.onSurface },
  delBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FDE5E5", alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.overlay },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, paddingBottom: SPACING.xxl, maxHeight: "90%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
