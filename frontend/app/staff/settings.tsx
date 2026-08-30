import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CaretRight, Crown, ForkKnife, Gift, MapPin, Ranking, Sparkle, Storefront } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";

export default function StaffSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="settings-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Configurações</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
        <Row
          testID="go-store"
          icon={<Storefront color={COLORS.brand} size={22} weight="fill" />}
          title="Loja & Taxa por km"
          subtitle="Localização da loja, taxa base e por km, aviso automático"
          onPress={() => router.push("/staff/store")}
        />
        <Row
          testID="go-ranking"
          icon={<Ranking color={COLORS.brand} size={22} weight="fill" />}
          title="Ranking de Motoboys"
          subtitle="Quem entregou mais rápido hoje"
          onPress={() => router.push("/staff/ranking")}
        />
        <Row
          testID="go-vip"
          icon={<Crown color={COLORS.brand} size={22} weight="fill" />}
          title="Clientes VIP"
          subtitle="Ranking por consumo — quem merece mimos"
          onPress={() => router.push("/staff/vip")}
        />
        <Row
          testID="go-birthdays"
          icon={<Gift color={COLORS.brand} size={22} weight="fill" />}
          title="Aniversariantes de Hoje"
          subtitle="Enviar cupons de aniversário via WhatsApp"
          onPress={() => router.push("/staff/birthdays")}
        />
        <Row
          testID="go-products"
          icon={<ForkKnife color={COLORS.brand} size={22} weight="fill" />}
          title="Cardápio & Fotos"
          subtitle="Editar produtos, subir fotos reais dos salgados"
          onPress={() => router.push("/staff/products")}
        />
        <Row
          testID="go-neighborhoods"
          icon={<MapPin color={COLORS.brand} size={22} weight="fill" />}
          title="Bairros (legado)"
          subtitle="Cadastro antigo por bairro — sobrepõe a taxa por km quando definido"
          onPress={() => router.push("/staff/neighborhoods")}
        />
        <Row
          testID="go-themes"
          icon={<Sparkle color={COLORS.brand} size={22} weight="fill" />}
          title="Cardápio de Feriado"
          subtitle="Ative combos temáticos (Copa, Festa Junina...)"
          onPress={() => router.push("/staff/themes")}
        />
      </ScrollView>
    </View>
  );
}

const Row = ({ testID, icon, title, subtitle, onPress }: any) => (
  <Pressable testID={testID} onPress={onPress} style={styles.card}>
    <View style={styles.iconWrap}>{icon}</View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSub}>{subtitle}</Text>
    </View>
    <CaretRight color={COLORS.muted} size={18} />
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brandTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface },
  cardSub: { fontSize: 12, color: COLORS.muted },
});
