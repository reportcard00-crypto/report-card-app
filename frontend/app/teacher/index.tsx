import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  listClassrooms,
  listTestSessions,
  listQuestionPapers,
  type ClassroomListItem,
  type TestSessionListItem,
  type QuestionPaperListItem,
} from "@/api/client";
import { useAuthStore, type AuthState } from "@/store/auth";
import { store } from "@/utils";

export default function TeacherDashboard() {
  const router = useRouter();
  const user = useAuthStore((s: AuthState) => s.user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [classrooms, setClassrooms] = useState<ClassroomListItem[]>([]);
  const [activeSessions, setActiveSessions] = useState<TestSessionListItem[]>([]);
  const [recentPapers, setRecentPapers] = useState<QuestionPaperListItem[]>([]);

  const fetchDashboardData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [classroomsResp, sessionsResp, papersResp] = await Promise.allSettled([
        listClassrooms({ limit: 5 }),
        listTestSessions({ limit: 5, status: "active" }),
        listQuestionPapers({ limit: 5 }),
      ]);

      if (classroomsResp.status === "fulfilled") {
        setClassrooms(classroomsResp.value.data);
      }
      if (sessionsResp.status === "fulfilled") {
        setActiveSessions(sessionsResp.value.data);
      }
      if (papersResp.status === "fulfilled") {
        setRecentPapers(papersResp.value.data);
      }
    } catch (e) {
      console.log("Error fetching teacher dashboard:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData(false);
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await store.delete("token");
          await store.delete("role");
          router.replace("/auth/Auth");
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return { bg: "#d1fae5", text: "#065f46" };
      case "assigned": return { bg: "#fef3c7", text: "#92400e" };
      case "completed": return { bg: "#dbeafe", text: "#1e40af" };
      default: return { bg: "#f3f4f6", text: "#374151" };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || "Teacher"} 👋</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </Pressable>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{classrooms.length}</Text>
          <Text style={styles.statLabel}>Classrooms</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeSessions.length}</Text>
          <Text style={styles.statLabel}>Active Tests</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{recentPapers.length}</Text>
          <Text style={styles.statLabel}>Papers</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <Pressable
            style={[styles.actionCard, { backgroundColor: "#eff6ff" }]}
            onPress={() => router.push("/teacher/classrooms" as any)}
          >
            <Text style={styles.actionEmoji}>🏫</Text>
            <Text style={styles.actionTitle}>Manage Classrooms</Text>
            <Text style={styles.actionDesc}>Create & manage your classrooms</Text>
          </Pressable>

          <Pressable
            style={[styles.actionCard, { backgroundColor: "#f0fdf4" }]}
            onPress={() => router.push("/teacher/papers" as any)}
          >
            <Text style={styles.actionEmoji}>📄</Text>
            <Text style={styles.actionTitle}>Question Papers</Text>
            <Text style={styles.actionDesc}>Upload & manage question papers</Text>
          </Pressable>

          <Pressable
            style={[styles.actionCard, { backgroundColor: "#fef3c7" }]}
            onPress={() => router.push("/teacher/test-sessions" as any)}
          >
            <Text style={styles.actionEmoji}>📝</Text>
            <Text style={styles.actionTitle}>Test Sessions</Text>
            <Text style={styles.actionDesc}>Assign & monitor tests</Text>
          </Pressable>
        </View>
      </View>

      {/* Active Test Sessions */}
      {activeSessions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.liveDot} />
              <Text style={styles.sectionTitle}>Active Tests</Text>
            </View>
            <Pressable onPress={() => router.push("/teacher/test-sessions" as any)}>
              <Text style={styles.seeAllText}>See all →</Text>
            </Pressable>
          </View>
          {activeSessions.map((session) => {
            const colors = getStatusColor(session.status);
            return (
              <View key={session._id} style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>{session.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      {session.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.sessionMeta}>
                  {session.classroom.name} • {session.completedCount}/{session.totalStudents} completed
                </Text>
                {session.endsAt && (
                  <Text style={styles.sessionTime}>
                    Ends: {new Date(session.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Recent Classrooms */}
      {classrooms.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Classrooms</Text>
            <Pressable onPress={() => router.push("/teacher/classrooms" as any)}>
              <Text style={styles.seeAllText}>See all →</Text>
            </Pressable>
          </View>
          {classrooms.slice(0, 3).map((classroom) => (
            <Pressable
              key={classroom._id}
              style={styles.classroomCard}
              onPress={() => router.push(`/teacher/classroom-details?id=${classroom._id}` as any)}
            >
              <View style={styles.classroomInfo}>
                <Text style={styles.classroomName}>{classroom.name}</Text>
                {classroom.description && (
                  <Text style={styles.classroomDesc} numberOfLines={1}>{classroom.description}</Text>
                )}
              </View>
              <View style={styles.studentsBadge}>
                <Text style={styles.studentsBadgeText}>{classroom.studentsCount}</Text>
                <Text style={styles.studentsBadgeLabel}>students</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Empty state */}
      {classrooms.length === 0 && activeSessions.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateEmoji}>🎓</Text>
          <Text style={styles.emptyStateTitle}>Get Started!</Text>
          <Text style={styles.emptyStateDesc}>
            Create your first classroom to start assigning tests to students.
          </Text>
          <Pressable
            style={styles.emptyStateBtn}
            onPress={() => router.push("/teacher/classrooms" as any)}
          >
            <Text style={styles.emptyStateBtnText}>Create Classroom</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

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
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingTop: 8,
  },
  headerContent: {},
  greeting: {
    fontSize: 14,
    color: "#6b7280",
  },
  userName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  logoutBtnText: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 13,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1e3a5f",
  },
  statLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  seeAllText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "600",
  },
  actionsGrid: {
    gap: 12,
  },
  actionCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  actionEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 13,
    color: "#6b7280",
  },
  sessionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  sessionMeta: {
    fontSize: 13,
    color: "#6b7280",
  },
  sessionTime: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  classroomCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  classroomInfo: {
    flex: 1,
    marginRight: 12,
  },
  classroomName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  classroomDesc: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  studentsBadge: {
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#7dd3fc",
  },
  studentsBadgeText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0369a1",
  },
  studentsBadgeLabel: {
    fontSize: 9,
    color: "#0369a1",
    textTransform: "uppercase",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  emptyStateDesc: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
  },
  emptyStateBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyStateBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
});
