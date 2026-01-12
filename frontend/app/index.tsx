import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Pressable, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import apiClient, { getActiveTests, type ActiveTest } from "@/api/client";
import { useAuthStore, type AuthState, type AuthUser } from "../store/auth";
import type { ProfileStatusResponse } from "@/types/api";

const Index = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTests, setActiveTests] = useState<ActiveTest[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
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
        // Fetch active tests once authenticated
        fetchActiveTests(true);
      } catch {
        router.replace("/auth/Auth");
      }
    };
    checkAuth();
  }, [router, setUser, setProfileStatus, fetchActiveTests]);

  // Poll for active tests every 5 seconds
  useEffect(() => {
    if (!loading && user) {
      // Start polling
      pollIntervalRef.current = setInterval(() => {
        fetchActiveTests(false);
      }, 3000);

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

  const handleStartTest = (test: ActiveTest) => {
    router.push(`/test/${test._id}` as any);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563eb"]} />
      }
    >
      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeText}>Welcome back,</Text>
        <Text style={styles.userName}>{user?.name || "Student"}</Text>
      </View>

      {/* Active Tests Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available Tests</Text>
          {loadingTests && <ActivityIndicator size="small" color="#6b7280" />}
        </View>

        {activeTests.length === 0 ? (
          <View style={styles.noTestsCard}>
            <Text style={styles.noTestsIcon}>📝</Text>
            <Text style={styles.noTestsTitle}>No Active Tests</Text>
            <Text style={styles.noTestsSubtitle}>
              You don&apos;t have any tests available right now. Check back later!
            </Text>
          </View>
        ) : (
          <View style={styles.testsGrid}>
            {activeTests.map((test) => (
              <View key={test._id} style={styles.testCard}>
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
        )}
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoText}>
          Tests are automatically refreshed every 3 seconds. Pull down to refresh manually.
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
  welcomeSection: {
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 16,
    color: "#6b7280",
  },
  userName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginTop: 4,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  noTestsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  noTestsIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noTestsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  noTestsSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  testsGrid: {
    gap: 16,
  },
  testCard: {
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
  infoSection: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 18,
  },
});
