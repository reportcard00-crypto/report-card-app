import React, { useEffect, useState, useCallback } from "react";
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
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  listTestSessions,
  startTest,
  stopTest,
  deleteTestSession,
  getTestResults,
  type TestSessionListItem,
  type TestResultsData,
} from "@/api/client";

const STATUSES = ["all", "assigned", "active", "completed", "cancelled"] as const;

export default function TeacherTestSessionsScreen() {
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

  // Results modal state
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [resultsData, setResultsData] = useState<TestResultsData | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

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
      Alert.alert("Error", e?.response?.data?.message || e?.message || "Failed to load test sessions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, statusFilter]);

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
      Alert.alert("Error", "Please enter a valid time limit (minimum 1 minute)");
      return;
    }

    try {
      setIsStarting(true);
      await startTest(selectedSession._id, minutes);
      setShowStartModal(false);
      Alert.alert(
        "Test Started!",
        `The test is now active for ${minutes} minutes.`,
        [
          {
            text: "View Results",
            onPress: () => handleViewResults(selectedSession),
          },
          { text: "OK", onPress: () => fetchSessions(false) },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to start test");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTest = (session: TestSessionListItem) => {
    Alert.alert(
      "Stop Test",
      "Are you sure you want to stop this test? Students who haven't submitted will be marked as timed out.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop Test",
          style: "destructive",
          onPress: async () => {
            try {
              await stopTest(session._id);
              Alert.alert("Test Stopped", "The test has been ended.");
              fetchSessions(false);
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.message || "Failed to stop test");
            }
          },
        },
      ]
    );
  };

  const handleViewResults = async (session: TestSessionListItem) => {
    try {
      setLoadingResults(true);
      setShowResultsModal(true);
      const resp = await getTestResults(session._id);
      setResultsData(resp.data);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to load results");
      setShowResultsModal(false);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleDelete = (session: TestSessionListItem) => {
    Alert.alert(
      "Delete Test Session",
      `Are you sure you want to delete "${session.title}"? All results will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTestSession(session._id);
              Alert.alert("Deleted", "Test session has been deleted.");
              fetchSessions(false);
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.message || "Failed to delete");
            }
          },
        },
      ]
    );
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
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSessions(false); }} colors={["#2563eb"]} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Test Sessions</Text>
        <Pressable onPress={() => router.push("/teacher/papers" as any)} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>View Papers</Text>
        </Pressable>
      </View>

      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
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

      <Text style={styles.resultsInfo}>
        {total} session{total !== 1 ? "s" : ""} found
        {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
      </Text>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading test sessions...</Text>
        </View>
      )}

      {!loading && sessions.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📝</Text>
          <Text style={styles.emptyTitle}>No test sessions found</Text>
          <Text style={styles.emptySubtitle}>
            {statusFilter !== "all"
              ? `No ${statusFilter} sessions`
              : "Assign a question paper to a classroom to create a test session"}
          </Text>
          {statusFilter === "all" && (
            <Pressable onPress={() => router.push("/teacher/papers" as any)} style={[styles.primaryBtn, { marginTop: 16 }]}>
              <Text style={styles.primaryBtnText}>Go to Papers</Text>
            </Pressable>
          )}
        </View>
      )}

      {!loading && sessions.length > 0 && (
        <View style={styles.sessionsGrid}>
          {sessions.map((session) => {
            const colors = getStatusColor(session.status);
            return (
              <View key={session._id} style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionTitle} numberOfLines={2}>{session.title}</Text>
                    <Text style={styles.sessionMeta}>
                      {session.questionPaper.subject} • {session.classroom.name}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      {session.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.sessionStats}>
                  <View style={styles.sessionStat}>
                    <Text style={styles.sessionStatValue}>{session.completedCount}</Text>
                    <Text style={styles.sessionStatLabel}>Completed</Text>
                  </View>
                  <View style={styles.sessionStat}>
                    <Text style={styles.sessionStatValue}>{session.totalStudents}</Text>
                    <Text style={styles.sessionStatLabel}>Total</Text>
                  </View>
                  {session.timeLimitMinutes > 0 && (
                    <View style={styles.sessionStat}>
                      <Text style={styles.sessionStatValue}>{session.timeLimitMinutes}m</Text>
                      <Text style={styles.sessionStatLabel}>Time Limit</Text>
                    </View>
                  )}
                </View>

                {session.status === "active" && session.endsAt && (
                  <View style={styles.timeRemainingBadge}>
                    <Text style={styles.timeRemainingText}>⏱ {getTimeRemaining(session.endsAt)}</Text>
                  </View>
                )}

                <Text style={styles.sessionDate}>Created: {formatDate(session.createdAt)}</Text>

                <View style={styles.sessionActions}>
                  {session.status === "assigned" && (
                    <Pressable
                      onPress={() => handleOpenStartModal(session)}
                      style={[styles.actionBtn, styles.startBtn]}
                    >
                      <Text style={styles.actionBtnText}>▶ Start Test</Text>
                    </Pressable>
                  )}
                  {session.status === "active" && (
                    <>
                      <Pressable
                        onPress={() => handleViewResults(session)}
                        style={[styles.actionBtn, styles.viewBtn]}
                      >
                        <Text style={styles.actionBtnText}>Live Results</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleStopTest(session)}
                        style={[styles.actionBtn, styles.stopBtn]}
                      >
                        <Text style={styles.stopBtnText}>■ Stop</Text>
                      </Pressable>
                    </>
                  )}
                  {(session.status === "completed" || session.status === "cancelled") && (
                    <Pressable
                      onPress={() => handleViewResults(session)}
                      style={[styles.actionBtn, styles.viewBtn]}
                    >
                      <Text style={styles.actionBtnText}>View Results</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleDelete(session)}
                    style={[styles.actionBtn, styles.deleteBtn]}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
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
            {selectedSession && (
              <Text style={styles.modalSubtitle}>"{selectedSession.title}"</Text>
            )}
            <Text style={styles.modalDesc}>
              This will make the test active for all students in {selectedSession?.classroom.name}.
            </Text>

            <Text style={styles.inputLabel}>Time Limit (minutes) *</Text>
            <TextInput
              value={timeLimitMinutes}
              onChangeText={setTimeLimitMinutes}
              style={styles.modalInput}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor="#9ca3af"
            />

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
                <Text style={styles.modalStartBtnText}>{isStarting ? "Starting..." : "▶ Start Test"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Results Modal */}
      <Modal
        visible={showResultsModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowResultsModal(false); setResultsData(null); }}
      >
        <View style={styles.resultsModalOverlay}>
          <View style={styles.resultsModalContent}>
            <View style={styles.resultsModalHeader}>
              <Text style={styles.resultsModalTitle}>Test Results</Text>
              <Pressable
                onPress={() => { setShowResultsModal(false); setResultsData(null); }}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {loadingResults ? (
              <View style={styles.resultsLoading}>
                <ActivityIndicator color="#2563eb" />
                <Text style={styles.resultsLoadingText}>Loading results...</Text>
              </View>
            ) : resultsData ? (
              <ScrollView>
                {/* Stats */}
                <View style={styles.resultsStats}>
                  <View style={styles.resultsStat}>
                    <Text style={styles.resultsStatValue}>{resultsData.stats.completed}</Text>
                    <Text style={styles.resultsStatLabel}>Completed</Text>
                  </View>
                  <View style={styles.resultsStat}>
                    <Text style={styles.resultsStatValue}>{resultsData.stats.inProgress}</Text>
                    <Text style={styles.resultsStatLabel}>In Progress</Text>
                  </View>
                  <View style={styles.resultsStat}>
                    <Text style={styles.resultsStatValue}>{resultsData.stats.averageScore}%</Text>
                    <Text style={styles.resultsStatLabel}>Avg Score</Text>
                  </View>
                  <View style={styles.resultsStat}>
                    <Text style={styles.resultsStatValue}>{resultsData.stats.highestScore}%</Text>
                    <Text style={styles.resultsStatLabel}>Highest</Text>
                  </View>
                </View>

                {/* Student Results */}
                <Text style={styles.resultsListTitle}>Student Results</Text>
                {resultsData.results.map((result) => (
                  <View key={result._id} style={styles.resultRow}>
                    <View style={styles.resultStudentInfo}>
                      <Text style={styles.resultStudentName}>
                        {result.student.name || result.student.phone}
                      </Text>
                      <Text style={styles.resultStudentStatus}>{result.status}</Text>
                    </View>
                    <View style={styles.resultScoreInfo}>
                      {result.status === "submitted" || result.status === "timed_out" ? (
                        <>
                          <Text style={styles.resultScore}>{result.score}%</Text>
                          <Text style={styles.resultCorrect}>
                            {result.correctAnswers}/{result.totalQuestions}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.resultPending}>—</Text>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : null}
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
  primaryBtn: { backgroundColor: "#2563eb", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  secondaryBtn: { backgroundColor: "#f3f4f6", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#d1d5db" },
  secondaryBtnText: { color: "#374151", fontWeight: "600" },
  filterRow: { marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  filterChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  filterChipText: { fontSize: 13, color: "#374151", fontWeight: "500" },
  filterChipTextActive: { color: "#fff" },
  resultsInfo: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  loadingContainer: { alignItems: "center", paddingVertical: 60 },
  loadingText: { marginTop: 12, color: "#6b7280" },
  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
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
    elevation: 1,
  },
  sessionHeader: { flexDirection: "row", gap: 12, marginBottom: 12 },
  sessionTitle: { fontSize: 16, fontWeight: "600", color: "#1e3a5f", marginBottom: 4 },
  sessionMeta: { fontSize: 13, color: "#6b7280" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignSelf: "flex-start" },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  sessionStats: { flexDirection: "row", gap: 20, marginBottom: 10 },
  sessionStat: {},
  sessionStatValue: { fontSize: 18, fontWeight: "700", color: "#1e3a5f" },
  sessionStatLabel: { fontSize: 10, color: "#9ca3af", textTransform: "uppercase" },
  timeRemainingBadge: { backgroundColor: "#d1fae5", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 8 },
  timeRemainingText: { fontSize: 13, color: "#065f46", fontWeight: "600" },
  sessionDate: { fontSize: 12, color: "#9ca3af", marginBottom: 12 },
  sessionActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, alignItems: "center" },
  startBtn: { backgroundColor: "#059669" },
  viewBtn: { backgroundColor: "#2563eb" },
  stopBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  deleteBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  stopBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  deleteBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  pagination: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 24 },
  pageBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  pageBtnDisabled: { opacity: 0.5 },
  pageBtnText: { color: "#374151", fontWeight: "500" },
  pageBtnTextDisabled: { color: "#9ca3af" },
  pageInfo: { fontSize: 14, color: "#6b7280" },
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
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#1e3a5f", marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: "#6b7280", marginBottom: 8 },
  modalDesc: { fontSize: 13, color: "#374151", marginBottom: 16, lineHeight: 20 },
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
    color: "#111827",
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalCancelBtn: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#d1d5db" },
  modalCancelBtnText: { color: "#374151", fontWeight: "600" },
  modalStartBtn: { backgroundColor: "#059669" },
  modalStartBtnText: { color: "#fff", fontWeight: "600" },
  resultsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  resultsModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "80%",
  },
  resultsModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  resultsModalTitle: { fontSize: 20, fontWeight: "700", color: "#1e3a5f" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  closeBtnText: { fontSize: 14, color: "#374151", fontWeight: "700" },
  resultsLoading: { alignItems: "center", paddingVertical: 40, gap: 12 },
  resultsLoadingText: { color: "#6b7280" },
  resultsStats: { flexDirection: "row", gap: 12, marginBottom: 20 },
  resultsStat: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  resultsStatValue: { fontSize: 22, fontWeight: "700", color: "#1e3a5f" },
  resultsStatLabel: { fontSize: 10, color: "#6b7280", textTransform: "uppercase", marginTop: 4 },
  resultsListTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  resultStudentInfo: {},
  resultStudentName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  resultStudentStatus: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  resultScoreInfo: { alignItems: "flex-end" },
  resultScore: { fontSize: 18, fontWeight: "700", color: "#1e3a5f" },
  resultCorrect: { fontSize: 12, color: "#6b7280" },
  resultPending: { fontSize: 18, color: "#9ca3af" },
});
