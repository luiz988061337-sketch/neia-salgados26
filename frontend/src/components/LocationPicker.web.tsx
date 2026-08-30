import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { Crosshair, MapPin } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Props = {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  storeLat: number;
  storeLng: number;
};

export default function LocationPicker({ lat, lng, onChange }: Props) {
  const [locating, setLocating] = useState(false);
  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      onChange(pos.coords.latitude, pos.coords.longitude);
    } finally { setLocating(false); }
  };
  return (
    <View style={styles.card}>
      <MapPin color={COLORS.brand} size={26} weight="fill" />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{lat && lng ? "Localização definida" : "Toque para definir sua localização"}</Text>
        {lat && lng ? (
          <Text style={styles.sub}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
        ) : (
          <Text style={styles.sub}>Abra pelo Expo Go para usar o mapa</Text>
        )}
      </View>
      <Pressable onPress={useMyLocation} style={styles.gpsBtn}>
        <Crosshair color={COLORS.surface} size={14} weight="bold" />
        <Text style={styles.gpsText}>{locating ? "…" : "GPS"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md },
  title: { fontSize: 14, fontWeight: "800", color: COLORS.onBrandTertiary },
  sub: { fontSize: 12, color: COLORS.onBrandTertiary, marginTop: 2 },
  gpsBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.brand, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill },
  gpsText: { color: COLORS.surface, fontWeight: "800", fontSize: 12 },
});
