import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { store } from "@/utils";
import {
  getTeacherAnalytics,
  getAdminAnalytics,
  getTestOverviewData,
  listUsers,
  type TeacherAnalyticsData,
  type AdminAnalyticsData,
  type TestOverviewData,
  type AdminUser,
} from "@/api/admin";

type ViewMode = "teacher" | "admin";

export default function AnalyticsScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("teacher");
  const [loading, setLoading] = useState(true);

  // Teacher analytics state
  const [teacherData, setTeacherData] = useState<TeacherAnalyticsData | null>(null);

  // Admin analytics state
  const [adminData, setAdminData] = useState<AdminAnalyticsData | null>(null);

  // Test overview state
  const [testOverview, setTestOverview] = useState<TestOverviewData | null>(null);
  const [showTestOverview, setShowTestOverview] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  // Teacher selection state (for admin)
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [showTeacherPicker, setShowTeacherPicker] = useState(false);

  useEffect(() => {
    (async () => {
      const role = await store.get("role");
      setUserRole(role);
      // Admin sees teacher view by default, teacher sees teacher view
      setViewMode(role === "admin" ? "teacher" : "teacher");
      setReady(true);
      
      // Fetch teachers list for admin
      if (role === "admin") {
        try {
          const resp = await listUsers({ role: "teacher", limit: 100 });
          setTeachers(resp.data);
        } catch (e) {
          console.error("Failed to fetch teachers:", e);
        }
      }
    })();
  }, []);

  const fetchTeacherAnalytics = useCallback(async (teacherId?: string | null) => {
    setLoading(true);
    try {
      const resp = await getTeacherAnalytics({ teacherId: teacherId || undefined });
      setTeacherData(resp.data);
    } catch (e) {
      console.error("Failed to fetch teacher analytics:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdminAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getAdminAnalytics();
      setAdminData(resp.data);
    } catch (e) {
      console.error("Failed to fetch admin analytics:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTestOverview = useCallback(async (testId?: string) => {
    try {
      const resp = await getTestOverviewData({ testId });
      setTestOverview(resp.data);
      setShowTestOverview(true);
    } catch (e) {
      console.error("Failed to fetch test overview:", e);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (viewMode === "teacher") {
      fetchTeacherAnalytics(selectedTeacherId);
    } else {
      fetchAdminAnalytics();
    }
  }, [ready, viewMode, selectedTeacherId, fetchTeacherAnalytics, fetchAdminAnalytics]);

  const handleSelectTeacher = (teacherId: string | null) => {
    setSelectedTeacherId(teacherId);
    setShowTeacherPicker(false);
  };

  const getSelectedTeacherName = () => {
    if (!selectedTeacherId) return "All Teachers";
    const teacher = teachers.find(t => t._id === selectedTeacherId);
    return teacher?.name || teacher?.phone || "Unknown Teacher";
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#059669";
    if (score >= 60) return "#d97706";
    if (score >= 40) return "#ea580c";
    return "#dc2626";
  };

  const getTrendColor = (trend: "improving" | "declining" | "stable" | number) => {
    if (trend === "improving" || (typeof trend === "number" && trend > 0)) return "#059669";
    if (trend === "declining" || (typeof trend === "number" && trend < 0)) return "#dc2626";
    return "#6b7280";
  };

  const getTrendIcon = (trend: "improving" | "declining" | "stable" | number) => {
    if (trend === "improving" || (typeof trend === "number" && trend > 0)) return "↗";
    if (trend === "declining" || (typeof trend === "number" && trend < 0)) return "↘";
    return "→";
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (!ready || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Analytics...</Text>
      </View>
    );
  }

  const isAdmin = userRole === "admin";

  // Test Overview Modal/Screen
  if (showTestOverview && testOverview) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Pressable onPress={() => setShowTestOverview(false)} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back to Overview</Text>
          </Pressable>
        </View>

        {testOverview.testSession ? (
          <>
            <Text style={styles.pageTitle}>{testOverview.testSession.title}</Text>
            <Text style={styles.pageSubtitle}>
              {testOverview.testSession.subject} • {testOverview.testSession.participated}/{testOverview.testSession.totalStudents} participated
            </Text>

            <Text style={styles.sectionTitle}>Student Performance</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Student</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Score</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Accuracy</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Weak Areas</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Time</Text>
            </View>

            {testOverview.students.map((student, idx) => (
              <View key={student._id || idx} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentPhone}>{student.phone}</Text>
                </View>
                <Text style={[styles.tableCell, { flex: 1, color: getScoreColor(student.score) }]}>
                  {student.score}%
                </Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{student.accuracy}%</Text>
                <View style={{ flex: 2 }}>
                  {student.weakChapters.length > 0 ? (
                    student.weakChapters.map((ch, i) => (
                      <Text key={i} style={styles.weakChapterTag}>{ch}</Text>
                    ))
                  ) : (
                    <Text style={styles.tableCell}>-</Text>
                  )}
                </View>
                <Text style={[styles.tableCell, { flex: 1 }]}>{formatTime(student.timeUsed)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No test data available</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* View Mode Toggle - Only for Admin */}
      {isAdmin && (
        <View style={styles.viewToggleContainer}>
          <Pressable
            onPress={() => setViewMode("teacher")}
            style={[styles.viewToggleBtn, viewMode === "teacher" && styles.viewToggleBtnActive]}
          >
            <Text style={[styles.viewToggleText, viewMode === "teacher" && styles.viewToggleTextActive]}>
              📊 Teacher Analytics
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("admin")}
            style={[styles.viewToggleBtn, viewMode === "admin" && styles.viewToggleBtnActive]}
          >
            <Text style={[styles.viewToggleText, viewMode === "admin" && styles.viewToggleTextActive]}>
              🏫 Admin Analytics
            </Text>
          </Pressable>
        </View>
      )}

      {/* Teacher Dashboard */}
      {viewMode === "teacher" && teacherData && (
        <>
          <View style={styles.pageTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageTitle}>Teacher Dashboard</Text>
              <Text style={styles.pageSubtitle}>How is your class doing overall?</Text>
            </View>
            
            {/* Teacher Selector (Admin only) */}
            {isAdmin && (
              <Pressable
                style={styles.teacherSelector}
                onPress={() => setShowTeacherPicker(true)}
              >
                <Text style={styles.teacherSelectorLabel}>Viewing:</Text>
                <Text style={styles.teacherSelectorValue}>{getSelectedTeacherName()}</Text>
                <Text style={styles.teacherSelectorIcon}>▼</Text>
              </Pressable>
            )}
          </View>

          {/* Teacher Picker Modal */}
          {isAdmin && (
            <Modal
              visible={showTeacherPicker}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowTeacherPicker(false)}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setShowTeacherPicker(false)}
              >
                <View style={styles.pickerModal}>
                  <Text style={styles.pickerTitle}>Select Teacher</Text>
                  
                  <ScrollView style={styles.pickerList}>
                    <Pressable
                      style={[
                        styles.pickerItem,
                        !selectedTeacherId && styles.pickerItemActive
                      ]}
                      onPress={() => handleSelectTeacher(null)}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        !selectedTeacherId && styles.pickerItemTextActive
                      ]}>
                        All Teachers
                      </Text>
                      {!selectedTeacherId && <Text style={styles.pickerCheck}>✓</Text>}
                    </Pressable>
                    
                    {teachers.map((teacher) => (
                      <Pressable
                        key={teacher._id}
                        style={[
                          styles.pickerItem,
                          selectedTeacherId === teacher._id && styles.pickerItemActive
                        ]}
                        onPress={() => handleSelectTeacher(teacher._id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[
                            styles.pickerItemText,
                            selectedTeacherId === teacher._id && styles.pickerItemTextActive
                          ]}>
                            {teacher.name || "Unnamed Teacher"}
                          </Text>
                          <Text style={styles.pickerItemSubtext}>{teacher.phone}</Text>
                        </View>
                        {selectedTeacherId === teacher._id && <Text style={styles.pickerCheck}>✓</Text>}
                      </Pressable>
                    ))}
                  </ScrollView>
                  
                  <Pressable
                    style={styles.pickerCloseBtn}
                    onPress={() => setShowTeacherPicker(false)}
                  >
                    <Text style={styles.pickerCloseBtnText}>Close</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Modal>
          )}

          {/* Insights Banner */}
          {teacherData.insights.length > 0 && (
            <View style={styles.insightsContainer}>
              <Text style={styles.insightsTitle}>💡 Insights</Text>
              {teacherData.insights.map((insight, idx) => (
                <View key={idx} style={styles.insightItem}>
                  <Text style={styles.insightBullet}>•</Text>
                  <Text style={styles.insightText}>{insight}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Latest Test Snapshot */}
          {teacherData.latestTestSnapshot && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Latest Test Snapshot</Text>
              <Pressable
                style={styles.latestTestCard}
                onPress={() => fetchTestOverview()}
              >
                <View style={styles.latestTestHeader}>
                  <Text style={styles.latestTestName}>{teacherData.latestTestSnapshot.testName}</Text>
                  <Text style={styles.latestTestSubject}>{teacherData.latestTestSnapshot.subject}</Text>
                </View>
                <View style={styles.latestTestStats}>
                  <View style={styles.latestTestStat}>
                    <Text style={[styles.latestTestStatValue, { color: getScoreColor(teacherData.latestTestSnapshot.avgScore) }]}>
                      {teacherData.latestTestSnapshot.avgScore}%
                    </Text>
                    <Text style={styles.latestTestStatLabel}>Avg Score</Text>
                  </View>
                  <View style={styles.latestTestStat}>
                    <Text style={styles.latestTestStatValue}>
                      {teacherData.latestTestSnapshot.participationRate}%
                    </Text>
                    <Text style={styles.latestTestStatLabel}>Participation</Text>
                  </View>
                  <View style={styles.latestTestStat}>
                    <Text style={styles.latestTestStatValue}>
                      {teacherData.latestTestSnapshot.participated}/{teacherData.latestTestSnapshot.totalStudents}
                    </Text>
                    <Text style={styles.latestTestStatLabel}>Students</Text>
                  </View>
                </View>
                <Text style={styles.viewDetailsLink}>View Details →</Text>
              </Pressable>
            </View>
          )}

          {/* Class Trend */}
          {teacherData.classTrend.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Class Trend (Last {teacherData.classTrend.length} Tests)</Text>
              <View style={styles.trendContainer}>
                {teacherData.classTrend.map((item, idx) => (
                  <View key={idx} style={styles.trendItem}>
                    <View style={[styles.trendBar, { height: `${Math.max(item.avgScore, 10)}%` }]}>
                      <Text style={styles.trendBarValue}>{item.avgScore}%</Text>
                    </View>
                    <Text style={styles.trendLabel} numberOfLines={1}>{item.testName.slice(0, 8)}...</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Weak Chapters */}
          {teacherData.weakChapters.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚠️ Weak Chapters (Class Level)</Text>
              <View style={styles.weakChaptersGrid}>
                {teacherData.weakChapters.map((ch, idx) => (
                  <View key={idx} style={styles.weakChapterCard}>
                    <Text style={styles.weakChapterName}>{ch.chapter}</Text>
                    <Text style={styles.weakChapterSubject}>{ch.subject}</Text>
                    <View style={styles.weakChapterStats}>
                      <Text style={[styles.weakChapterAccuracy, { color: getScoreColor(ch.accuracy) }]}>
                        {ch.accuracy}% accuracy
                      </Text>
                      <Text style={styles.weakChapterAttempts}>{ch.totalAttempts} attempts</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Student Segmentation */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Student Segmentation</Text>
            <View style={styles.segmentationContainer}>
              {/* Top Performers */}
              <View style={styles.segmentCard}>
                <View style={[styles.segmentHeader, { backgroundColor: "#d1fae5" }]}>
                  <Text style={styles.segmentHeaderIcon}>⭐</Text>
                  <Text style={[styles.segmentHeaderText, { color: "#065f46" }]}>Top Performers</Text>
                </View>
                {teacherData.studentSegmentation.topPerformers.length > 0 ? (
                  teacherData.studentSegmentation.topPerformers.map((student, idx) => (
                    <View key={idx} style={styles.segmentStudent}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.segmentStudentName}>{student.name}</Text>
                        <Text style={styles.segmentStudentMeta}>{student.testsTaken} tests</Text>
                      </View>
                      <View style={styles.segmentStudentScore}>
                        <Text style={[styles.segmentStudentScoreValue, { color: "#059669" }]}>
                          {student.avgScore}%
                        </Text>
                        <Text style={[styles.segmentStudentTrend, { color: getTrendColor(student.trend) }]}>
                          {getTrendIcon(student.trend)} {Math.abs(student.trend)}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.segmentEmpty}>No top performers yet</Text>
                )}
              </View>

              {/* At-Risk Students */}
              <View style={styles.segmentCard}>
                <View style={[styles.segmentHeader, { backgroundColor: "#fee2e2" }]}>
                  <Text style={styles.segmentHeaderIcon}>⚠️</Text>
                  <Text style={[styles.segmentHeaderText, { color: "#991b1b" }]}>At-Risk Students</Text>
                </View>
                {teacherData.studentSegmentation.atRiskStudents.length > 0 ? (
                  teacherData.studentSegmentation.atRiskStudents.map((student, idx) => (
                    <View key={idx} style={styles.segmentStudent}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.segmentStudentName}>{student.name}</Text>
                        <Text style={styles.segmentStudentMeta}>{student.testsTaken} tests</Text>
                      </View>
                      <View style={styles.segmentStudentScore}>
                        <Text style={[styles.segmentStudentScoreValue, { color: "#dc2626" }]}>
                          {student.avgScore}%
                        </Text>
                        <Text style={[styles.segmentStudentTrend, { color: getTrendColor(student.trend) }]}>
                          {getTrendIcon(student.trend)} {Math.abs(student.trend)}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.segmentEmpty}>No at-risk students 🎉</Text>
                )}
              </View>
            </View>
          </View>
        </>
      )}

      {/* Admin Dashboard */}
      {viewMode === "admin" && adminData && (
        <>
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.pageTitle}>School Admin Dashboard</Text>
            <Text style={styles.pageSubtitle}>Is the system working and are results improving?</Text>
          </View>

          {/* Admin Insights */}
          {adminData.insights.length > 0 && (
            <View style={styles.insightsContainer}>
              <Text style={styles.insightsTitle}>💡 Admin Insights</Text>
              {adminData.insights.map((insight, idx) => (
                <View key={idx} style={styles.insightItem}>
                  <Text style={styles.insightBullet}>•</Text>
                  <Text style={styles.insightText}>{insight}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Overview Stats */}
          <View style={styles.overviewGrid}>
            <View style={[styles.overviewCard, { backgroundColor: "#ede9fe" }]}>
              <Text style={[styles.overviewValue, { color: "#7c3aed" }]}>{adminData.overview.totalTests}</Text>
              <Text style={styles.overviewLabel}>Total Tests</Text>
            </View>
            <View style={[styles.overviewCard, { backgroundColor: "#dbeafe" }]}>
              <Text style={[styles.overviewValue, { color: "#2563eb" }]}>{adminData.overview.totalStudents}</Text>
              <Text style={styles.overviewLabel}>Total Students</Text>
            </View>
            <View style={[styles.overviewCard, { backgroundColor: "#fef3c7" }]}>
              <Text style={[styles.overviewValue, { color: "#d97706" }]}>{adminData.overview.totalTeachers}</Text>
              <Text style={styles.overviewLabel}>Total Teachers</Text>
            </View>
            <View style={[styles.overviewCard, { backgroundColor: "#d1fae5" }]}>
              <Text style={[styles.overviewValue, { color: "#059669" }]}>{adminData.overview.totalClassrooms}</Text>
              <Text style={styles.overviewLabel}>Classrooms</Text>
            </View>
          </View>

          {/* Subject Tiles */}
          {adminData.subjectTiles.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Subject Performance</Text>
              <View style={styles.subjectTilesGrid}>
                {adminData.subjectTiles.map((subject, idx) => (
                  <View key={idx} style={styles.subjectTile}>
                    <View style={styles.subjectTileHeader}>
                      <Text style={styles.subjectTileName}>{subject.subject}</Text>
                      <View style={[styles.trendBadge, { backgroundColor: getTrendColor(subject.trend) + "20" }]}>
                        <Text style={[styles.trendBadgeText, { color: getTrendColor(subject.trend) }]}>
                          {getTrendIcon(subject.trend)} {subject.trend}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.subjectTileStats}>
                      <View style={styles.subjectTileStat}>
                        <Text style={[styles.subjectTileStatValue, { color: getScoreColor(subject.avgScore) }]}>
                          {subject.avgScore}%
                        </Text>
                        <Text style={styles.subjectTileStatLabel}>Avg (last 5)</Text>
                      </View>
                      <View style={styles.subjectTileStat}>
                        <Text style={styles.subjectTileStatValue}>{subject.participation}%</Text>
                        <Text style={styles.subjectTileStatLabel}>Participation</Text>
                      </View>
                      <View style={styles.subjectTileStat}>
                        <Text style={styles.subjectTileStatValue}>{subject.testCount}</Text>
                        <Text style={styles.subjectTileStatLabel}>Tests</Text>
                      </View>
                    </View>
                    {/* Mini trend chart */}
                    <View style={styles.miniTrendChart}>
                      {subject.recentScores.slice().reverse().map((score, i) => (
                        <View
                          key={i}
                          style={[
                            styles.miniTrendBar,
                            {
                              height: `${Math.max(score, 10)}%`,
                              backgroundColor: getScoreColor(score) + "80",
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Teacher Overview */}
          {adminData.teacherOverview.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Teacher Overview</Text>
              <View style={styles.teacherGrid}>
                {adminData.teacherOverview.map((teacher, idx) => {
                  const isActive = teacher.lastTestDate &&
                    (Date.now() - new Date(teacher.lastTestDate).getTime()) / (1000 * 60 * 60 * 24) < 14;
                  return (
                    <View key={idx} style={styles.teacherCard}>
                      <View style={styles.teacherCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.teacherName}>{teacher.name}</Text>
                          <Text style={styles.teacherPhone}>{teacher.phone}</Text>
                        </View>
                        <View style={[styles.activityBadge, { backgroundColor: isActive ? "#d1fae5" : "#fee2e2" }]}>
                          <View style={[styles.activityDot, { backgroundColor: isActive ? "#059669" : "#dc2626" }]} />
                          <Text style={[styles.activityText, { color: isActive ? "#065f46" : "#991b1b" }]}>
                            {isActive ? "Active" : "Inactive"}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.teacherStats}>
                        <View style={styles.teacherStat}>
                          <Text style={styles.teacherStatValue}>{teacher.testsCount}</Text>
                          <Text style={styles.teacherStatLabel}>Tests</Text>
                        </View>
                        <View style={styles.teacherStat}>
                          <Text style={[styles.teacherStatValue, { color: getScoreColor(teacher.avgScore) }]}>
                            {teacher.avgScore}%
                          </Text>
                          <Text style={styles.teacherStatLabel}>Avg Score</Text>
                        </View>
                        <View style={styles.teacherStat}>
                          <Text style={[styles.teacherStatValue, { color: getTrendColor(teacher.trend) }]}>
                            {getTrendIcon(teacher.trend)}
                          </Text>
                          <Text style={styles.teacherStatLabel}>Trend</Text>
                        </View>
                      </View>
                      {teacher.lastTestDate && (
                        <Text style={styles.lastTestDate}>
                          Last test: {new Date(teacher.lastTestDate).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      {/* Empty State */}
      {((viewMode === "teacher" && !teacherData?.latestTestSnapshot && teacherData?.classTrend.length === 0) ||
        (viewMode === "admin" && adminData?.subjectTiles.length === 0)) && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📊</Text>
          <Text style={styles.emptyStateTitle}>No Analytics Data Yet</Text>
          <Text style={styles.emptyStateText}>
            {viewMode === "teacher"
              ? "Start conducting tests to see analytics about your class performance."
              : "Analytics will appear once teachers start conducting tests."}
          </Text>
    </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  contentContainer: { padding: 20, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" },
  loadingText: { marginTop: 12, color: "#6b7280", fontSize: 14 },

  // Header
  header: { marginBottom: 16 },
  backLink: { paddingVertical: 4 },
  backLinkText: { color: "#6366f1", fontWeight: "600" },

  // View Toggle
  viewToggleContainer: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  viewToggleBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  viewToggleText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  viewToggleTextActive: { color: "#6366f1" },

  // Page Title
  pageTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: "700", color: "#1e293b", marginBottom: 4 },
  pageSubtitle: { fontSize: 15, color: "#64748b" },

  // Teacher Selector
  teacherSelector: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  teacherSelectorLabel: { fontSize: 11, color: "#64748b" },
  teacherSelectorValue: { fontSize: 13, fontWeight: "600", color: "#1e293b", maxWidth: 120 },
  teacherSelectorIcon: { fontSize: 10, color: "#64748b" },

  // Picker Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  pickerModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    maxHeight: "70%",
    overflow: "hidden",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  pickerList: { maxHeight: 400 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  pickerItemActive: { backgroundColor: "#f0f9ff" },
  pickerItemText: { fontSize: 15, color: "#1e293b", fontWeight: "500" },
  pickerItemTextActive: { color: "#2563eb", fontWeight: "600" },
  pickerItemSubtext: { fontSize: 12, color: "#64748b", marginTop: 2 },
  pickerCheck: { color: "#2563eb", fontWeight: "700", fontSize: 16 },
  pickerCloseBtn: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 14,
    alignItems: "center",
  },
  pickerCloseBtnText: { fontSize: 15, fontWeight: "600", color: "#64748b" },

  // Section
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#334155", marginBottom: 14 },

  // Insights
  insightsContainer: {
    backgroundColor: "#fef3c7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
  },
  insightsTitle: { fontSize: 15, fontWeight: "700", color: "#92400e", marginBottom: 10 },
  insightItem: { flexDirection: "row", marginBottom: 6 },
  insightBullet: { color: "#d97706", marginRight: 8, fontWeight: "700" },
  insightText: { flex: 1, color: "#78350f", fontSize: 14, lineHeight: 20 },

  // Latest Test Card
  latestTestCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  latestTestHeader: { marginBottom: 16 },
  latestTestName: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  latestTestSubject: { fontSize: 13, color: "#64748b", marginTop: 2 },
  latestTestStats: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  latestTestStat: { alignItems: "center" },
  latestTestStatValue: { fontSize: 28, fontWeight: "700", color: "#1e293b" },
  latestTestStatLabel: { fontSize: 12, color: "#64748b", marginTop: 2 },
  viewDetailsLink: { color: "#6366f1", fontWeight: "600", textAlign: "center" },

  // Trend Chart
  trendContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: 140,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  trendItem: { alignItems: "center", flex: 1 },
  trendBar: {
    width: 36,
    backgroundColor: "#6366f1",
    borderRadius: 6,
    minHeight: 10,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 4,
  },
  trendBarValue: { color: "#fff", fontSize: 10, fontWeight: "700" },
  trendLabel: { fontSize: 10, color: "#64748b", marginTop: 6, textAlign: "center" },

  // Weak Chapters
  weakChaptersGrid: { gap: 10 },
  weakChapterCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
  },
  weakChapterName: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  weakChapterSubject: { fontSize: 12, color: "#64748b", marginTop: 2 },
  weakChapterStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  weakChapterAccuracy: { fontSize: 13, fontWeight: "600" },
  weakChapterAttempts: { fontSize: 12, color: "#64748b" },
  weakChapterTag: { fontSize: 11, color: "#dc2626", backgroundColor: "#fef2f2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 4, marginBottom: 4 },

  // Student Segmentation
  segmentationContainer: { gap: 16 },
  segmentCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  segmentHeader: { flexDirection: "row", alignItems: "center", padding: 12 },
  segmentHeaderIcon: { fontSize: 16, marginRight: 8 },
  segmentHeaderText: { fontSize: 14, fontWeight: "700" },
  segmentStudent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  segmentStudentName: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  segmentStudentMeta: { fontSize: 11, color: "#64748b", marginTop: 1 },
  segmentStudentScore: { alignItems: "flex-end" },
  segmentStudentScoreValue: { fontSize: 18, fontWeight: "700" },
  segmentStudentTrend: { fontSize: 11, fontWeight: "600" },
  segmentEmpty: { padding: 16, textAlign: "center", color: "#64748b", fontStyle: "italic" },

  // Overview Grid
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  overviewCard: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  overviewValue: { fontSize: 32, fontWeight: "800" },
  overviewLabel: { fontSize: 12, color: "#64748b", marginTop: 4 },

  // Subject Tiles
  subjectTilesGrid: { gap: 14 },
  subjectTile: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  subjectTileHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  subjectTileName: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  trendBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  trendBadgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  subjectTileStats: { flexDirection: "row", justifyContent: "space-around", marginBottom: 14 },
  subjectTileStat: { alignItems: "center" },
  subjectTileStatValue: { fontSize: 22, fontWeight: "700", color: "#1e293b" },
  subjectTileStatLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  miniTrendChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    height: 40,
    gap: 6,
  },
  miniTrendBar: { width: 20, borderRadius: 4, minHeight: 4 },

  // Teacher Grid
  teacherGrid: { gap: 14 },
  teacherCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  teacherCardHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  teacherName: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  teacherPhone: { fontSize: 12, color: "#64748b", marginTop: 2 },
  activityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activityDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  activityText: { fontSize: 11, fontWeight: "600" },
  teacherStats: { flexDirection: "row", justifyContent: "space-around" },
  teacherStat: { alignItems: "center" },
  teacherStatValue: { fontSize: 20, fontWeight: "700", color: "#1e293b" },
  teacherStatLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  lastTestDate: { fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 12 },

  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 4,
  },
  tableHeaderCell: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tableRowEven: { backgroundColor: "#fafafa" },
  tableCell: { fontSize: 14, color: "#374151" },
  studentName: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  studentPhone: { fontSize: 11, color: "#64748b" },

  // Empty State
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyStateIcon: { fontSize: 48, marginBottom: 16 },
  emptyStateTitle: { fontSize: 20, fontWeight: "700", color: "#1e293b", marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: "#64748b", textAlign: "center", maxWidth: 280 },
});