export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function computeFee(distanceKm: number | null, s: { base_delivery_fee: number; per_km_fee: number; min_delivery_fee: number }): number {
  if (distanceKm == null) return s.min_delivery_fee;
  const extra = Math.max(0, distanceKm - 3);
  return Math.max(s.base_delivery_fee + extra * s.per_km_fee, s.min_delivery_fee);
}
