import { useEffect, useState } from "react";
import { Drawer } from "expo-router/drawer";
import { Redirect } from "expo-router";
import { store } from "@/utils";
import { Platform } from "react-native";

export default function AdminLayout() {
  const [ready, setReady] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await store.get("token");
      const role = await store.get("role");
      setHasToken(!!token);
      setUserRole(role);
      // Allow both admin and teacher roles
      setIsAllowed(!!token && (role === "admin" || role === "teacher"));
      setReady(true);
    })();
  }, []);

  if (!ready) return null;
  if (!hasToken) return <Redirect href="/(auth)" />;
  if (!isAllowed) return <Redirect href={{ pathname: "/not-allowed" } as any} />;

  const isAdmin = userRole === "admin";

  return (
    <Drawer
      screenOptions={{
        headerShown: true,
        drawerType: Platform.OS === "web" ? "permanent" : "front",
        drawerStyle: { width: 260 },
      }}
    >
      {/* Admin-only screens */}
      <Drawer.Screen 
        name="index" 
        options={{ 
          title: "Users",
          drawerItemStyle: isAdmin ? {} : { display: "none" }
        }} 
      />
      <Drawer.Screen 
        name="analytics" 
        options={{ 
          title: "Analytics",
          drawerItemStyle: isAdmin ? {} : { display: "none" }
        }} 
      />
      <Drawer.Screen 
        name="question-db" 
        options={{ 
          title: "Upload Questions",
          drawerItemStyle: isAdmin ? {} : { display: "none" }
        }} 
      />
      <Drawer.Screen 
        name="browse-questions" 
        options={{ 
          title: "Browse Questions",
        }} 
      />
      
      {/* Available to both admin and teacher */}
      <Drawer.Screen name="paper-generator" options={{ title: "Paper Generator" }} />
      <Drawer.Screen name="paper-history" options={{ title: "Paper History" }} />
      <Drawer.Screen name="test-sessions" options={{ title: "Test Sessions" }} />
      <Drawer.Screen name="classrooms" options={{ title: "Classrooms" }} />
      
      {/* Hidden screens (accessed via navigation) */}
      <Drawer.Screen
        name="paper-editor"
        options={{ title: "Paper Editor", drawerItemStyle: { display: "none" } }}
      />
      <Drawer.Screen
        name="question-editor"
        options={{ title: "Question Editor", drawerItemStyle: { display: "none" } }}
      />
      <Drawer.Screen
        name="classroom-details"
        options={{ title: "Classroom Details", drawerItemStyle: { display: "none" } }}
      />
      <Drawer.Screen
        name="test-results"
        options={{ title: "Test Results", drawerItemStyle: { display: "none" } }}
      />
    </Drawer>
  );
}


