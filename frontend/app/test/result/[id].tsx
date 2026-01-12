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
import { getTestResult, type TestResultData } from "@/api/client";

export default function TestResultScreen() {
  const router = useRouter();
  const { id: testId } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TestResultData | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    const fetchResult = async () => {
      if (!testId) {
        Alert.alert("Error", "Invalid test ID");
        router.replace("/");
        return;
      }

      try {
        const resp = await getTestResult(testId);
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
    if (score >= 80) return "#059669";
    if (score >= 60) return "#d97706";
    if (score >= 40) return "#ea580c";
    return "#dc2626";
  };

  const getGrade = (score: number) => {
    if (score >= 90) return { grade: "A+", label: "Excellent!" };
    if (score >= 80) return { grade: "A", label: "Great job!" };
    if (score >= 70) return { grade: "B", label: "Good work!" };
    if (score >= 60) return { grade: "C", label: "Keep practicing!" };
    if (score >= 50) return { grade: "D", label: "Needs improvement" };
    return { grade: "F", label: "Keep trying!" };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
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

  const gradeInfo = getGrade(result.score);
  const scoreColor = getScoreColor(result.score);

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Test Completed!</Text>
        <Text style={styles.testTitle}>{result.testTitle}</Text>
      </View>

      {/* Score Card */}
      <View style={styles.scoreCard}>
        <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>{result.score}%</Text>
          <Text style={styles.gradeLabel}>{gradeInfo.grade}</Text>
        </View>
        <Text style={[styles.gradeMessage, { color: scoreColor }]}>{gradeInfo.label}</Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#059669" }]}>{result.correctAnswers}</Text>
          <Text style={styles.statLabel}>Correct</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#dc2626" }]}>{result.wrongAnswers}</Text>
          <Text style={styles.statLabel}>Wrong</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{result.attemptedQuestions}</Text>
          <Text style={styles.statLabel}>Attempted</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatTime(result.timeTaken)}</Text>
          <Text style={styles.statLabel}>Time Taken</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Questions</Text>
          <Text style={styles.summaryValue}>{result.totalQuestions}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Questions Attempted</Text>
          <Text style={styles.summaryValue}>{result.attemptedQuestions}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Questions Skipped</Text>
          <Text style={styles.summaryValue}>{result.totalQuestions - result.attemptedQuestions}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Accuracy</Text>
          <Text style={styles.summaryValue}>
            {result.attemptedQuestions > 0 
              ? Math.round((result.correctAnswers / result.attemptedQuestions) * 100) 
              : 0}%
          </Text>
        </View>
      </View>

      {/* Review Answers Toggle */}
      <Pressable 
        onPress={() => setShowAnswers(!showAnswers)} 
        style={styles.reviewToggle}
      >
        <Text style={styles.reviewToggleText}>
          {showAnswers ? "Hide Answer Review" : "Review Your Answers"}
        </Text>
        <Text style={styles.reviewToggleIcon}>{showAnswers ? "▲" : "▼"}</Text>
      </Pressable>

      {/* Answer Review */}
      {showAnswers && (
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
                  <Text style={styles.answerNumber}>Question {idx + 1}</Text>
                </View>

                <Text style={styles.answerQuestion}>{q.text}</Text>

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
                        <Text style={[
                          styles.answerOptionText,
                          isCorrectOption && styles.answerOptionTextCorrect,
                          isSelectedOption && !isCorrectOption && styles.answerOptionTextWrong
                        ]}>
                          {option}
                        </Text>
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
      )}

      {/* Home Button */}
      <Pressable onPress={() => router.replace("/")} style={styles.homeButton}>
        <Text style={styles.homeButtonText}>Back to Home</Text>
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
    backgroundColor: "#111827",
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
    alignItems: "center",
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 14,
    color: "#059669",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  testTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  scoreCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  scoreCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 44,
    fontWeight: "800",
  },
  gradeLabel: {
    fontSize: 24,
    fontWeight: "700",
    color: "#6b7280",
    marginTop: -4,
  },
  gradeMessage: {
    fontSize: 18,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  reviewToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reviewToggleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2563eb",
  },
  reviewToggleIcon: {
    fontSize: 12,
    color: "#2563eb",
  },
  answersSection: {
    gap: 16,
    marginBottom: 20,
  },
  answerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  answerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  answerStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
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
  answerNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  answerQuestion: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
    marginBottom: 12,
  },
  answerOptions: {
    gap: 8,
  },
  answerOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
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
    width: 20,
  },
  answerOptionLetterCorrect: {
    color: "#059669",
  },
  answerOptionLetterWrong: {
    color: "#dc2626",
  },
  answerOptionText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  answerOptionTextCorrect: {
    color: "#065f46",
    fontWeight: "500",
  },
  answerOptionTextWrong: {
    color: "#991b1b",
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
    backgroundColor: "#111827",
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

