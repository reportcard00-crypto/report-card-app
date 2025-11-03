import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { listUsers, updateUserRole, type AdminUser } from "@/api/admin";

const ROLES: ("user" | "teacher" | "admin")[] = ["user", "teacher", "admin"];

export default function UsersScreen() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const resp = await listUsers({ search: search.trim() || undefined, role: roleFilter });
      setUsers(resp.data);
    } catch {
      // errors are logged by api client
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, refreshIndex]);

  const onSearch = () => {
    setRefreshIndex((i) => i + 1);
  };

  const roleChips = useMemo(
    () =>
      ROLES.map((r) => (
        <Pressable key={r} onPress={() => setRoleFilter(roleFilter === r ? undefined : r)} style={[styles.chip, roleFilter === r && styles.chipActive]}>
          <Text style={[styles.chipText, roleFilter === r && styles.chipTextActive]}>{r}</Text>
        </Pressable>
      )),
    [roleFilter]
  );

  const renderItem = ({ item }: { item: AdminUser }) => {
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name || "(no name)"}</Text>
          <Text style={styles.sub}>{item.phone}</Text>
        </View>
        <View style={styles.roleContainer}>
          {ROLES.map((r) => (
            <Pressable
              key={r}
              onPress={async () => {
                if (item.role === r) return;
                try {
                  await updateUserRole(item._id, r);
                  setUsers((prev) => prev.map((u) => (u._id === item._id ? { ...u, role: r } : u)));
                } catch {}
              }}
              style={[styles.roleChip, item.role === r && styles.roleChipActive]}
            >
              <Text style={[styles.roleText, item.role === r && styles.roleTextActive]}>{r}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Management</Text>
      <View style={styles.controls}>
        <TextInput
          placeholder="Search by name or phone"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSearch}
          style={styles.input}
          returnKeyType="search"
        />
        <Pressable onPress={onSearch} style={styles.searchBtn}>
          <Text style={styles.searchBtnText}>Search</Text>
        </Pressable>
      </View>
      <View style={styles.roleFilters}>{roleChips}</View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u._id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 12 },
  controls: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 12, height: 40 },
  searchBtn: { backgroundColor: "#111827", paddingHorizontal: 14, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  searchBtnText: { color: "#fff", fontWeight: "600" },
  roleFilters: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 8, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#ddd", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { color: "#111827" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  sep: { height: 1, backgroundColor: "#eee" },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { color: "#6b7280", marginTop: 2 },
  roleContainer: { flexDirection: "row", gap: 6 },
  roleChip: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 },
  roleChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  roleText: { color: "#111827" },
  roleTextActive: { color: "#fff", fontWeight: "600" },
});



