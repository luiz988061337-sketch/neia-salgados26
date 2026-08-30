import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, MapPressEvent } from "react-native-maps";
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

export default function LocationPicker({ lat, lng, onChange, storeLat, storeLng }: Props) {
  const [locating, setLocating] = useState(false);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      onChange(pos.coords.latitude, pos.coords.longitude);
    } finally { setLocating(false); }
  };

  const region = {
    latitude: lat ?? storeLat,
    longitude: lng ?? storeLng,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  };

  return (
    <View>
      <MapView
        style={styles.map}
        region={region}
        onPress={(e: MapPressEvent) => onChange(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      >
        <Marker coordinate={{ latitude: storeLat, longitude: storeLng }} title="Néia Salgados" pinColor="#B0B0B0" />
        {lat !== null && lng !== null && (
          <Marker
            draggable
            coordinate={{ latitude: lat, longitude: lng }}
            title="Entrega"
            pinColor={COLORS.brand}
            onDragEnd={(e) => onChange(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
          />
        )}
      </MapView>
      <Pressable testID="use-my-location" onPress={useMyLocation} style={styles.gpsBtn}>
        <Crosshair color={COLORS.surface} size={16} weight="bold" />
        <Text style={styles.gpsText}>{locating ? "Localizando…" : "Usar minha localização"}</Text>
      </Pressable>
      <View style={styles.hint}>
        <MapPin color={COLORS.muted} size={14} />
        <Text style={styles.hintText}>Toque no mapa ou arraste o pino para ajustar</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: 220, borderRadius: RADIUS.md, overflow: "hidden" },
  gpsBtn: {
    position: "absolute", top: SPACING.sm, right: SPACING.sm,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.brand, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill,
  },
  gpsText: { color: COLORS.surface, fontWeight: "800", fontSize: 12 },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  hintText: { fontSize: 11, color: COLORS.muted },
});
