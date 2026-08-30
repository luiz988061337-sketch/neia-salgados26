import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { COLORS } from "@/src/theme";

export default function MotoboyMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  return (
    <View>
      <MapView
        style={styles.map}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        region={{ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      >
        <Marker
          coordinate={{ latitude: lat, longitude: lng }}
          title={name}
          description="Motoboy"
          pinColor={COLORS.brand}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: 260 },
});
