import React, { useEffect, useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getTestDetail, type TestDetailData } from "@/api/client";
import FormattedText from "@/components/FormattedText";

export default function TestResultScreen() {
  const router = useRouter();
  const { id: testId } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TestDetailData | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "breakdown" | "review">("overview");

  useEffect(() => {
    const fetchResult = async () => {
      if (!testId) {
        Alert.alert("Error", "Invalid test ID");
        router.replace("/");
        return;
      }

      try {
        const resp = await getTestDetail(testId);
        setResult(resp.data);
      } catch (e: any) {
        Alert.alert(
          "Error",
          e?.response?.data?.message || "Failed to load results",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [testId, router]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}h ${remainMins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#10b981";
    if (score >= 60) return "#f59e0b";
    if (score >= 40) return "#f97316";
    return "#ef4444";
  };

  const getGrade = (score: number) => {
    if (score >= 90) return { grade: "A+", label: "Outstanding!" };
    if (score >= 80) return { grade: "A", label: "Excellent!" };
    if (score >= 70) return { grade: "B", label: "Great work!" };
    if (score >= 60) return { grade: "C", label: "Good effort!" };
    if (score >= 50) return { grade: "D", label: "Keep practicing!" };
    return { grade: "F", label: "Don't give up!" };
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case "easy": return "#10b981";
      case "medium": return "#f59e0b";
      case "hard": return "#ef4444";
      default: return "#6b7280";
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading results...</Text>
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Results not found</Text>
        <Pressable onPress={() => router.replace("/")} style={styles.homeBtn}>
          <Text style={styles.homeBtnText}>Go Home</Text>
        </Pressable>
      </View>
    );
  }

  const gradeInfo = getGrade(result.scorecard.score);
  const scoreColor = getScoreColor(result.scorecard.score);

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/")} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerLabel}>Test Result</Text>
          <Text style={styles.testTitle}>{result.testInfo.title}</Text>
          <Text style={styles.testMeta}>
            {result.testInfo.subject} • {result.testInfo.classroom}
          </Text>
        </View>
      </View>

      {/* Score Card */}
      <View style={styles.scoreCard}>
        <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>
            {result.scorecard.score}%
          </Text>
          <Text style={styles.gradeLabel}>{gradeInfo.grade}</Text>
        </View>
        <Text style={[styles.gradeMessage, { color: scoreColor }]}>{gradeInfo.label}</Text>
        <Text style={styles.submittedAt}>
          Submitted {new Date(result.testInfo.submittedAt).toLocaleString()}
        </Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStatsGrid}>
        <View style={styles.quickStatCard}>
          <View style={[styles.quickStatIcon, { backgroundColor: "rgba(16, 185, 129, 0.2)" }]}>
            <Text style={styles.quickStatEmoji}>✓</Text>
          </View>
          <Text style={[styles.quickStatValue, { color: "#10b981" }]}>
            {result.scorecard.correctAnswers}
          </Text>
          <Text style={styles.quickStatLabel}>Correct</Text>
        </View>
        <View style={styles.quickStatCard}>
          <View style={[styles.quickStatIcon, { backgroundColor: "rgba(239, 68, 68, 0.2)" }]}>
            <Text style={styles.quickStatEmoji}>✗</Text>
          </View>
          <Text style={[styles.quickStatValue, { color: "#ef4444" }]}>
            {result.scorecard.wrongAnswers}
          </Text>
          <Text style={styles.quickStatLabel}>Wrong</Text>
        </View>
        <View style={styles.quickStatCard}>
          <View style={[styles.quickStatIcon, { backgroundColor: "rgba(107, 114, 128, 0.2)" }]}>
            <Text style={styles.quickStatEmoji}>—</Text>
        </View>
          <Text style={styles.quickStatValue}>{result.scorecard.skipped}</Text>
          <Text style={styles.quickStatLabel}>Skipped</Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <Pressable 
          style={[styles.tab, activeTab === "overview" && styles.tabActive]}
          onPress={() => setActiveTab("overview")}
        >
          <Text style={[styles.tabText, activeTab === "overview" && styles.tabTextActive]}>
            Overview
          </Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, activeTab === "breakdown" && styles.tabActive]}
          onPress={() => setActiveTab("breakdown")}
        >
          <Text style={[styles.tabText, activeTab === "breakdown" && styles.tabTextActive]}>
            Breakdown
          </Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, activeTab === "review" && styles.tabActive]}
          onPress={() => setActiveTab("review")}
        >
          <Text style={[styles.tabText, activeTab === "review" && styles.tabTextActive]}>
            Review
          </Text>
        </Pressable>
      </View>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <View style={styles.tabContent}>
          {/* Detailed Scorecard */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scorecard</Text>
            <View style={styles.scorecardDetail}>
              <View style={styles.scorecardRow}>
                <Text style={styles.scorecardLabel}>Total Questions</Text>
                <Text style={styles.scorecardValue}>{result.scorecard.totalQuestions}</Text>
              </View>
              <View style={styles.scorecardRow}>
                <Text style={styles.scorecardLabel}>Attempted</Text>
                <Text style={styles.scorecardValue}>{result.scorecard.attemptedQuestions}</Text>
              </View>
              <View style={styles.scorecardRow}>
                <Text style={styles.scorecardLabel}>Accuracy (when attempted)</Text>
                <Text style={[styles.scorecardValue, { color: getScoreColor(result.scorecard.accuracy) }]}>
                  {result.scorecard.accuracy}%
                </Text>
              </View>
              <View style={styles.scorecardRow}>
                <Text style={styles.scorecardLabel}>Time Taken</Text>
                <Text style={styles.scorecardValue}>{formatTime(result.scorecard.timeTaken)}</Text>
              </View>
              <View style={styles.scorecardRow}>
                <Text style={styles.scorecardLabel}>Avg Time per Question</Text>
                <Text style={styles.scorecardValue}>{result.scorecard.avgTimePerQuestion}s</Text>
              </View>
            </View>
          </View>

          {/* Mistake Patterns */}
          {result.mistakePatterns.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mistake Patterns</Text>
              <View style={styles.mistakePatternsContainer}>
                {result.mistakePatterns.map((pattern, idx) => (
                  <View key={idx} style={styles.mistakePatternCard}>
                    <View style={styles.mistakePatternHeader}>
                      <Text style={styles.mistakePatternChapter}>{pattern.chapter}</Text>
                      <View style={styles.mistakeCountBadge}>
                        <Text style={styles.mistakeCountText}>{pattern.count} mistakes</Text>
                      </View>
                    </View>
                    {pattern.questions.map((q, qIdx) => (
                      <View key={qIdx} style={styles.mistakeExample}>
                        <Text style={styles.mistakeQuestionText} numberOfLines={2}>
                          {q.text}
                        </Text>
                        <View style={styles.mistakeAnswers}>
                          <Text style={styles.mistakeYourAnswer}>
                            Your answer: <Text style={styles.mistakeWrongText}>{q.yourAnswer}</Text>
                          </Text>
                          <Text style={styles.mistakeCorrectAnswer}>
                            Correct: <Text style={styles.mistakeCorrectText}>{q.correctAnswer}</Text>
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              <View style={styles.recommendationsCard}>
                {result.recommendations.map((rec, idx) => (
                  <View key={idx} style={styles.recommendationItem}>
                    <Text style={styles.recommendationBullet}>💡</Text>
                    <Text style={styles.recommendationText}>{rec}</Text>
                  </View>
                ))}
              </View>
        </View>
          )}
        </View>
      )}

      {/* Breakdown Tab */}
      {activeTab === "breakdown" && (
        <View style={styles.tabContent}>
          {/* Chapter-wise Breakdown */}
          {result.chapterBreakdown.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Chapter-wise Performance</Text>
              <View style={styles.breakdownContainer}>
                {result.chapterBreakdown.map((chapter, idx) => (
                  <View key={idx} style={styles.breakdownCard}>
                    <View style={styles.breakdownHeader}>
                      <View style={styles.breakdownTitleContainer}>
                        <Text style={styles.breakdownTitle}>{chapter.chapter}</Text>
                        <Text style={styles.breakdownSubject}>{chapter.subject}</Text>
        </View>
                      <View style={[
                        styles.breakdownAccuracyBadge,
                        { backgroundColor: `${getScoreColor(chapter.accuracy)}20` }
                      ]}>
                        <Text style={[styles.breakdownAccuracy, { color: getScoreColor(chapter.accuracy) }]}>
                          {chapter.accuracy}%
          </Text>
        </View>
      </View>
                    <View style={styles.breakdownStats}>
                      <View style={styles.breakdownStatItem}>
                        <Text style={[styles.breakdownStatValue, { color: "#10b981" }]}>
                          {chapter.correct}
                        </Text>
                        <Text style={styles.breakdownStatLabel}>Correct</Text>
                      </View>
                      <View style={styles.breakdownStatItem}>
                        <Text style={[styles.breakdownStatValue, { color: "#ef4444" }]}>
                          {chapter.wrong}
                        </Text>
                        <Text style={styles.breakdownStatLabel}>Wrong</Text>
                      </View>
                      <View style={styles.breakdownStatItem}>
                        <Text style={styles.breakdownStatValue}>{chapter.skipped}</Text>
                        <Text style={styles.breakdownStatLabel}>Skipped</Text>
                      </View>
                      <View style={styles.breakdownStatItem}>
                        <Text style={styles.breakdownStatValue}>{chapter.total}</Text>
                        <Text style={styles.breakdownStatLabel}>Total</Text>
                      </View>
                    </View>
                    {/* Progress bar */}
                    <View style={styles.progressBarContainer}>
                      <View style={styles.progressBar}>
                        <View 
                          style={[
                            styles.progressBarFill, 
                            { 
                              width: `${(chapter.correct / chapter.total) * 100}%`,
                              backgroundColor: "#10b981",
                            }
                          ]} 
                        />
                        <View 
                          style={[
                            styles.progressBarFill, 
                            { 
                              width: `${(chapter.wrong / chapter.total) * 100}%`,
                              backgroundColor: "#ef4444",
                            }
                          ]} 
                        />
                        <View 
                          style={[
                            styles.progressBarFill, 
                            { 
                              width: `${(chapter.skipped / chapter.total) * 100}%`,
                              backgroundColor: "#6b7280",
                            }
                          ]} 
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Question Type Breakdown */}
          {result.questionTypeBreakdown.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>By Question Type</Text>
              <View style={styles.typeBreakdownGrid}>
                {result.questionTypeBreakdown.map((type, idx) => (
                  <View key={idx} style={styles.typeBreakdownCard}>
                    <Text style={styles.typeBreakdownTitle}>{type.type}</Text>
                    <Text style={[styles.typeBreakdownAccuracy, { color: getScoreColor(type.accuracy) }]}>
                      {type.accuracy}%
                    </Text>
                    <Text style={styles.typeBreakdownStats}>
                      {type.correct}/{type.total} correct
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Difficulty Breakdown */}
          {result.difficultyBreakdown.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>By Difficulty</Text>
              <View style={styles.difficultyGrid}>
                {result.difficultyBreakdown.map((diff, idx) => (
                  <View key={idx} style={styles.difficultyCard}>
                    <View style={[
                      styles.difficultyBadge,
                      { backgroundColor: `${getDifficultyColor(diff.difficulty)}20` }
                    ]}>
                      <Text style={[styles.difficultyLabel, { color: getDifficultyColor(diff.difficulty) }]}>
                        {diff.difficulty}
                      </Text>
                    </View>
                    <Text style={[styles.difficultyAccuracy, { color: getScoreColor(diff.accuracy) }]}>
                      {diff.accuracy}%
                    </Text>
                    <View style={styles.difficultyStats}>
                      <Text style={styles.difficultyStatText}>
                        <Text style={{ color: "#10b981" }}>{diff.correct}</Text>
                        <Text style={{ color: "#6b7280" }}> / </Text>
                        <Text style={{ color: "#ef4444" }}>{diff.wrong}</Text>
                        <Text style={{ color: "#6b7280" }}> / </Text>
                        <Text>{diff.skipped}</Text>
                      </Text>
                      <Text style={styles.difficultyStatLabel}>C / W / S</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Review Tab */}
      {activeTab === "review" && (
        <View style={styles.tabContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Question Review</Text>
            <Text style={styles.reviewSubtitle}>
              Tap to expand each question
        </Text>
          </View>

        <View style={styles.answersSection}>
          {result.questions.map((q, idx) => {
            const isCorrect = q.isCorrect;
            const wasAttempted = q.selectedIndex !== null;
            
            return (
              <View key={q._id} style={styles.answerCard}>
                <View style={styles.answerHeader}>
                  <View style={[
                    styles.answerStatus,
                    isCorrect ? styles.answerCorrect : (wasAttempted ? styles.answerWrong : styles.answerSkipped)
                  ]}>
                    <Text style={styles.answerStatusText}>
                      {isCorrect ? "✓" : wasAttempted ? "✗" : "—"}
                    </Text>
                  </View>
                    <View style={styles.answerHeaderContent}>
                  <Text style={styles.answerNumber}>Question {idx + 1}</Text>
                      <View style={styles.answerMeta}>
                        {q.chapter && (
                          <Text style={styles.answerChapter}>{q.chapter}</Text>
                        )}
                        {q.difficulty && (
                          <View style={[
                            styles.answerDifficultyBadge,
                            { backgroundColor: `${getDifficultyColor(q.difficulty)}20` }
                          ]}>
                            <Text style={[
                              styles.answerDifficultyText,
                              { color: getDifficultyColor(q.difficulty) }
                            ]}>
                              {q.difficulty}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                </View>

                <View style={styles.answerQuestionContainer}>
                  <FormattedText content={q.text} fontSize={15} color="#111827" />
                </View>

                <View style={styles.answerOptions}>
                  {q.options.map((option, optIdx) => {
                    const isCorrectOption = optIdx === q.correctIndex;
                    const isSelectedOption = optIdx === q.selectedIndex;
                    
                    return (
                      <View 
                        key={optIdx}
                        style={[
                          styles.answerOption,
                          isCorrectOption && styles.answerOptionCorrect,
                          isSelectedOption && !isCorrectOption && styles.answerOptionWrong
                        ]}
                      >
                        <Text style={[
                          styles.answerOptionLetter,
                          isCorrectOption && styles.answerOptionLetterCorrect,
                          isSelectedOption && !isCorrectOption && styles.answerOptionLetterWrong
                        ]}>
                          {String.fromCharCode(65 + optIdx)}
                        </Text>
                        <View style={styles.answerOptionTextContainer}>
                          <FormattedText 
                            content={option} 
                            fontSize={14} 
                              color={isCorrectOption ? "#059669" : isSelectedOption ? "#dc2626" : "#374151"}
                          />
                        </View>
                        {isCorrectOption && (
                          <Text style={styles.correctLabel}>✓ Correct</Text>
                        )}
                        {isSelectedOption && !isCorrectOption && (
                          <Text style={styles.wrongLabel}>Your answer</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
          </View>
        </View>
      )}

      {/* Home Button */}
      <Pressable onPress={() => router.replace("/")} style={styles.homeButton}>
        <Text style={styles.homeButtonText}>Back to Dashboard</Text>
      </Pressable>
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
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: "#dc2626",
    marginBottom: 16,
  },
  homeBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  homeBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: "#2563eb",
    fontWeight: "500",
  },
  headerContent: {
    alignItems: "center",
  },
  headerLabel: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  testTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  testMeta: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  scoreCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  scoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "#f9fafb",
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: "800",
  },
  gradeLabel: {
    fontSize: 22,
    fontWeight: "700",
    color: "#6b7280",
    marginTop: -4,
  },
  gradeMessage: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  submittedAt: {
    fontSize: 12,
    color: "#6b7280",
  },
  quickStatsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
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
  quickStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickStatEmoji: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  quickStatLabel: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#2563eb",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  tabContent: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  reviewSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: -12,
    marginBottom: 8,
  },
  scorecardDetail: {
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
  scorecardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  scorecardLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  scorecardValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  mistakePatternsContainer: {
    gap: 16,
  },
  mistakePatternCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mistakePatternHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  mistakePatternChapter: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  mistakeCountBadge: {
    backgroundColor: "#fef2f2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mistakeCountText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  mistakeExample: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  mistakeQuestionText: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 8,
    lineHeight: 18,
  },
  mistakeAnswers: {
    gap: 4,
  },
  mistakeYourAnswer: {
    fontSize: 12,
    color: "#6b7280",
  },
  mistakeWrongText: {
    color: "#dc2626",
    fontWeight: "600",
  },
  mistakeCorrectAnswer: {
    fontSize: 12,
    color: "#6b7280",
  },
  mistakeCorrectText: {
    color: "#059669",
    fontWeight: "600",
  },
  recommendationsCard: {
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
  recommendationItem: {
    flexDirection: "row",
    paddingVertical: 10,
  },
  recommendationBullet: {
    fontSize: 16,
    marginRight: 12,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  breakdownContainer: {
    gap: 16,
  },
  breakdownCard: {
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
  breakdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  breakdownTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  breakdownSubject: {
    fontSize: 12,
    color: "#6b7280",
  },
  breakdownAccuracyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  breakdownAccuracy: {
    fontSize: 16,
    fontWeight: "700",
  },
  breakdownStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  breakdownStatItem: {
    alignItems: "center",
  },
  breakdownStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  breakdownStatLabel: {
    fontSize: 11,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBar: {
    flexDirection: "row",
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
  },
  typeBreakdownGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  typeBreakdownCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 14,
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
  typeBreakdownTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  typeBreakdownAccuracy: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  typeBreakdownStats: {
    fontSize: 12,
    color: "#6b7280",
  },
  difficultyGrid: {
    flexDirection: "row",
    gap: 12,
  },
  difficultyCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
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
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  difficultyLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  difficultyAccuracy: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  difficultyStats: {
    alignItems: "center",
  },
  difficultyStatText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  difficultyStatLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
  },
  answersSection: {
    gap: 16,
  },
  answerCard: {
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
  answerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  answerStatus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  answerCorrect: {
    backgroundColor: "#d1fae5",
  },
  answerWrong: {
    backgroundColor: "#fecaca",
  },
  answerSkipped: {
    backgroundColor: "#e5e7eb",
  },
  answerStatusText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  answerHeaderContent: {
    flex: 1,
  },
  answerNumber: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  answerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  answerChapter: {
    fontSize: 12,
    color: "#6b7280",
  },
  answerDifficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  answerDifficultyText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  answerQuestionContainer: {
    marginBottom: 12,
  },
  answerOptions: {
    gap: 8,
  },
  answerOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  answerOptionCorrect: {
    backgroundColor: "#d1fae5",
    borderColor: "#6ee7b7",
  },
  answerOptionWrong: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  answerOptionLetter: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    width: 24,
  },
  answerOptionLetterCorrect: {
    color: "#059669",
  },
  answerOptionLetterWrong: {
    color: "#dc2626",
  },
  answerOptionTextContainer: {
    flex: 1,
  },
  correctLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#059669",
    marginLeft: 8,
  },
  wrongLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#dc2626",
    marginLeft: 8,
  },
  homeButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  homeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
