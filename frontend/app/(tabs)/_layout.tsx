import { Tabs } from "expo-router";
import { House, ForkKnife, Receipt, User } from "phosphor-react-native";
import { COLORS } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Início",
          tabBarIcon: ({ color, size }) => <House color={color} size={size} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Cardápio",
          tabBarIcon: ({ color, size }) => <ForkKnife color={color} size={size} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Pedidos",
          tabBarIcon: ({ color, size }) => <Receipt color={color} size={size} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} weight="fill" />,
        }}
      />
    </Tabs>
  );
}
