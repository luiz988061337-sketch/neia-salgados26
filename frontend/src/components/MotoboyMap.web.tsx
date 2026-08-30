import { StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

export default function MotoboyMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.title}>🛵 {name}</Text>
      <Text style={styles.sub}>Localização atual: {lat.toFixed(4)}, {lng.toFixed(4)}</Text>
      <Text style={styles.hint}>Abra pelo Expo Go para ver o mapa</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { padding: SPACING.xl, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md, marginHorizontal: SPACING.lg, alignItems: "center", gap: 6 },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.onBrandTertiary },
  sub: { fontSize: 12, color: COLORS.onBrandTertiary },
  hint: { fontSize: 11, color: COLORS.onBrandTertiary, marginTop: 6, opacity: 0.7 },
});
