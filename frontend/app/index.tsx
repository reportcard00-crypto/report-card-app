import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
  View, 
  Text, 
  ActivityIndicator, 
  StyleSheet, 
  Pressable, 
  ScrollView, 
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import apiClient, { 
  getActiveTests, 
  getStudentDashboard,
  type ActiveTest,
  type StudentDashboardData,
} from "@/api/client";
import { useAuthStore, type AuthState, type AuthUser } from "../store/auth";
import type { ProfileStatusResponse } from "@/types/api";

const Index = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTests, setActiveTests] = useState<ActiveTest[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [dashboard, setDashboard] = useState<StudentDashboardData | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const setUser = useAuthStore((state: AuthState) => state.setUser);
  const setProfileStatus = useAuthStore((state: AuthState) => (state as any).setProfileStatus);
  const user = useAuthStore((state: AuthState) => state.user);

  const fetchActiveTests = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoadingTests(true);
      const resp = await getActiveTests();
      setActiveTests(resp.data);
    } catch (e) {
      console.log("Error fetching active tests:", e);
    } finally {
      setLoadingTests(false);
      setRefreshing(false);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const resp = await getStudentDashboard();
      setDashboard(resp.data);
    } catch (e) {
      console.log("Error fetching dashboard:", e);
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiClient.get("/api/user/user");
        if (response.data) {
          setUser(response.data as AuthUser);
        }
        // Fetch profile status after user
        try {
          const profileRes = await apiClient.get<ProfileStatusResponse>("/api/user/profile-status");
          if (profileRes?.data?.success) {
            setProfileStatus(profileRes.data);
            if (!profileRes.data.hasProfile) {
              if (profileRes.data.profileType === "teacher") {
                router.replace("/auth/TeacherProfile");
              } else {
                router.replace("/auth/InitialProfile");
              }
              return;
            }
          }
        } catch {}
        setLoading(false);
        // Fetch active tests and dashboard once authenticated
        fetchActiveTests(true);
        fetchDashboard();
      } catch {
        router.replace("/auth/Auth");
      }
    };
    checkAuth();
  }, [router, setUser, setProfileStatus, fetchActiveTests, fetchDashboard]);

  // Poll for active tests every 5 seconds
  useEffect(() => {
    if (!loading && user) {
      // Start polling
      pollIntervalRef.current = setInterval(() => {
        fetchActiveTests(false);
      }, 5000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [loading, user, fetchActiveTests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveTests(false);
    fetchDashboard();
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return "Expired";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}h ${remainMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}h ${remainMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  const handleStartTest = (test: ActiveTest) => {
    router.push(`/test/${test._id}` as any);
  };

  const handleViewTestDetail = (testId: string) => {
    router.push(`/test/result/${testId}` as any);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#059669";
    if (score >= 60) return "#d97706";
    if (score >= 40) return "#ea580c";
    return "#dc2626";
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "improvement": return "📈";
      case "warning": return "⚠️";
      default: return "💡";
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case "improvement": return { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" };
      case "warning": return { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" };
      default: return { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const hasCompletedTests = dashboard && dashboard.recentTests.length > 0;

  return (
    <ScrollView 
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#6366f1"]} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || "Student"}</Text>
        </View>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {(user?.name || "S").charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* No Active Tests Message - Show at top when there are no active tests */}
      {activeTests.length === 0 && hasCompletedTests && (
        <View style={styles.noActiveTestsCard}>
          <Text style={styles.noActiveTestsIcon}>✅</Text>
          <Text style={styles.noActiveTestsText}>No active tests right now</Text>
          <Text style={styles.noActiveTestsSubtext}>
            Check back later for new assignments
          </Text>
        </View>
      )}

      {/* Active Tests Section - Priority */}
      {activeTests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.liveDot} />
              <Text style={styles.sectionTitle}>Active Tests</Text>
            </View>
            {loadingTests && <ActivityIndicator size="small" color="#6b7280" />}
          </View>

          <View style={styles.testsGrid}>
            {activeTests.map((test) => (
              <View key={test._id} style={styles.activeTestCard}>
                <View style={styles.testHeader}>
                  <View style={styles.subjectBadge}>
                    <Text style={styles.subjectBadgeText}>{test.subject}</Text>
                  </View>
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>
                      ⏱ {formatTimeRemaining(test.timeRemainingSeconds)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.testTitle}>{test.title}</Text>
                <Text style={styles.testMeta}>
                  {test.questionsCount} questions • {test.classroom}
                </Text>

                <View style={styles.testFooter}>
                  {test.studentStatus === "in_progress" ? (
                    <Pressable 
                      onPress={() => handleStartTest(test)}
                      style={[styles.testButton, styles.continueButton]}
                    >
                      <Text style={styles.testButtonText}>Continue Test →</Text>
                    </Pressable>
                  ) : test.canStart ? (
                    <Pressable 
                      onPress={() => handleStartTest(test)}
                      style={[styles.testButton, styles.startButton]}
                    >
                      <Text style={styles.testButtonText}>Start Test</Text>
                    </Pressable>
                  ) : (
                    <View style={[styles.testButton, styles.completedButton]}>
                      <Text style={styles.completedButtonText}>Completed</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* KPIs Section */}
      {hasCompletedTests && dashboard && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Performance</Text>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{dashboard.kpis.avgScore}%</Text>
              <Text style={styles.kpiLabel}>Avg Score</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{dashboard.kpis.accuracyPercent}%</Text>
              <Text style={styles.kpiLabel}>Accuracy</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>
                {dashboard.kpis.testsAttempted}/{dashboard.kpis.testsAssigned}
              </Text>
              <Text style={styles.kpiLabel}>Tests Done</Text>
            </View>
          </View>
        </View>
      )}

      {/* Performance Trend */}
      {hasCompletedTests && dashboard && dashboard.performanceTrend.length >= 2 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Trend</Text>
          <Text style={styles.sectionSubtitle}>Your last {dashboard.performanceTrend.length} tests (oldest → newest)</Text>
          <View style={styles.trendCard}>
            <View style={styles.trendChart}>
              {dashboard.performanceTrend.map((item, idx) => (
                <Pressable 
                  key={idx} 
                  style={styles.trendBarContainer}
                  onPress={() => handleViewTestDetail(item.testId)}
                >
                  <View 
                    style={[
                      styles.trendBar, 
                      { 
                        height: `${Math.max(item.score, 8)}%`,
                        backgroundColor: getScoreColor(item.score),
                      }
                    ]} 
                  />
                  <Text style={styles.trendBarLabel}>{item.score}%</Text>
                  <Text style={styles.trendBarDate} numberOfLines={1}>
                    {new Date(item.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Strengths & Weaknesses */}
      {hasCompletedTests && dashboard && (dashboard.strengths.length > 0 || dashboard.weaknesses.length > 0) && (
        <View style={styles.section}>
          <View style={styles.strengthWeaknessGrid}>
            {/* Strengths */}
            {dashboard.strengths.length > 0 && (
              <View style={styles.strengthCard}>
                <View style={styles.swHeader}>
                  <Text style={styles.swIcon}>💪</Text>
                  <Text style={styles.swTitle}>Strengths</Text>
                </View>
                {dashboard.strengths.slice(0, 3).map((item, idx) => (
                  <View key={idx} style={styles.swItem}>
                    <View style={styles.swItemContent}>
                      <Text style={styles.swChapter} numberOfLines={1}>{item.chapter}</Text>
                      <Text style={styles.swSubject}>{item.subject}</Text>
                    </View>
                    <View style={styles.swAccuracyBadge}>
                      <Text style={styles.swAccuracyText}>{item.accuracy}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Weaknesses */}
            {dashboard.weaknesses.length > 0 && (
              <View style={styles.weaknessCard}>
                <View style={styles.swHeader}>
                  <Text style={styles.swIcon}>🎯</Text>
                  <Text style={styles.swTitle}>Focus Areas</Text>
                </View>
                {dashboard.weaknesses.slice(0, 3).map((item, idx) => (
                  <View key={idx} style={styles.swItem}>
                    <View style={styles.swItemContent}>
                      <Text style={styles.swChapter} numberOfLines={1}>{item.chapter}</Text>
                      <Text style={styles.swSubject}>{item.subject}</Text>
                    </View>
                    <View style={[styles.swAccuracyBadge, styles.swAccuracyBadgeWeak]}>
                      <Text style={[styles.swAccuracyText, styles.swAccuracyTextWeak]}>
                        {item.accuracy}%
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Insights */}
      {hasCompletedTests && dashboard && dashboard.insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Insights</Text>
          <View style={styles.insightsContainer}>
            {dashboard.insights.map((insight, idx) => {
              const colors = getInsightColor(insight.type);
              return (
                <View 
                  key={idx} 
                  style={[
                    styles.insightCard, 
                    { backgroundColor: colors.bg, borderColor: colors.border }
                  ]}
                >
                  <Text style={styles.insightIcon}>{getInsightIcon(insight.type)}</Text>
                  <Text style={[styles.insightText, { color: colors.text }]}>
                    {insight.message}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Recommendations */}
      {hasCompletedTests && dashboard && dashboard.recommendations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          <View style={styles.recommendationsCard}>
            {dashboard.recommendations.map((rec, idx) => (
              <View key={idx} style={styles.recommendationItem}>
                <Text style={styles.recommendationBullet}>•</Text>
                <Text style={styles.recommendationText}>{rec}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Recent Tests */}
      {hasCompletedTests && dashboard && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Tests</Text>
          <View style={styles.recentTestsContainer}>
            {dashboard.recentTests.map((test) => (
              <Pressable 
                key={test._id} 
                style={styles.recentTestCard}
                onPress={() => handleViewTestDetail(test._id)}
              >
                <View style={styles.recentTestLeft}>
                  <View style={[
                    styles.recentTestScoreCircle,
                    { borderColor: getScoreColor(test.score) }
                  ]}>
                    <Text style={[styles.recentTestScore, { color: getScoreColor(test.score) }]}>
                      {test.score}%
                    </Text>
                  </View>
                </View>
                <View style={styles.recentTestContent}>
                  <Text style={styles.recentTestName} numberOfLines={1}>{test.testName}</Text>
                  <Text style={styles.recentTestMeta}>
                    {test.subject} • {test.correctAnswers}/{test.totalQuestions} correct
                  </Text>
                  <Text style={styles.recentTestTime}>
                    {formatTime(test.timeTaken)} • {new Date(test.submittedAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.recentTestArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* No Tests State - Only show when brand new user with no history */}
      {activeTests.length === 0 && !hasCompletedTests && (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateIcon}>📚</Text>
          <Text style={styles.emptyStateTitle}>Welcome to Your Dashboard</Text>
          <Text style={styles.emptyStateSubtitle}>
            Your performance analytics will appear here once you complete your first test.
          </Text>
          <Text style={styles.emptyStateHint}>
            Check back when your teacher assigns a test!
          </Text>
        </View>
      )}

      {/* Footer Info */}
      <View style={styles.footerInfo}>
        <Text style={styles.footerText}>
          Pull down to refresh • Data updates automatically
        </Text>
      </View>
    </ScrollView>
  );
};

export default Index;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  headerContent: {
    flex: 1,
  },
  greeting: {
    fontSize: 16,
    color: "#6b7280",
  },
  userName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginTop: 4,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  testsGrid: {
    gap: 16,
  },
  activeTestCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  testHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  subjectBadge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  subjectBadgeText: {
    color: "#2563eb",
    fontWeight: "600",
    fontSize: 13,
  },
  timeBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeBadgeText: {
    color: "#92400e",
    fontWeight: "600",
    fontSize: 12,
  },
  testTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  testMeta: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
  },
  testFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 16,
  },
  testButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  startButton: {
    backgroundColor: "#2563eb",
  },
  continueButton: {
    backgroundColor: "#059669",
  },
  completedButton: {
    backgroundColor: "#f3f4f6",
  },
  testButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  completedButtonText: {
    color: "#6b7280",
    fontWeight: "600",
    fontSize: 16,
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minHeight: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
    textAlign: "center",
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
    textAlign: "center",
  },
  trendCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  trendChart: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 120,
    marginBottom: 8,
  },
  trendBarContainer: {
    alignItems: "center",
    flex: 1,
  },
  trendBar: {
    width: 32,
    borderRadius: 6,
    marginBottom: 8,
    minHeight: 10,
  },
  trendBarLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  trendBarDate: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "center",
  },
  strengthWeaknessGrid: {
    gap: 16,
  },
  strengthCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d1fae5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  weaknessCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fef3c7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  swHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  swIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  swTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  swItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  swItemContent: {
    flex: 1,
    marginRight: 12,
  },
  swChapter: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  swSubject: {
    fontSize: 12,
    color: "#6b7280",
  },
  swAccuracyBadge: {
    backgroundColor: "#d1fae5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  swAccuracyBadgeWeak: {
    backgroundColor: "#fef3c7",
  },
  swAccuracyText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
  },
  swAccuracyTextWeak: {
    color: "#d97706",
  },
  insightsContainer: {
    gap: 12,
    marginTop: 12,
  },
  insightCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  insightIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  recommendationsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  recommendationItem: {
    flexDirection: "row",
    paddingVertical: 8,
  },
  recommendationBullet: {
    fontSize: 16,
    color: "#2563eb",
    marginRight: 10,
    fontWeight: "700",
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  recentTestsContainer: {
    gap: 12,
    marginTop: 12,
  },
  recentTestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  recentTestLeft: {
    marginRight: 14,
  },
  recentTestScoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  recentTestScore: {
    fontSize: 15,
    fontWeight: "700",
  },
  recentTestContent: {
    flex: 1,
  },
  recentTestName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  recentTestMeta: {
    fontSize: 13,
    color: "#2563eb",
    marginBottom: 2,
  },
  recentTestTime: {
    fontSize: 12,
    color: "#6b7280",
  },
  recentTestArrow: {
    fontSize: 18,
    color: "#2563eb",
    fontWeight: "600",
  },
  emptyStateCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyStateIcon: {
    fontSize: 56,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  emptyStateHint: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "500",
  },
  noActiveTestsCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  noActiveTestsIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  noActiveTestsText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  noActiveTestsSubtext: {
    fontSize: 13,
    color: "#6b7280",
  },
  footerInfo: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  footerText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
});
