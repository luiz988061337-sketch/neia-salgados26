import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Pencil, Plus, Printer, Trash, X } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Template = {
  id: string; name: string; width_mm: number;
  header: string; body_template: string; footer: string; active: boolean;
};

const HELP = `Placeholders disponíveis (envolva em {}):
{short_code}   {created_at}
{customer_name} {customer_phone} {customer_address}
{items}   {subtotal} {delivery_fee}
{discount} {total} {payment_method}`;

export default function StaffPrintTemplates() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("80");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [active, setActive] = useState(true);

  const load = async () => {
    try { setItems(await api.adminPrintTemplates()); } catch (e: any) { Alert.alert("Erro", e.message); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName("Novo modelo"); setWidth("80");
    setHeader("*** NÉIA SALGADOS ***\n\n");
    setBody("PEDIDO #{short_code}\nCliente: {customer_name}\n{items}\nTOTAL: R$ {total}\n");
    setFooter("\nObrigado pela preferência!\n");
    setActive(true);
    setCreating(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setName(t.name); setWidth(String(t.width_mm));
    setHeader(t.header); setBody(t.body_template); setFooter(t.footer);
    setActive(!!t.active);
    setCreating(true);
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert("Erro", "Informe o nome do modelo"); return; }
    setSaving(true);
    try {
      const w = Math.max(40, Math.min(120, Number(width) || 80));
      const body_ = { name: name.trim(), width_mm: w, header, body_template: body, footer, active };
      if (editing) await api.adminUpdatePrintTemplate(editing.id, body_);
      else await api.adminCreatePrintTemplate(body_);
      setCreating(false);
      await load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSaving(false); }
  };

  const remove = (t: Template) => {
    Alert.alert("Excluir modelo", `Remover "${t.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => {
        try { await api.adminDeletePrintTemplate(t.id); await load(); }
        catch (e: any) { Alert.alert("Erro", e.message); }
      } },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="tpl-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Modelos de Impressão</Text>
        <Pressable testID="new-tpl" onPress={openCreate} style={[styles.iconBtn, { backgroundColor: COLORS.brand }]}>
          <Plus color={COLORS.surface} size={18} weight="bold" />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: "center", padding: SPACING.xl }}>Nenhum modelo cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.avatar}><Printer color={COLORS.surface} size={22} weight="fill" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc}>Largura: {item.width_mm}mm • {item.active ? "Ativo" : "Inativo"}</Text>
              <Text style={styles.preview} numberOfLines={2}>{item.header + item.body_template}</Text>
            </View>
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
              <Text style={styles.sheetTitle}>{editing ? "Editar modelo" : "Novo modelo"}</Text>
              <Pressable onPress={() => setCreating(false)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
              <Field label="Nome do modelo">
                <TextInput testID="t-name" value={name} onChangeText={setName} style={styles.input} />
              </Field>
              <Field label="Largura (mm) — 58 ou 80">
                <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                  <Pressable testID="w-58" onPress={() => setWidth("58")} style={[styles.chip, width === "58" && styles.chipActive]}>
                    <Text style={[styles.chipText, width === "58" && styles.chipTextActive]}>58mm</Text>
                  </Pressable>
                  <Pressable testID="w-80" onPress={() => setWidth("80")} style={[styles.chip, width === "80" && styles.chipActive]}>
                    <Text style={[styles.chipText, width === "80" && styles.chipTextActive]}>80mm</Text>
                  </Pressable>
                </View>
              </Field>
              <View style={styles.helpBox}>
                <Text style={styles.helpText}>{HELP}</Text>
              </View>
              <Field label="Cabeçalho">
                <TextInput testID="t-header" value={header} onChangeText={setHeader} multiline style={[styles.input, { minHeight: 60 }]} />
              </Field>
              <Field label="Corpo (com placeholders)">
                <TextInput testID="t-body" value={body} onChangeText={setBody} multiline style={[styles.input, { minHeight: 140 }]} />
              </Field>
              <Field label="Rodapé">
                <TextInput testID="t-footer" value={footer} onChangeText={setFooter} multiline style={[styles.input, { minHeight: 60 }]} />
              </Field>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLbl}>Ativo</Text>
                <Switch value={active} onValueChange={setActive} />
              </View>
              <Pressable testID="t-save" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                <Text style={styles.saveText}>{saving ? "Salvando…" : "Salvar"}</Text>
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
  desc: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  preview: { fontSize: 10, color: COLORS.muted, marginTop: 4, fontFamily: "monospace" as any },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.overlay },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, paddingBottom: SPACING.xxl, maxHeight: "92%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 13, color: COLORS.onSurface, fontFamily: "monospace" as any },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.onSurface },
  chipTextActive: { color: COLORS.surface },
  helpBox: { padding: SPACING.md, backgroundColor: "#FFF8E7", borderWidth: 1, borderColor: COLORS.warning, borderRadius: RADIUS.md },
  helpText: { fontSize: 11, color: COLORS.onSurface, fontFamily: "monospace" as any, lineHeight: 16 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  toggleLbl: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
