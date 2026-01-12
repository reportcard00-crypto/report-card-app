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
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { 
  getClassroom,
  updateClassroom,
  searchUsersForClassroom,
  addStudentToClassroom,
  removeStudentFromClassroom,
  type Classroom,
  type ClassroomStudent,
} from "@/api/admin";

export default function ClassroomDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Add student modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ _id: string; name?: string; phone: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [directPhone, setDirectPhone] = useState("");

  const fetchClassroom = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const resp = await getClassroom(id);
      setClassroom(resp.data);
      setEditName(resp.data.name);
      setEditDescription(resp.data.description || "");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || e?.message || "Failed to load classroom");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClassroom();
  }, [fetchClassroom]);

  useFocusEffect(
    useCallback(() => {
      if (id) fetchClassroom();
    }, [id])
  );

  const handleSave = async () => {
    if (!classroom || !editName.trim()) {
      Alert.alert("Error", "Classroom name is required");
      return;
    }
    
    try {
      setIsSaving(true);
      await updateClassroom(classroom._id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setClassroom({ ...classroom, name: editName.trim(), description: editDescription.trim() });
      setIsEditing(false);
      Alert.alert("Saved", "Classroom updated successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to update classroom");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      Alert.alert("Error", "Please enter at least 2 characters to search");
      return;
    }
    
    try {
      setIsSearching(true);
      const resp = await searchUsersForClassroom(query);
      // Filter out students already in the classroom
      const existingIds = new Set(classroom?.students.map(s => s._id) || []);
      const filtered = resp.data.filter(u => !existingIds.has(u._id));
      setSearchResults(filtered);
      
      if (filtered.length === 0 && resp.data.length > 0) {
        Alert.alert("Info", "All matching users are already in this classroom");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to search users");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddStudent = async (userId: string) => {
    if (!classroom) return;
    
    try {
      setIsAdding(true);
      const resp = await addStudentToClassroom(classroom._id, { userId });
      
      // Update local state
      setClassroom({
        ...classroom,
        students: [...classroom.students, resp.data as ClassroomStudent],
      });
      
      // Remove from search results
      setSearchResults(prev => prev.filter(u => u._id !== userId));
      
      Alert.alert("Success", `${resp.data.name || resp.data.phone} has been added to the classroom`);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to add student");
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddByPhone = async () => {
    const phone = directPhone.trim();
    if (!phone) {
      Alert.alert("Error", "Please enter a phone number");
      return;
    }
    if (!classroom) return;
    
    try {
      setIsAdding(true);
      const resp = await addStudentToClassroom(classroom._id, { phone });
      
      // Update local state
      setClassroom({
        ...classroom,
        students: [...classroom.students, resp.data as ClassroomStudent],
      });
      
      setDirectPhone("");
      setShowAddModal(false);
      setSearchQuery("");
      setSearchResults([]);
      
      Alert.alert("Success", `${resp.data.name || resp.data.phone} has been added to the classroom`);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to add student");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveStudent = (student: ClassroomStudent) => {
    if (!classroom) return;
    
    Alert.alert(
      "Remove Student",
      `Are you sure you want to remove ${student.name || student.phone} from this classroom?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeStudentFromClassroom(classroom._id, student._id);
              setClassroom({
                ...classroom,
                students: classroom.students.filter(s => s._id !== student._id),
              });
              Alert.alert("Removed", "Student has been removed from the classroom");
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.message || "Failed to remove student");
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a5f" />
        <Text style={styles.loadingText}>Loading classroom...</Text>
      </View>
    );
  }

  if (!classroom) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Classroom not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header with Edit Toggle */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back to Classrooms</Text>
        </Pressable>
        {!isEditing ? (
          <Pressable onPress={() => setIsEditing(true)} style={styles.editBtn}>
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => { setIsEditing(false); setEditName(classroom.name); setEditDescription(classroom.description || ""); }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={isSaving} style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}>
              <Text style={styles.saveBtnText}>{isSaving ? "Saving..." : "Save"}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Classroom Info Card */}
      <View style={styles.infoCard}>
        {isEditing ? (
          <>
            <Text style={styles.inputLabel}>Classroom Name</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={styles.input}
              placeholder="Classroom name"
            />
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              value={editDescription}
              onChangeText={setEditDescription}
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              placeholder="Description (optional)"
              multiline
            />
          </>
        ) : (
          <>
            <Text style={styles.classroomName}>{classroom.name}</Text>
            {classroom.description && (
              <Text style={styles.classroomDesc}>{classroom.description}</Text>
            )}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{classroom.students.length}</Text>
                <Text style={styles.statLabel}>Students</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatDate(classroom.createdAt)}</Text>
                <Text style={styles.statLabel}>Created</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Students Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Students ({classroom.students.length})</Text>
          <Pressable onPress={() => setShowAddModal(true)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add Student</Text>
          </Pressable>
        </View>

        {classroom.students.length === 0 ? (
          <View style={styles.noStudents}>
            <Text style={styles.noStudentsText}>No students in this classroom yet</Text>
            <Text style={styles.noStudentsHint}>Add students using their name or phone number</Text>
          </View>
        ) : (
          <View style={styles.studentsList}>
            {classroom.students.map((student, index) => (
              <View key={student._id} style={styles.studentCard}>
                <View style={styles.studentInfo}>
                  <View style={styles.studentAvatar}>
                    <Text style={styles.studentAvatarText}>
                      {(student.name || student.phone || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.studentName}>{student.name || "No Name"}</Text>
                    <Text style={styles.studentPhone}>{student.phone}</Text>
                  </View>
                </View>
                <Pressable onPress={() => handleRemoveStudent(student)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Add Student Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Student</Text>
            
            {/* Search Section */}
            <Text style={styles.inputLabel}>Search by name or phone</Text>
            <View style={styles.searchRow}>
              <TextInput
                placeholder="Enter name or phone number..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.input, { flex: 1 }]}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <Pressable onPress={handleSearch} disabled={isSearching} style={styles.searchBtn}>
                <Text style={styles.searchBtnText}>{isSearching ? "..." : "Search"}</Text>
              </Pressable>
            </View>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                <Text style={styles.searchResultsLabel}>Search Results ({searchResults.length})</Text>
                <ScrollView style={{ maxHeight: 200 }}>
                  {searchResults.map((user) => (
                    <View key={user._id} style={styles.searchResultItem}>
                      <View>
                        <Text style={styles.searchResultName}>{user.name || "No Name"}</Text>
                        <Text style={styles.searchResultPhone}>{user.phone}</Text>
                      </View>
                      <Pressable 
                        onPress={() => handleAddStudent(user._id)} 
                        disabled={isAdding}
                        style={styles.addResultBtn}
                      >
                        <Text style={styles.addResultBtnText}>Add</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Direct Phone Entry */}
            <Text style={styles.inputLabel}>Add by phone number directly</Text>
            <View style={styles.searchRow}>
              <TextInput
                placeholder="Enter exact phone number..."
                value={directPhone}
                onChangeText={setDirectPhone}
                style={[styles.input, { flex: 1 }]}
                keyboardType="phone-pad"
              />
              <Pressable 
                onPress={handleAddByPhone} 
                disabled={isAdding || !directPhone.trim()}
                style={[styles.searchBtn, { backgroundColor: "#059669" }]}
              >
                <Text style={styles.searchBtnText}>{isAdding ? "..." : "Add"}</Text>
              </Pressable>
            </View>
            
            <Pressable 
              onPress={() => { setShowAddModal(false); setSearchQuery(""); setSearchResults([]); setDirectPhone(""); }} 
              style={styles.closeModalBtn}
            >
              <Text style={styles.closeModalBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  loadingText: { marginTop: 12, color: "#6b7280" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginBottom: 16 },
  backBtn: { backgroundColor: "#1e3a5f", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: "#fff", fontWeight: "600" },
  
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  backLink: {},
  backLinkText: { color: "#1e3a5f", fontWeight: "500" },
  editBtn: { backgroundColor: "#f3f4f6", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: "#d1d5db" },
  editBtnText: { color: "#374151", fontWeight: "500" },
  cancelBtn: { backgroundColor: "#f3f4f6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: "#d1d5db" },
  cancelBtnText: { color: "#374151", fontWeight: "500" },
  saveBtn: { backgroundColor: "#1e3a5f", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  saveBtnText: { color: "#fff", fontWeight: "600" },
  
  infoCard: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 20, 
    marginBottom: 24, 
    borderWidth: 1, 
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  classroomName: { fontSize: 24, fontWeight: "700", color: "#1e3a5f", marginBottom: 8 },
  classroomDesc: { fontSize: 15, color: "#6b7280", marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 8 },
  statItem: {},
  statValue: { fontSize: 20, fontWeight: "700", color: "#1e3a5f" },
  statLabel: { fontSize: 12, color: "#9ca3af", textTransform: "uppercase" },
  
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: { 
    borderWidth: 1, 
    borderColor: "#d1d5db", 
    borderRadius: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: "#f9fafb",
  },
  
  section: {},
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#1e3a5f" },
  addBtn: { backgroundColor: "#1e3a5f", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  
  noStudents: { 
    backgroundColor: "#f9fafb", 
    borderRadius: 12, 
    padding: 32, 
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  noStudentsText: { fontSize: 15, fontWeight: "500", color: "#6b7280", marginBottom: 4 },
  noStudentsHint: { fontSize: 13, color: "#9ca3af" },
  
  studentsList: { gap: 12 },
  studentCard: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  studentInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  studentAvatar: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#7dd3fc",
  },
  studentAvatarText: { fontSize: 16, fontWeight: "600", color: "#0369a1" },
  studentName: { fontSize: 15, fontWeight: "600", color: "#1e3a5f" },
  studentPhone: { fontSize: 13, color: "#6b7280" },
  removeBtn: { 
    backgroundColor: "#fef2f2", 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  removeBtnText: { color: "#dc2626", fontWeight: "500", fontSize: 13 },
  
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
    maxWidth: 500,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#1e3a5f", marginBottom: 20 },
  
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  searchBtn: { backgroundColor: "#1e3a5f", paddingHorizontal: 16, justifyContent: "center", borderRadius: 8 },
  searchBtnText: { color: "#fff", fontWeight: "600" },
  
  searchResults: { 
    backgroundColor: "#f9fafb", 
    borderRadius: 10, 
    padding: 12, 
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchResultsLabel: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginBottom: 8 },
  searchResultItem: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  searchResultName: { fontSize: 14, fontWeight: "500", color: "#1e3a5f" },
  searchResultPhone: { fontSize: 13, color: "#6b7280" },
  addResultBtn: { backgroundColor: "#059669", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  addResultBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  dividerText: { paddingHorizontal: 12, color: "#9ca3af", fontSize: 12 },
  
  closeModalBtn: { 
    backgroundColor: "#f3f4f6", 
    paddingVertical: 12, 
    borderRadius: 8, 
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  closeModalBtnText: { color: "#374151", fontWeight: "600" },
});

