import { useEffect, useState, useCallback } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { 
  listClassrooms, 
  createClassroom,
  deleteClassroom,
  type ClassroomListItem,
} from "@/api/admin";

export default function ClassroomsScreen() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<ClassroomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassDescription, setNewClassDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchClassrooms = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const resp = await listClassrooms({
        page,
        limit: 20,
        search: search.trim() || undefined,
      });
      setClassrooms(resp.data);
      setTotalPages(resp.meta.totalPages);
      setTotal(resp.meta.total);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || e?.message || "Failed to load classrooms");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchClassrooms();
  }, [fetchClassrooms]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchClassrooms(false);
    }, [fetchClassrooms])
  );

  const handleDelete = (classroom: ClassroomListItem) => {
    Alert.alert(
      "Delete Classroom",
      `Are you sure you want to delete "${classroom.name}"? This will remove all students from the classroom. This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteClassroom(classroom._id);
              Alert.alert("Deleted", "Classroom has been deleted.");
              fetchClassrooms(false);
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.message || "Failed to delete");
            }
          },
        },
      ]
    );
  };

  const handleCreate = async () => {
    if (!newClassName.trim()) {
      Alert.alert("Error", "Please enter a classroom name");
      return;
    }
    
    try {
      setIsCreating(true);
      const resp = await createClassroom({
        name: newClassName.trim(),
        description: newClassDescription.trim() || undefined,
      });
      
      setShowCreateModal(false);
      setNewClassName("");
      setNewClassDescription("");
      
      Alert.alert(
        "Classroom Created!",
        `"${resp.data.name}" has been created.`,
        [
          { text: "View Details", onPress: () => router.push(`/classroom-details?id=${resp.data._id}` as any) },
          { text: "OK", onPress: () => fetchClassrooms(false) },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to create classroom");
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewDetails = (classroom: ClassroomListItem) => {
    router.push(`/classroom-details?id=${classroom._id}` as any);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Classrooms</Text>
        <Pressable onPress={() => setShowCreateModal(true)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>+ New Classroom</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.filterSection}>
        <TextInput
          placeholder="Search by name..."
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
          style={[styles.input, { flex: 1 }]}
          returnKeyType="search"
        />
        <Pressable onPress={() => { setRefreshing(true); fetchClassrooms(false); }} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>{refreshing ? "..." : "↻"}</Text>
        </Pressable>
      </View>

      {/* Results Info */}
      <Text style={styles.resultsInfo}>
        {total} classroom{total !== 1 ? "s" : ""} found
        {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
      </Text>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e3a5f" />
          <Text style={styles.loadingText}>Loading classrooms...</Text>
        </View>
      )}

      {/* Empty State */}
      {!loading && classrooms.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No classrooms found</Text>
          <Text style={styles.emptySubtitle}>
            {search
              ? "Try adjusting your search"
              : "Create your first classroom to get started"}
          </Text>
          {!search && (
            <Pressable onPress={() => setShowCreateModal(true)} style={[styles.primaryBtn, { marginTop: 16 }]}>
              <Text style={styles.primaryBtnText}>Create Classroom</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Classrooms List */}
      {!loading && classrooms.length > 0 && (
        <View style={styles.classroomsGrid}>
          {classrooms.map((classroom) => (
            <View key={classroom._id} style={styles.classroomCard}>
              <View style={styles.classroomHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.classroomName} numberOfLines={1}>{classroom.name}</Text>
                  {classroom.description && (
                    <Text style={styles.classroomDesc} numberOfLines={2}>{classroom.description}</Text>
                  )}
                </View>
                <View style={styles.studentsBadge}>
                  <Text style={styles.studentsBadgeText}>{classroom.studentsCount}</Text>
                  <Text style={styles.studentsBadgeLabel}>students</Text>
                </View>
              </View>

              <Text style={styles.classroomDate}>Created: {formatDate(classroom.createdAt)}</Text>

              <View style={styles.classroomActions}>
                <Pressable onPress={() => handleViewDetails(classroom)} style={[styles.actionBtn, styles.viewBtn]}>
                  <Text style={styles.actionBtnText}>View / Manage</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(classroom)} style={[styles.actionBtn, styles.deleteBtn]}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <View style={styles.pagination}>
          <Pressable
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
          >
            <Text style={[styles.pageBtnText, page <= 1 && styles.pageBtnTextDisabled]}>← Prev</Text>
          </Pressable>
          <Text style={styles.pageInfo}>Page {page} of {totalPages}</Text>
          <Pressable
            disabled={page >= totalPages}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
          >
            <Text style={[styles.pageBtnText, page >= totalPages && styles.pageBtnTextDisabled]}>Next →</Text>
          </Pressable>
        </View>
      )}

      {/* Create Classroom Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Classroom</Text>
            
            <Text style={styles.inputLabel}>Classroom Name *</Text>
            <TextInput
              placeholder="e.g., Physics Class 12-A"
              value={newClassName}
              onChangeText={setNewClassName}
              style={styles.modalInput}
              autoFocus
            />
            
            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              placeholder="Brief description of the classroom..."
              value={newClassDescription}
              onChangeText={setNewClassDescription}
              style={[styles.modalInput, { height: 80, textAlignVertical: "top" }]}
              multiline
            />
            
            <View style={styles.modalActions}>
              <Pressable 
                onPress={() => { setShowCreateModal(false); setNewClassName(""); setNewClassDescription(""); }} 
                style={[styles.modalBtn, styles.modalCancelBtn]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleCreate} 
                disabled={isCreating}
                style={[styles.modalBtn, styles.modalCreateBtn, isCreating && { opacity: 0.7 }]}
              >
                <Text style={styles.modalCreateBtnText}>{isCreating ? "Creating..." : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#1e3a5f" },
  primaryBtn: { backgroundColor: "#1e3a5f", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  filterSection: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingHorizontal: 12, height: 42, backgroundColor: "#fff" },
  refreshBtn: { width: 42, height: 42, borderRadius: 8, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d1d5db" },
  refreshBtnText: { fontSize: 18, color: "#374151" },
  resultsInfo: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  loadingContainer: { alignItems: "center", paddingVertical: 60 },
  loadingText: { marginTop: 12, color: "#6b7280" },
  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  classroomsGrid: { gap: 16 },
  classroomCard: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 16, 
    borderWidth: 1, 
    borderColor: "#e5e7eb", 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 2, 
    elevation: 1 
  },
  classroomHeader: { flexDirection: "row", gap: 12, marginBottom: 8 },
  classroomName: { fontSize: 18, fontWeight: "600", color: "#1e3a5f", marginBottom: 4 },
  classroomDesc: { fontSize: 13, color: "#6b7280" },
  studentsBadge: { 
    backgroundColor: "#e0f2fe", 
    borderRadius: 10, 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#7dd3fc",
  },
  studentsBadgeText: { fontSize: 20, fontWeight: "700", color: "#0369a1" },
  studentsBadgeLabel: { fontSize: 10, color: "#0369a1", textTransform: "uppercase" },
  classroomDate: { fontSize: 12, color: "#9ca3af", marginBottom: 12 },
  classroomActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center" },
  viewBtn: { backgroundColor: "#1e3a5f" },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  deleteBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  deleteBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  pagination: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 24 },
  pageBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  pageBtnDisabled: { opacity: 0.5 },
  pageBtnText: { color: "#374151", fontWeight: "500" },
  pageBtnTextDisabled: { color: "#9ca3af" },
  pageInfo: { fontSize: 14, color: "#6b7280" },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 450,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#1e3a5f", marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  modalInput: { 
    borderWidth: 1, 
    borderColor: "#d1d5db", 
    borderRadius: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: "#f9fafb",
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalCancelBtn: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#d1d5db" },
  modalCancelBtnText: { color: "#374151", fontWeight: "600" },
  modalCreateBtn: { backgroundColor: "#1e3a5f" },
  modalCreateBtnText: { color: "#fff", fontWeight: "600" },
});

