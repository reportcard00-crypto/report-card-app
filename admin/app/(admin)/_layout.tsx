import { useEffect, useState } from "react";
import { Drawer } from "expo-router/drawer";
import { Redirect } from "expo-router";
import { store } from "@/utils";
import { Platform } from "react-native";

export default function AdminLayout() {
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await store.get("token");
      const role = await store.get("role");
      setHasToken(!!token);
      setIsAdmin(!!token && role === "admin");
      setReady(true);
    })();
  }, []);

  if (!ready) return null;
  if (!hasToken) return <Redirect href="/(auth)" />;
  if (!isAdmin) return <Redirect href={{ pathname: "/not-allowed" } as any} />;

  return (
    <Drawer
      screenOptions={{
        headerShown: true,
        drawerType: Platform.OS === "web" ? "permanent" : "front",
        drawerStyle: { width: 260 },
      }}
    >
      <Drawer.Screen name="index" options={{ title: "Users" }} />
      <Drawer.Screen name="analytics" options={{ title: "Analytics" }} />
      <Drawer.Screen name="question-db" options={{ title: "Question DB" }} />
      <Drawer.Screen name="paper-generator" options={{ title: "Paper Generator" }} />
      <Drawer.Screen
        name="question-editor"
        options={{ title: "Question Editor", drawerItemStyle: { display: "none" } }}
      />
    </Drawer>
  );
}


