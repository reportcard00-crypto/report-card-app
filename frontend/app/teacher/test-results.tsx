import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getTestResults, type TestResultsData } from "@/api/client";

export default function TeacherTestResultsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [resultsData, setResultsData] = useState<TestResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchResults = useCallback(async (showLoading = true) => {
    if (!id) return;
    try {
      if (showLoading) setLoading(true);
      const resp = await getTestResults(id);
      setResultsData(resp.data);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to load results");
      router.back();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading results...</Text>
      </View>
    );
  }

  if (!resultsData) return null;

  const { stats, results, testSession } = resultsData;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchResults(false); }} colors={["#2563eb"]} />
      }
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back</Text>
        </Pressable>
      </View>

      {testSession && (
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionTitle}>{testSession.title || "Test Results"}</Text>
          <Text style={styles.sessionMeta}>
            {testSession.questionPaper?.subject} • {testSession.classroom?.name}
          </Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.inProgress}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalStudents - stats.participated}</Text>
          <Text style={styles.statLabel}>Not Started</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#059669" }]}>{stats.averageScore}%</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#2563eb" }]}>{stats.highestScore}%</Text>
          <Text style={styles.statLabel}>Highest</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#dc2626" }]}>{stats.lowestScore}%</Text>
          <Text style={styles.statLabel}>Lowest</Text>
        </View>
      </View>

      {/* Student Results */}
      <Text style={styles.sectionTitle}>Student Results ({results.length})</Text>
      <View style={styles.resultsList}>
        {results.map((result) => {
          const isSubmitted = result.status === "submitted" || result.status === "timed_out";
          const scoreColor = isSubmitted
            ? result.score >= 80 ? "#059669"
              : result.score >= 60 ? "#d97706"
              : "#dc2626"
            : "#9ca3af";

          return (
            <View key={result._id} style={styles.resultCard}>
              <View style={styles.resultLeft}>
                <View style={styles.resultAvatar}>
                  <Text style={styles.resultAvatarText}>
                    {(result.student.name || result.student.phone || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.resultName}>{result.student.name || "No Name"}</Text>
                  <Text style={styles.resultPhone}>{result.student.phone}</Text>
                  <Text style={[styles.resultStatus, { color: scoreColor }]}>
                    {result.status.replace("_", " ").toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.resultRight}>
                {isSubmitted ? (
                  <>
                    <Text style={[styles.resultScore, { color: scoreColor }]}>{result.score}%</Text>
                    <Text style={styles.resultCorrect}>
                      {result.correctAnswers}/{result.totalQuestions} correct
                    </Text>
                  </>
                ) : (
                  <Text style={styles.resultPending}>—</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" },
  loadingText: { marginTop: 12, color: "#6b7280" },
  container: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  backLink: {},
  backLinkText: { color: "#2563eb", fontWeight: "500", fontSize: 15 },
  sessionInfo: { marginBottom: 20 },
  sessionTitle: { fontSize: 22, fontWeight: "700", color: "#1e3a5f" },
  sessionMeta: { fontSize: 14, color: "#6b7280", marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    minWidth: "28%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statValue: { fontSize: 22, fontWeight: "700", color: "#1e3a5f" },
  statLabel: { fontSize: 10, color: "#6b7280", textTransform: "uppercase", marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 12 },
  resultsList: { gap: 10 },
  resultCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  resultLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  resultAvatarText: { fontSize: 16, fontWeight: "700", color: "#0369a1" },
  resultName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  resultPhone: { fontSize: 12, color: "#6b7280" },
  resultStatus: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  resultRight: { alignItems: "flex-end" },
  resultScore: { fontSize: 20, fontWeight: "700" },
  resultCorrect: { fontSize: 12, color: "#6b7280" },
  resultPending: { fontSize: 20, color: "#9ca3af" },
});
