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