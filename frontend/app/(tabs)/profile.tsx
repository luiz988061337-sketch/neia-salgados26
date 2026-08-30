import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretRight, Lock, MapPin, Motorcycle, Phone, ShieldCheck, Storefront } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Perfil</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 }}>
        <View style={styles.brandCard}>
          <Storefront color={COLORS.brand} size={28} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>Néia Salgados</Text>
            <Text style={styles.brandSub}>Salgados fritos e congelados de qualidade</Text>
          </View>
        </View>

        <Text style={styles.section}>Contato</Text>
        <View style={styles.card}>
          <Row icon={<Phone color={COLORS.brand} size={20} weight="regular" />} label="Falar no WhatsApp" />
          <Divider />
          <Row icon={<MapPin color={COLORS.brand} size={20} weight="regular" />} label="Onde estamos" />
        </View>

        <Text style={styles.section}>Área da Equipe</Text>
        <View style={styles.card}>
          <Pressable
            testID="staff-motoboy-btn"
            onPress={() => router.push({ pathname: "/staff/login", params: { role: "motoboy" } })}
            style={styles.rowP}
          >
            <Motorcycle color={COLORS.brand} size={20} weight="regular" />
            <Text style={styles.rowLabel}>Sou Moto Boy</Text>
            <CaretRight color={COLORS.muted} size={16} />
          </Pressable>
          <Divider />
          <Pressable
            testID="staff-admin-btn"
            onPress={() => router.push({ pathname: "/staff/login", params: { role: "admin" } })}
            style={styles.rowP}
          >
            <ShieldCheck color={COLORS.brand} size={20} weight="regular" />
            <Text style={styles.rowLabel}>Sou Administrador</Text>
            <CaretRight color={COLORS.muted} size={16} />
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Lock color={COLORS.muted} size={14} />
          <Text style={styles.footerText}>Sem cadastro • Sem senha para clientes</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const Row = ({ icon, label }: any) => (
  <View style={styles.rowP}>
    {icon}<Text style={styles.rowLabel}>{label}</Text><CaretRight color={COLORS.muted} size={16} />
  </View>
);
const Divider = () => <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md }} />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.onSurface },
  brandCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md,
    padding: SPACING.lg, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md,
  },
  brandName: { fontSize: 18, fontWeight: "800", color: COLORS.onBrandTertiary },
  brandSub: { fontSize: 12, color: COLORS.onBrandTertiary, marginTop: 2 },
  section: { fontSize: 12, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", marginTop: SPACING.md, letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  rowP: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.onSurface },
  footer: { marginTop: SPACING.xl, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  footerText: { color: COLORS.muted, fontSize: 12 },
});
