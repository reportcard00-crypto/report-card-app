import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { store } from "@/utils";
import { useRouter } from "expo-router";

export default function NotAllowed() {
  const [role, setRole] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => setRole(await store.get("role")))();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Access restricted</Text>
        <Text style={styles.subtitle}>
          Your account role{role ? ` (${role})` : ""} does not have access to the admin panel.
        </Text>
        <Text style={styles.info}>You are still signed in. You can switch to an admin account to continue.</Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => router.replace("/(auth)")}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, styles.secondaryText]}>Go to Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={async () => {
              await store.delete("token");
              await store.delete("role");
              router.replace("/(auth)");
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  card: { width: "100%", backgroundColor: "#ffffff", borderRadius: 16, padding: 20, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 8, fontSize: 14, color: "#6b7280" },
  info: { marginTop: 16, fontSize: 13, color: "#6b7280" },
  row: { marginTop: 20, flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  button: { height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  secondary: { backgroundColor: "#e5e7eb" },
  secondaryText: { color: "#111827" },
});


