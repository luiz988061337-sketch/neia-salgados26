import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle, Pencil, Plus, Printer, Trash, X } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";

type Printer_ = {
  id: string; name: string; model: string;
  template_id?: string | null; width_mm: number;
  is_default: boolean; active: boolean;
};
type Template = { id: string; name: string; width_mm: number };

export default function StaffPrinters() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Printer_[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Printer_ | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [width, setWidth] = useState("80");
  const [isDefault, setIsDefault] = useState(false);
  const [active, setActive] = useState(true);

  const load = async () => {
    try {
      setItems(await api.adminPrinters());
      setTemplates(await api.adminPrintTemplates());
    } catch (e: any) { Alert.alert("Erro", e.message); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName(""); setModel(""); setTemplateId(templates[0]?.id ?? null);
    setWidth("80"); setIsDefault(items.length === 0); setActive(true);
    setCreating(true);
  };

  const openEdit = (p: Printer_) => {
    setEditing(p);
    setName(p.name); setModel(p.model || "");
    setTemplateId(p.template_id || null);
    setWidth(String(p.width_mm));
    setIsDefault(!!p.is_default);
    setActive(!!p.active);
    setCreating(true);
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert("Erro", "Nome obrigatório"); return; }
    setSaving(true);
    try {
      const w = Math.max(40, Math.min(120, Number(width) || 80));
      const body = { name: name.trim(), model: model.trim(), template_id: templateId, width_mm: w, is_default: isDefault, active };
      if (editing) await api.adminUpdatePrinter(editing.id, body);
      else await api.adminCreatePrinter(body);
      setCreating(false);
      await load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSaving(false); }
  };

  const remove = (p: Printer_) => {
    Alert.alert("Excluir", `Remover ${p.name}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => {
        try { await api.adminDeletePrinter(p.id); await load(); }
        catch (e: any) { Alert.alert("Erro", e.message); }
      } },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="printers-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Impressoras</Text>
        <Pressable testID="new-printer" onPress={openCreate} style={[styles.iconBtn, { backgroundColor: COLORS.brand }]}>
          <Plus color={COLORS.surface} size={18} weight="bold" />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: "center", padding: SPACING.xl }}>Nenhuma impressora cadastrada.</Text>}
        renderItem={({ item }) => {
          const tpl = templates.find((t) => t.id === item.template_id);
          return (
            <View style={styles.card}>
              <View style={styles.avatar}><Printer color={COLORS.surface} size={22} weight="fill" /></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.is_default && <CheckCircle color={COLORS.success} size={16} weight="fill" />}
                </View>
                {!!item.model && <Text style={styles.desc}>{item.model}</Text>}
                <Text style={styles.desc}>{item.width_mm}mm • Modelo: {tpl?.name || "—"}</Text>
              </View>
              <Pressable testID={`edit-${item.id}`} onPress={() => openEdit(item)} style={styles.iconBtnSm}>
                <Pencil color={COLORS.brand} size={16} weight="bold" />
              </Pressable>
              <Pressable testID={`rm-${item.id}`} onPress={() => remove(item)} style={[styles.iconBtnSm, { backgroundColor: "#FDE5E5" }]}>
                <Trash color={COLORS.error} size={16} weight="bold" />
              </Pressable>
            </View>
          );
        }}
      />

      <Modal visible={creating} animationType="slide" transparent onRequestClose={() => setCreating(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreating(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editing ? "Editar impressora" : "Nova impressora"}</Text>
              <Pressable onPress={() => setCreating(false)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
              <Field label="Apelido (ex: Balcão)">
                <TextInput testID="pr-name" value={name} onChangeText={setName} style={styles.input} />
              </Field>
              <Field label="Modelo (opcional)">
                <TextInput testID="pr-model" value={model} onChangeText={setModel} style={styles.input} placeholder="Ex: Bematech MP-4200" />
              </Field>
              <Field label="Largura do papel">
                <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                  <Pressable testID="pw-58" onPress={() => setWidth("58")} style={[styles.chip, width === "58" && styles.chipActive]}>
                    <Text style={[styles.chipText, width === "58" && styles.chipTextActive]}>58mm</Text>
                  </Pressable>
                  <Pressable testID="pw-80" onPress={() => setWidth("80")} style={[styles.chip, width === "80" && styles.chipActive]}>
                    <Text style={[styles.chipText, width === "80" && styles.chipTextActive]}>80mm</Text>
                  </Pressable>
                </View>
              </Field>
              <Field label="Modelo de impressão">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingVertical: 4 }}>
                  {templates.map((t) => (
                    <Pressable key={t.id} testID={`pr-tpl-${t.id}`} onPress={() => setTemplateId(t.id)} style={[styles.chip, templateId === t.id && styles.chipActive]}>
                      <Text style={[styles.chipText, templateId === t.id && styles.chipTextActive]}>{t.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Field>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLbl}>Impressora padrão</Text>
                <Switch value={isDefault} onValueChange={setIsDefault} />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLbl}>Ativa</Text>
                <Switch value={active} onValueChange={setActive} />
              </View>
              <Pressable testID="pr-save" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
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
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.overlay },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, paddingBottom: SPACING.xxl, maxHeight: "90%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.onSurface },
  chipTextActive: { color: COLORS.surface },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  toggleLbl: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
  saveBtn: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  saveText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
