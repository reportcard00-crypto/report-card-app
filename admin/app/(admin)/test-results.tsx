import { useEffect, useState, useCallback, useRef } from "react";
import { 
  View, 
  Text, 
  Pressable, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { 
  getTestResults,
  getTestStatus,
  stopTest,
  type TestResultsData,
  type TestStatusData,
} from "@/api/admin";

export default function TestResultsScreen() {
  const router = useRouter();
  const { id: testId } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [resultsData, setResultsData] = useState<TestResultsData | null>(null);
  const [liveStatus, setLiveStatus] = useState<TestStatusData | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchResults = useCallback(async () => {
    if (!testId) return;
    try {
      const resp = await getTestResults(testId);
      setResultsData(resp.data);
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || "Failed to load results";
      if (Platform.OS === "web") {
        console.error(errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [testId]);

  const fetchStatus = useCallback(async () => {
    if (!testId) return;
    try {
      const resp = await getTestStatus(testId);
      setLiveStatus(resp.data);
      
      // If test is completed, stop polling
      if (resp.data.status === "completed" || resp.data.status === "cancelled") {
        setPollingActive(false);
        fetchResults(); // Refresh full results
      }
    } catch (e: any) {
      console.error("Polling error:", e);
    }
  }, [testId, fetchResults]);

  useEffect(() => {
    if (testId) {
      fetchResults();
    }
  }, [fetchResults]);

  // Start polling when test is active
  useEffect(() => {
    if (resultsData?.testSession?.status === "active") {
      setPollingActive(true);
    }
  }, [resultsData?.testSession?.status]);

  // Polling effect
  useEffect(() => {
    if (pollingActive && testId) {
      // Initial fetch
      fetchStatus();
      
      // Poll every 5 seconds
      pollIntervalRef.current = setInterval(fetchStatus, 5000);
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    }
  }, [pollingActive, testId, fetchStatus]);

  const handleStopTest = async () => {
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
      await stopTest(testId!);
      setPollingActive(false);
      fetchResults();
      if (Platform.OS === "web") {
        window.alert("Test Stopped - The test has been ended.");
      } else {
        Alert.alert("Test Stopped", "The test has been ended.");
      }
    } catch (e: any) {
      const errorMsg = e?.response?.data?.message || "Failed to stop test";
      if (Platform.OS === "web") {
        window.alert("Error: " + errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#059669";
    if (score >= 60) return "#d97706";
    if (score >= 40) return "#ea580c";
    return "#dc2626";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted": return { bg: "#d1fae5", text: "#065f46" };
      case "in_progress": return { bg: "#fef3c7", text: "#92400e" };
      case "timed_out": return { bg: "#fecaca", text: "#991b1b" };
      case "not_started": return { bg: "#e5e7eb", text: "#374151" };
      default: return { bg: "#f3f4f6", text: "#374151" };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Loading results...</Text>
      </View>
    );
  }

  if (!resultsData) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Results not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const { testSession, results, stats } = resultsData;
  const isActive = testSession.status === "active" || (liveStatus?.status === "active");
  const currentStatus = liveStatus || {
    totalStudents: stats.totalStudents,
    submittedCount: stats.completed,
    inProgressCount: stats.inProgress,
    notStartedCount: stats.totalStudents - stats.participated,
    timeRemainingSeconds: testSession.endsAt 
      ? Math.max(0, Math.floor((new Date(testSession.endsAt).getTime() - Date.now()) / 1000))
      : null,
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back</Text>
        </Pressable>
        {isActive && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      <Text style={styles.title}>{testSession.title}</Text>
      <Text style={styles.subtitle}>
        {testSession.questionPaper?.subject} • {testSession.classroom?.name}
      </Text>

      {/* Time Remaining Banner for Active Tests */}
      {isActive && currentStatus.timeRemainingSeconds !== null && currentStatus.timeRemainingSeconds > 0 && (
        <View style={styles.timeBanner}>
          <Text style={styles.timeBannerLabel}>Time Remaining</Text>
          <Text style={styles.timeBannerValue}>{formatTime(currentStatus.timeRemainingSeconds)}</Text>
        </View>
      )}

      {/* Quick Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statCardValue}>{currentStatus.totalStudents}</Text>
          <Text style={styles.statCardLabel}>Total Students</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "#d1fae5" }]}>
          <Text style={[styles.statCardValue, { color: "#059669" }]}>{currentStatus.submittedCount}</Text>
          <Text style={styles.statCardLabel}>Submitted</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "#fef3c7" }]}>
          <Text style={[styles.statCardValue, { color: "#d97706" }]}>{currentStatus.inProgressCount}</Text>
          <Text style={styles.statCardLabel}>In Progress</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statCardValue}>{currentStatus.notStartedCount}</Text>
          <Text style={styles.statCardLabel}>Not Started</Text>
        </View>
      </View>

      {/* Performance Stats (only show if test has submissions) */}
      {stats.completed > 0 && (
        <View style={styles.performanceSection}>
          <Text style={styles.sectionTitle}>Performance Overview</Text>
          <View style={styles.performanceStats}>
            <View style={styles.performanceItem}>
              <Text style={[styles.performanceValue, { color: getScoreColor(stats.averageScore) }]}>
                {stats.averageScore}%
              </Text>
              <Text style={styles.performanceLabel}>Average Score</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={[styles.performanceValue, { color: "#059669" }]}>
                {stats.highestScore}%
              </Text>
              <Text style={styles.performanceLabel}>Highest</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={[styles.performanceValue, { color: "#dc2626" }]}>
                {stats.lowestScore}%
              </Text>
              <Text style={styles.performanceLabel}>Lowest</Text>
            </View>
          </View>
        </View>
      )}

      {/* Recent Submissions (for active tests) */}
      {isActive && liveStatus?.recentSubmissions && liveStatus.recentSubmissions.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Submissions</Text>
          {liveStatus.recentSubmissions.map((submission, idx) => {
            const statusColors = getStatusColor(submission.status);
            return (
              <View key={idx} style={styles.recentItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentName}>
                    {submission.student?.name || submission.student?.phone || "Unknown"}
                  </Text>
                  <Text style={styles.recentMeta}>
                    {submission.correctAnswers}/{submission.attemptedQuestions} correct
                  </Text>
                </View>
                <View style={styles.recentScore}>
                  <Text style={[styles.recentScoreValue, { color: getScoreColor(submission.score) }]}>
                    {submission.score}%
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* All Results */}
      <View style={styles.resultsSection}>
        <Text style={styles.sectionTitle}>All Results ({results.length})</Text>
        
        {results.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>No submissions yet</Text>
          </View>
        ) : (
          results.map((result, idx) => {
            const statusColors = getStatusColor(result.status);
            return (
              <View key={result._id || idx} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName}>
                      {result.student?.name || result.student?.phone || "Unknown Student"}
                    </Text>
                    {result.student?.phone && result.student?.name && (
                      <Text style={styles.resultPhone}>{result.student.phone}</Text>
                    )}
                  </View>
                  <View style={[styles.resultStatus, { backgroundColor: statusColors.bg }]}>
                    <Text style={[styles.resultStatusText, { color: statusColors.text }]}>
                      {result.status.replace("_", " ")}
                    </Text>
                  </View>
                </View>

                {(result.status === "submitted" || result.status === "timed_out") && (
                  <View style={styles.resultBody}>
                    <View style={styles.resultScoreSection}>
                      <Text style={[styles.resultScoreValue, { color: getScoreColor(result.score) }]}>
                        {result.score}%
                      </Text>
                      <Text style={styles.resultScoreLabel}>Score</Text>
                    </View>
                    <View style={styles.resultDetails}>
                      <Text style={styles.resultDetail}>
                        ✓ {result.correctAnswers} correct
                      </Text>
                      <Text style={styles.resultDetail}>
                        ✗ {result.wrongAnswers} wrong
                      </Text>
                      <Text style={styles.resultDetail}>
                        {result.attemptedQuestions}/{result.totalQuestions} attempted
                      </Text>
                      {result.totalTimeTaken > 0 && (
                        <Text style={styles.resultDetail}>
                          ⏱ {formatTime(result.totalTimeTaken)}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {result.submittedAt && (
                  <Text style={styles.resultSubmittedAt}>
                    Submitted: {formatDate(result.submittedAt)}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Actions */}
      {isActive && (
        <View style={styles.actions}>
          <Pressable onPress={handleStopTest} style={styles.stopBtn}>
            <Text style={styles.stopBtnText}>Stop Test</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, color: "#6b7280" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginBottom: 16 },
  backBtn: { backgroundColor: "#111827", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: "#fff", fontWeight: "600" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  backLink: { paddingVertical: 4 },
  backLinkText: { color: "#2563eb", fontWeight: "500" },
  liveIndicator: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#fef2f2", 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 999 
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#dc2626", marginRight: 6 },
  liveText: { color: "#dc2626", fontWeight: "700", fontSize: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6b7280", marginBottom: 16 },
  timeBanner: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  timeBannerLabel: { color: "#bfdbfe", fontSize: 12, fontWeight: "500", marginBottom: 4 },
  timeBannerValue: { color: "#fff", fontSize: 32, fontWeight: "700" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  statCardValue: { fontSize: 24, fontWeight: "700", color: "#111827" },
  statCardLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginTop: 4 },
  performanceSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 12 },
  performanceStats: { flexDirection: "row", gap: 12 },
  performanceItem: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  performanceValue: { fontSize: 22, fontWeight: "700" },
  performanceLabel: { fontSize: 11, color: "#6b7280", marginTop: 4 },
  recentSection: { marginBottom: 20 },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  recentName: { fontSize: 14, fontWeight: "500", color: "#111827" },
  recentMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  recentScore: { marginLeft: 12 },
  recentScoreValue: { fontSize: 18, fontWeight: "700" },
  resultsSection: { marginBottom: 20 },
  noResults: { alignItems: "center", paddingVertical: 40 },
  noResultsText: { color: "#6b7280" },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  resultHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  resultName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  resultPhone: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  resultStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  resultStatusText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  resultBody: { flexDirection: "row", alignItems: "center", gap: 16 },
  resultScoreSection: { alignItems: "center" },
  resultScoreValue: { fontSize: 28, fontWeight: "700" },
  resultScoreLabel: { fontSize: 10, color: "#6b7280", textTransform: "uppercase" },
  resultDetails: { flex: 1 },
  resultDetail: { fontSize: 13, color: "#374151", marginBottom: 2 },
  resultSubmittedAt: { fontSize: 11, color: "#9ca3af", marginTop: 10 },
  actions: { marginTop: 8 },
  stopBtn: { 
    backgroundColor: "#dc2626", 
    paddingVertical: 14, 
    borderRadius: 8, 
    alignItems: "center" 
  },
  stopBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});

