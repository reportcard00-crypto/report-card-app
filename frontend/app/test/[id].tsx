import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
  Image,
  BackHandler,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { startTestForStudent, submitTest, type TestQuestion, type StartTestResponse } from "@/api/client";

export default function TestScreen() {
  const router = useRouter();
  const { id: testId } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [testData, setTestData] = useState<StartTestResponse | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, number | null>>(new Map());
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Prevent back navigation during test
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      Alert.alert(
        "Exit Test?",
        "If you leave, your progress will be lost. Are you sure?",
        [
          { text: "Stay", style: "cancel" },
          { 
            text: "Leave", 
            style: "destructive",
            onPress: () => router.back()
          },
        ]
      );
      return true;
    });

    return () => backHandler.remove();
  }, [router]);

  // Start the test
  useEffect(() => {
    const initTest = async () => {
      if (!testId) {
        Alert.alert("Error", "Invalid test ID");
        router.back();
        return;
      }

      try {
        const resp = await startTestForStudent(testId);
        setTestData(resp.data);
        setTimeRemaining(resp.data.timeRemainingSeconds);
        
        // Initialize answers map
        const initialAnswers = new Map<string, number | null>();
        resp.data.questions.forEach((q) => {
          initialAnswers.set(q._id, null);
        });
        setAnswers(initialAnswers);
      } catch (e: any) {
        Alert.alert(
          "Error",
          e?.response?.data?.message || "Failed to start test",
          [{ text: "OK", onPress: () => router.back() }]
        );
      } finally {
        setLoading(false);
      }
    };

    initTest();
  }, [testId, router]);

  // Timer countdown
  useEffect(() => {
    if (testData && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up - auto submit
            handleSubmit(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [testData]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSelectOption = (optionIndex: number) => {
    if (!testData) return;
    const questionId = testData.questions[currentQuestionIndex]._id;
    const newAnswers = new Map(answers);
    
    // Toggle selection
    if (newAnswers.get(questionId) === optionIndex) {
      newAnswers.set(questionId, null);
    } else {
      newAnswers.set(questionId, optionIndex);
    }
    
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (!testData) return;
    if (currentQuestionIndex < testData.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    if (!testData || isSubmitting) return;

    const attemptedCount = Array.from(answers.values()).filter(v => v !== null).length;
    const unansweredCount = testData.questions.length - attemptedCount;

    const doSubmit = async () => {
      setIsSubmitting(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      try {
        const answersArray = testData.questions.map((q) => ({
          questionId: q._id,
          selectedIndex: answers.get(q._id) ?? null,
        }));

        const resp = await submitTest(testId!, answersArray);
        
        // Navigate to results
        router.replace({
          pathname: "/test/result/[id]" as any,
          params: { id: testId! },
        });
      } catch (e: any) {
        setIsSubmitting(false);
        Alert.alert("Error", e?.response?.data?.message || "Failed to submit test");
      }
    };

    if (isAutoSubmit) {
      Alert.alert("Time's Up!", "Your test has been automatically submitted.", [
        { text: "OK", onPress: doSubmit }
      ]);
    } else if (unansweredCount > 0) {
      Alert.alert(
        "Submit Test?",
        `You have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''}. Are you sure you want to submit?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Submit", style: "destructive", onPress: doSubmit }
        ]
      );
    } else {
      Alert.alert(
        "Submit Test?",
        "Are you sure you want to submit your test?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Submit", onPress: doSubmit }
        ]
      );
    }
  }, [testData, answers, testId, router, isSubmitting]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading test...</Text>
      </View>
    );
  }

  if (!testData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load test</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const currentQuestion = testData.questions[currentQuestionIndex];
  const selectedOption = answers.get(currentQuestion._id);
  const answeredCount = Array.from(answers.values()).filter(v => v !== null).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle} numberOfLines={1}>{testData.title}</Text>
          <Text style={styles.headerSubtitle}>
            Question {currentQuestionIndex + 1} of {testData.totalQuestions}
          </Text>
        </View>
        <View style={[
          styles.timerContainer,
          timeRemaining <= 60 && styles.timerWarning,
          timeRemaining <= 30 && styles.timerDanger
        ]}>
          <Text style={[
            styles.timerText,
            timeRemaining <= 60 && styles.timerTextWarning
          ]}>
            ⏱ {formatTime(timeRemaining)}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${((currentQuestionIndex + 1) / testData.totalQuestions) * 100}%` }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>
          {answeredCount}/{testData.totalQuestions} answered
        </Text>
      </View>

      {/* Question */}
      <ScrollView style={styles.questionContainer} contentContainerStyle={styles.questionContent}>
        <Text style={styles.questionText}>{currentQuestion.text}</Text>
        
        {currentQuestion.image && (
          <Image 
            source={{ uri: currentQuestion.image }} 
            style={styles.questionImage}
            resizeMode="contain"
          />
        )}

        {/* Options */}
        <View style={styles.optionsContainer}>
          {currentQuestion.options.map((option, index) => (
            <Pressable
              key={index}
              onPress={() => handleSelectOption(index)}
              style={[
                styles.optionButton,
                selectedOption === index && styles.optionButtonSelected
              ]}
            >
              <View style={[
                styles.optionCircle,
                selectedOption === index && styles.optionCircleSelected
              ]}>
                <Text style={[
                  styles.optionLetter,
                  selectedOption === index && styles.optionLetterSelected
                ]}>
                  {String.fromCharCode(65 + index)}
                </Text>
              </View>
              <Text style={[
                styles.optionText,
                selectedOption === index && styles.optionTextSelected
              ]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Question Navigation */}
      <View style={styles.navigationDots}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dotsContainer}>
          {testData.questions.map((q, idx) => {
            const isAnswered = answers.get(q._id) !== null;
            const isCurrent = idx === currentQuestionIndex;
            return (
              <Pressable
                key={q._id}
                onPress={() => setCurrentQuestionIndex(idx)}
                style={[
                  styles.dot,
                  isAnswered && styles.dotAnswered,
                  isCurrent && styles.dotCurrent
                ]}
              >
                <Text style={[
                  styles.dotText,
                  isAnswered && styles.dotTextAnswered,
                  isCurrent && styles.dotTextCurrent
                ]}>
                  {idx + 1}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Footer Navigation */}
      <View style={styles.footer}>
        <Pressable
          onPress={handlePrev}
          disabled={currentQuestionIndex === 0}
          style={[styles.navBtn, currentQuestionIndex === 0 && styles.navBtnDisabled]}
        >
          <Text style={[styles.navBtnText, currentQuestionIndex === 0 && styles.navBtnTextDisabled]}>
            ← Previous
          </Text>
        </Pressable>

        {currentQuestionIndex === testData.questions.length - 1 ? (
          <Pressable
            onPress={() => handleSubmit(false)}
            disabled={isSubmitting}
            style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]}
          >
            <Text style={styles.submitBtnText}>
              {isSubmitting ? "Submitting..." : "Submit Test"}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleNext} style={styles.nextBtn}>
            <Text style={styles.nextBtnText}>Next →</Text>
          </Pressable>
        )}
      </View>
    </View>
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
  backBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  timerContainer: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  timerWarning: {
    backgroundColor: "#fef3c7",
  },
  timerDanger: {
    backgroundColor: "#fecaca",
  },
  timerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
  },
  timerTextWarning: {
    color: "#dc2626",
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "right",
  },
  questionContainer: {
    flex: 1,
  },
  questionContent: {
    padding: 20,
    paddingBottom: 24,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111827",
    lineHeight: 26,
    marginBottom: 20,
  },
  questionImage: {
    width: "100%",
    height: 200,
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  optionButtonSelected: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
  },
  optionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  optionCircleSelected: {
    backgroundColor: "#2563eb",
  },
  optionLetter: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  optionLetterSelected: {
    color: "#fff",
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: "#374151",
    lineHeight: 22,
  },
  optionTextSelected: {
    color: "#1e40af",
    fontWeight: "500",
  },
  navigationDots: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  dotsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  dotAnswered: {
    backgroundColor: "#d1fae5",
    borderColor: "#6ee7b7",
  },
  dotCurrent: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  dotText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  dotTextAnswered: {
    color: "#059669",
  },
  dotTextCurrent: {
    color: "#2563eb",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  navBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  navBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  navBtnTextDisabled: {
    color: "#9ca3af",
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    alignItems: "center",
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#059669",
    alignItems: "center",
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});

