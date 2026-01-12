import { useEffect, useState, useCallback } from "react";
import { 
  View, 
  Text, 
  Pressable, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { 
  listTestSessions, 
  listClassrooms,
  startTest,
  stopTest,
  reassignTest,
  deleteTestSession,
  type TestSessionListItem,
  type ClassroomListItem,
} from "@/api/admin";

const STATUSES = ["all", "assigned", "active", "completed", "cancelled"] as const;

export default function TestSessionsScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<TestSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<typeof STATUSES[number]>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Start modal state
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TestSessionListItem | null>(null);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("30");
  const [isStarting, setIsStarting] = useState(false);

  // Reassign modal state
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [classrooms, setClassrooms] = useState<ClassroomListItem[]>([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  const fetchSessions = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const resp = await listTestSessions({
        page,
        limit: 20,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setSessions(resp.data);
      setTotalPages(resp.meta.totalPages);
      setTotal(resp.meta.total);
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || e?.message || "Failed to load test sessions";
      if (Platform.OS === "web") {
        console.error(errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, statusFilter]);

  const fetchClassrooms = useCallback(async () => {
    try {
      setLoadingClassrooms(true);
      const resp = await listClassrooms({ limit: 100 });
      setClassrooms(resp.data);
    } catch (e: any) {
      if (Platform.OS === "web") {
        console.error("Failed to load classrooms");
      } else {
        Alert.alert("Error", "Failed to load classrooms");
      }
    } finally {
      setLoadingClassrooms(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useFocusEffect(
    useCallback(() => {
      fetchSessions(false);
    }, [fetchSessions])
  );

  const handleOpenStartModal = (session: TestSessionListItem) => {
    setSelectedSession(session);
    setTimeLimitMinutes("30");
    setShowStartModal(true);
  };

  const handleStartTest = async () => {
    if (!selectedSession) return;
    
    const minutes = parseInt(timeLimitMinutes, 10);
    if (isNaN(minutes) || minutes < 1) {
      if (Platform.OS === "web") {
        window.alert("Please enter a valid time limit (minimum 1 minute)");
      } else {
        Alert.alert("Error", "Please enter a valid time limit (minimum 1 minute)");
      }
      return;
    }

    try {
      setIsStarting(true);
      await startTest(selectedSession._id, minutes);
      setShowStartModal(false);
      
      if (Platform.OS === "web") {
        const viewResults = window.confirm(`Test Started! The test is now active for ${minutes} minutes.\n\nClick OK to view live results, or Cancel to stay here.`);
        if (viewResults) {
          router.push(`/test-results?id=${selectedSession._id}` as any);
        } else {
          fetchSessions(false);
        }
      } else {
        Alert.alert(
          "Test Started!",
          `The test is now active for ${minutes} minutes.`,
          [
            { 
              text: "View Live Results", 
              onPress: () => router.push(`/test-results?id=${selectedSession._id}` as any)
            },
            { text: "OK", onPress: () => fetchSessions(false) },
          ]
        );
      }
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || "Failed to start test";
      if (Platform.OS === "web") {
        window.alert("Error: " + errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTest = async (session: TestSessionListItem) => {
    const confirmed = Platform.OS === "web"
      ? window.confirm("Are you sure you want to stop this test? Students who haven't submitted will be marked as timed out.")
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Stop Test",
            "Are you sure you want to stop this test? Students who haven't submitted will be marked as timed out.",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Stop Test", style: "destructive", onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    try {
      await stopTest(session._id);
      if (Platform.OS === "web") {
        window.alert("Test Stopped - The test has been ended.");
      } else {
        Alert.alert("Test Stopped", "The test has been ended.");
      }
      fetchSessions(false);
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || "Failed to stop test";
      if (Platform.OS === "web") {
        window.alert("Error: " + errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    }
  };

  const handleOpenReassignModal = (session: TestSessionListItem) => {
    setSelectedSession(session);
    setSelectedClassroom(null);
    setShowReassignModal(true);
    fetchClassrooms();
  };

  const handleReassign = async () => {
    if (!selectedSession || !selectedClassroom) {
      if (Platform.OS === "web") {
        window.alert("Please select a classroom");
      } else {
        Alert.alert("Error", "Please select a classroom");
      }
      return;
    }

    try {
      setIsReassigning(true);
      await reassignTest(selectedSession._id, selectedClassroom);
      setShowReassignModal(false);
      if (Platform.OS === "web") {
        window.alert("Test reassigned to new classroom.");
      } else {
        Alert.alert("Success", "Test reassigned to new classroom.");
      }
      fetchSessions(false);
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || "Failed to reassign test";
      if (Platform.OS === "web") {
        window.alert("Error: " + errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    } finally {
      setIsReassigning(false);
    }
  };

  const handleDelete = async (session: TestSessionListItem) => {
    const confirmed = Platform.OS === "web"
      ? window.confirm(`Are you sure you want to delete "${session.title}"? All results will be permanently deleted.`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Delete Test Session",
            `Are you sure you want to delete "${session.title}"? All results will be permanently deleted.`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Delete", style: "destructive", onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    try {
      await deleteTestSession(session._id);
      if (Platform.OS === "web") {
        window.alert("Test session has been deleted.");
      } else {
        Alert.alert("Deleted", "Test session has been deleted.");
      }
      fetchSessions(false);
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || "Failed to delete";
      if (Platform.OS === "web") {
        window.alert("Error: " + errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "assigned": return { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" };
      case "active": return { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" };
      case "completed": return { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" };
      case "cancelled": return { bg: "#e5e7eb", border: "#9ca3af", text: "#374151" };
      default: return { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" };
    }
  };

  const getTimeRemaining = (endsAt: string) => {
    const remaining = new Date(endsAt).getTime() - Date.now();
    if (remaining <= 0) return "Ended";
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return `${mins}m ${secs}s remaining`;
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Test Sessions</Text>
        <Pressable onPress={() => router.push("/paper-history" as any)} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>View Papers</Text>
        </Pressable>
      </View>

      {/* Status Filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Status:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              onPress={() => { setStatusFilter(s); setPage(1); }}
              style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={() => { setRefreshing(true); fetchSessions(false); }} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>{refreshing ? "..." : "↻"}</Text>
        </Pressable>
      </View>

      <Text style={styles.resultsInfo}>
        {total} test{total !== 1 ? "s" : ""} found
        {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
      </Text>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
          <Text style={styles.loadingText}>Loading tests...</Text>
        </View>
      )}

      {!loading && sessions.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No test sessions found</Text>
          <Text style={styles.emptySubtitle}>
            {statusFilter !== "all" 
              ? "Try adjusting your filters"
              : "Assign a question paper to a classroom to create a test"}
          </Text>
          <Pressable onPress={() => router.push("/paper-history" as any)} style={[styles.primaryBtn, { marginTop: 16 }]}>
            <Text style={styles.primaryBtnText}>View Papers</Text>
          </Pressable>
        </View>
      )}

      {!loading && sessions.length > 0 && (
        <View style={styles.sessionsGrid}>
          {sessions.map((session) => {
            const statusColors = getStatusColor(session.status);
            return (
              <View key={session._id} style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionTitle} numberOfLines={2}>{session.title}</Text>
                    <Text style={styles.sessionMeta}>
                      {session.questionPaper?.subject} • {session.classroom?.name}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
                    <Text style={[styles.statusText, { color: statusColors.text }]}>{session.status}</Text>
                  </View>
                </View>

                {session.status === "active" && session.endsAt && (
                  <View style={styles.timeRemaining}>
                    <Text style={styles.timeRemainingText}>⏱ {getTimeRemaining(session.endsAt)}</Text>
                  </View>
                )}

                <View style={styles.sessionStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{session.totalStudents}</Text>
                    <Text style={styles.statLabel}>Students</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{session.completedCount}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{session.timeLimitMinutes || "-"}</Text>
                    <Text style={styles.statLabel}>Minutes</Text>
                  </View>
                </View>

                <Text style={styles.sessionDate}>Created: {formatDate(session.createdAt)}</Text>

                <View style={styles.sessionActions}>
                  {session.status === "assigned" && (
                    <>
                      <Pressable onPress={() => handleOpenStartModal(session)} style={[styles.actionBtn, styles.startBtn]}>
                        <Text style={styles.startBtnText}>Start Test</Text>
                      </Pressable>
                      <Pressable onPress={() => handleOpenReassignModal(session)} style={[styles.actionBtn, styles.reassignBtn]}>
                        <Text style={styles.reassignBtnText}>Reassign</Text>
                      </Pressable>
                    </>
                  )}
                  {session.status === "active" && (
                    <>
                      <Pressable 
                        onPress={() => router.push(`/test-results?id=${session._id}` as any)} 
                        style={[styles.actionBtn, styles.viewBtn]}
                      >
                        <Text style={styles.viewBtnText}>Live Results</Text>
                      </Pressable>
                      <Pressable onPress={() => handleStopTest(session)} style={[styles.actionBtn, styles.stopBtn]}>
                        <Text style={styles.stopBtnText}>Stop</Text>
                      </Pressable>
                    </>
                  )}
                  {(session.status === "completed" || session.status === "cancelled") && (
                    <>
                      <Pressable 
                        onPress={() => router.push(`/test-results?id=${session._id}` as any)} 
                        style={[styles.actionBtn, styles.viewBtn]}
                      >
                        <Text style={styles.viewBtnText}>View Results</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDelete(session)} style={[styles.actionBtn, styles.deleteBtn]}>
                        <Text style={styles.deleteBtnText}>Delete</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}
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

      {/* Start Test Modal */}
      <Modal
        visible={showStartModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Start Test</Text>
            <Text style={styles.modalSubtitle}>
              Set the time limit for this test. Once started, students will be able to take the test.
            </Text>

            {selectedSession && (
              <View style={styles.selectedInfo}>
                <Text style={styles.selectedInfoTitle}>{selectedSession.title}</Text>
                <Text style={styles.selectedInfoMeta}>
                  {selectedSession.classroom?.name} • {selectedSession.totalStudents} students
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Time Limit (minutes) *</Text>
            <View style={styles.quickTimeButtons}>
              {[15, 30, 45, 60, 90, 120].map((mins) => (
                <Pressable
                  key={mins}
                  onPress={() => setTimeLimitMinutes(String(mins))}
                  style={[
                    styles.quickTimeBtn,
                    timeLimitMinutes === String(mins) && styles.quickTimeBtnActive
                  ]}
                >
                  <Text style={[
                    styles.quickTimeBtnText,
                    timeLimitMinutes === String(mins) && styles.quickTimeBtnTextActive
                  ]}>
                    {mins}m
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable 
                onPress={() => setShowStartModal(false)}
                style={[styles.modalBtn, styles.modalCancelBtn]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleStartTest}
                disabled={isStarting}
                style={[styles.modalBtn, styles.modalStartBtn, isStarting && { opacity: 0.7 }]}
              >
                <Text style={styles.modalStartBtnText}>
                  {isStarting ? "Starting..." : "Start Test"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reassign Modal */}
      <Modal
        visible={showReassignModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReassignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reassign Test</Text>
            
            {selectedSession && (
              <View style={styles.selectedInfo}>
                <Text style={styles.selectedInfoTitle}>{selectedSession.title}</Text>
                <Text style={styles.selectedInfoMeta}>
                  Currently: {selectedSession.classroom?.name}
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Select New Classroom *</Text>
            
            {loadingClassrooms ? (
              <ActivityIndicator style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={styles.classroomList} nestedScrollEnabled>
                {classrooms.map((classroom) => (
                  <Pressable
                    key={classroom._id}
                    onPress={() => setSelectedClassroom(classroom._id)}
                    style={[
                      styles.classroomOption,
                      selectedClassroom === classroom._id && styles.classroomOptionSelected
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.classroomOptionName,
                        selectedClassroom === classroom._id && styles.classroomOptionNameSelected
                      ]}>
                        {classroom.name}
                      </Text>
                      <Text style={styles.classroomOptionMeta}>
                        {classroom.studentsCount} student{classroom.studentsCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    {selectedClassroom === classroom._id && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <Pressable 
                onPress={() => { setShowReassignModal(false); setSelectedClassroom(null); }}
                style={[styles.modalBtn, styles.modalCancelBtn]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleReassign}
                disabled={isReassigning || !selectedClassroom}
                style={[
                  styles.modalBtn, 
                  styles.modalPrimaryBtn, 
                  (!selectedClassroom || isReassigning) && { opacity: 0.5 }
                ]}
              >
                <Text style={styles.modalPrimaryBtnText}>
                  {isReassigning ? "Reassigning..." : "Reassign"}
                </Text>
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
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  primaryBtn: { backgroundColor: "#111827", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  secondaryBtn: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#d1d5db" },
  secondaryBtnText: { color: "#374151", fontWeight: "600" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  filterLabel: { fontSize: 13, fontWeight: "600", color: "#6b7280", minWidth: 50 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  filterChipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  filterChipText: { fontSize: 13, color: "#374151" },
  filterChipTextActive: { color: "#fff", fontWeight: "600" },
  refreshBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d1d5db" },
  refreshBtnText: { fontSize: 16, color: "#374151" },
  resultsInfo: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  loadingContainer: { alignItems: "center", paddingVertical: 60 },
  loadingText: { marginTop: 12, color: "#6b7280" },
  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  sessionsGrid: { gap: 16 },
  sessionCard: { 
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
  sessionHeader: { flexDirection: "row", gap: 12, marginBottom: 8 },
  sessionTitle: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 4 },
  sessionMeta: { fontSize: 13, color: "#6b7280" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  timeRemaining: { 
    backgroundColor: "#ecfdf5", 
    borderRadius: 6, 
    paddingVertical: 6, 
    paddingHorizontal: 10, 
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  timeRemainingText: { color: "#059669", fontWeight: "600", fontSize: 13 },
  sessionStats: { flexDirection: "row", gap: 24, marginBottom: 8 },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 11, color: "#9ca3af", textTransform: "uppercase" },
  sessionDate: { fontSize: 12, color: "#9ca3af", marginBottom: 12 },
  sessionActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center" },
  startBtn: { backgroundColor: "#059669" },
  startBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  reassignBtn: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db" },
  reassignBtnText: { color: "#374151", fontWeight: "600", fontSize: 13 },
  viewBtn: { backgroundColor: "#2563eb" },
  viewBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  stopBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  stopBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
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
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: "#6b7280", marginBottom: 16 },
  selectedInfo: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  selectedInfoTitle: { fontSize: 15, fontWeight: "600", color: "#111827", marginBottom: 4 },
  selectedInfoMeta: { fontSize: 13, color: "#6b7280" },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 12 },
  quickTimeButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  quickTimeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  quickTimeBtnActive: { backgroundColor: "#059669", borderColor: "#059669" },
  quickTimeBtnText: { fontSize: 13, fontWeight: "500", color: "#374151" },
  quickTimeBtnTextActive: { color: "#fff" },
  classroomList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  classroomOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  classroomOptionSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  classroomOptionName: { fontSize: 15, fontWeight: "500", color: "#111827" },
  classroomOptionNameSelected: { color: "#2563eb" },
  classroomOptionMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  checkmark: { fontSize: 18, color: "#2563eb", fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalCancelBtn: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#d1d5db" },
  modalCancelBtnText: { color: "#374151", fontWeight: "600" },
  modalPrimaryBtn: { backgroundColor: "#2563eb" },
  modalPrimaryBtnText: { color: "#fff", fontWeight: "600" },
  modalStartBtn: { backgroundColor: "#059669" },
  modalStartBtnText: { color: "#fff", fontWeight: "600" },
});

