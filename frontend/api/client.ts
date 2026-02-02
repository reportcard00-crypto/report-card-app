import { store } from "@/utils";
import axios from "axios";

export const baseUrl = process.env.EXPO_PUBLIC_TEST_BE_URL || 'https://square-goat-barely.ngrok-free.app';
console.log(baseUrl);
const apiClient = axios.create({
    baseURL: baseUrl,
});

apiClient.interceptors.request.use(async (config: any) => {
    const authToken = await store.get("token");
    if (authToken) {
        config.headers.Authorization = `Bearer ${authToken}`;
    }

    // Add ngrok bypass header to skip the warning page
    // This is needed when using ngrok's free tier
    config.headers['ngrok-skip-browser-warning'] = 'true';

    return config;
});

export default apiClient;

// Log responses globally
apiClient.interceptors.response.use(
    (response) => {
        try {
            console.log("API Response:", response?.data);
        } catch {}
        return response;
    },
    (error) => {
        try {
            if (error?.response) {
                console.log("API Error Response:", error.response.data);
            } else {
                console.log("API Error:", error?.message || error?.toString());
            }
        } catch {}
        return Promise.reject(error);
    }
);

// ============================================================
// Test API Types and Functions
// ============================================================

export type ActiveTest = {
  _id: string;
  title: string;
  subject: string;
  questionsCount: number;
  classroom: string;
  timeLimitMinutes: number;
  startedAt: string;
  endsAt: string;
  timeRemainingSeconds: number;
  studentStatus: "not_started" | "in_progress" | "submitted" | "timed_out";
  canStart: boolean;
};

export type TestQuestion = {
  _id: string;
  index: number;
  text: string;
  options: string[];
  image?: string;
};

export type StartTestResponse = {
  testId: string;
  resultId: string;
  title: string;
  questions: TestQuestion[];
  totalQuestions: number;
  timeRemainingSeconds: number;
  startedAt: string;
};

export type SubmitTestResponse = {
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  totalQuestions: number;
  attemptedQuestions: number;
  timeTaken: number;
};

export type TestResultQuestion = {
  _id: string;
  text: string;
  options: string[];
  image?: string;
  correctIndex: number;
  selectedIndex: number | null;
  isCorrect: boolean;
};

export type TestResultData = {
  testTitle: string;
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  totalQuestions: number;
  attemptedQuestions: number;
  timeTaken: number;
  status: string;
  submittedAt: string;
  questions: TestResultQuestion[];
};

// Get active tests for student (for polling)
export async function getActiveTests() {
  const resp = await apiClient.get(`/api/tests/active`);
  return resp.data as { success: boolean; data: ActiveTest[] };
}

// Start a test for student
export async function startTestForStudent(testId: string) {
  const resp = await apiClient.post(`/api/tests/${testId}/start`);
  return resp.data as { success: boolean; data: StartTestResponse };
}

// Submit test answers
export async function submitTest(testId: string, answers: Array<{ questionId: string; selectedIndex: number | null; timeTaken?: number }>) {
  const resp = await apiClient.post(`/api/tests/${testId}/submit`, { answers });
  return resp.data as { success: boolean; data: SubmitTestResponse; message: string };
}

// Get student's result for a test
export async function getTestResult(testId: string) {
  const resp = await apiClient.get(`/api/tests/${testId}/result`);
  return resp.data as { success: boolean; data: TestResultData };
}

// ============================================================
// Student Dashboard Analytics Types and Functions
// ============================================================

export type StudentDashboardKPIs = {
  avgScore: number;
  accuracyPercent: number;
  testsAttempted: number;
  testsAssigned: number;
};

export type PerformanceTrendItem = {
  testId: string;
  testName: string;
  subject: string;
  score: number;
  accuracy: number;
  date: string;
};

export type ChapterStrength = {
  subject: string;
  chapter: string;
  accuracy: number;
  totalAttempted: number;
  correctCount: number;
};

export type DashboardInsight = {
  type: "improvement" | "warning" | "info";
  message: string;
};

export type RecentTest = {
  _id: string;
  testName: string;
  subject: string;
  classroom: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  attemptedQuestions: number;
  timeTaken: number;
  submittedAt: string;
  status: string;
};

export type StudentDashboardData = {
  kpis: StudentDashboardKPIs;
  performanceTrend: PerformanceTrendItem[];
  strengths: ChapterStrength[];
  weaknesses: ChapterStrength[];
  insights: DashboardInsight[];
  recommendations: string[];
  recentTests: RecentTest[];
};

// Get student dashboard analytics
export async function getStudentDashboard() {
  const resp = await apiClient.get(`/api/tests/student/dashboard`);
  return resp.data as { success: boolean; data: StudentDashboardData };
}

// ============================================================
// Test Detail Analytics Types
// ============================================================

export type TestScorecard = {
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  skipped: number;
  totalQuestions: number;
  attemptedQuestions: number;
  accuracy: number;
  timeTaken: number;
  avgTimePerQuestion: number;
};

export type ChapterBreakdown = {
  chapter: string;
  subject: string;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  accuracy: number;
};

export type QuestionTypeBreakdown = {
  type: string;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  accuracy: number;
};

export type DifficultyBreakdown = {
  difficulty: string;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  accuracy: number;
};

export type MistakePattern = {
  chapter: string;
  count: number;
  questions: {
    text: string;
    correctAnswer: string;
    yourAnswer: string;
  }[];
};

export type TestDetailQuestion = {
  _id: string;
  text: string;
  options: string[];
  image?: string;
  chapter?: string;
  difficulty?: string;
  questionType: string;
  correctIndex: number;
  selectedIndex: number | null;
  isCorrect: boolean;
  timeTaken: number;
};

export type TestDetailData = {
  testInfo: {
    _id: string;
    title: string;
    subject: string;
    chapter?: string;
    classroom: string;
    submittedAt: string;
    status: string;
  };
  scorecard: TestScorecard;
  chapterBreakdown: ChapterBreakdown[];
  questionTypeBreakdown: QuestionTypeBreakdown[];
  difficultyBreakdown: DifficultyBreakdown[];
  mistakePatterns: MistakePattern[];
  recommendations: string[];
  questions: TestDetailQuestion[];
};

// Get detailed test result with chapter breakdown and analysis
export async function getTestDetail(testId: string) {
  const resp = await apiClient.get(`/api/tests/student/${testId}/detail`);
  return resp.data as { success: boolean; data: TestDetailData };
}