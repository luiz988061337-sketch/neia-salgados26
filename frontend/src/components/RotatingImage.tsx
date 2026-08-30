import { useEffect, useMemo, useState } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { Image, ImageContentFit } from "expo-image";
import { fileUrl } from "@/src/api";

type Props = {
  urls: string[];
  fallback?: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  intervalMs?: number;
};

export default function RotatingImage({ urls, fallback, style, contentFit = "cover", intervalMs = 2600 }: Props) {
  const list = useMemo(() => (urls && urls.length ? urls : fallback ? [fallback] : []), [urls, fallback]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), intervalMs);
    return () => clearInterval(t);
  }, [list.length, intervalMs]);

  if (!list.length) return null;
  return (
    <Image
      source={{ uri: fileUrl(list[idx]) }}
      style={style as any}
      contentFit={contentFit}
      transition={450}
    />
  );
}
