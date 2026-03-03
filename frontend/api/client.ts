import { store } from "@/utils";
import axios from "axios";

export const baseUrl = process.env.EXPO_PUBLIC_TEST_BE_URL || 'https://verified-together-clam.ngrok-free.app';
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

// ============================================================
// Teacher API Types and Functions
// ============================================================

export type ClassroomTeacher = {
  _id: string;
  name?: string;
  phone: string;
};

export type ClassroomStudent = {
  _id: string;
  name?: string;
  phone: string;
  createdAt?: string;
};

export type ClassroomListItem = {
  _id: string;
  name: string;
  description?: string;
  teacher: ClassroomTeacher;
  studentsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Classroom = {
  _id: string;
  name: string;
  description?: string;
  teacher: ClassroomTeacher;
  students: ClassroomStudent[];
  createdAt: string;
  updatedAt: string;
};

export type QuestionPaperListItem = {
  _id: string;
  title: string;
  description?: string;
  subject: string;
  chapter?: string | null;
  status: "draft" | "finalized" | "archived";
  questionsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TestSessionListItem = {
  _id: string;
  title: string;
  status: "assigned" | "active" | "completed" | "cancelled";
  timeLimitMinutes: number;
  startedAt?: string;
  endsAt?: string;
  questionPaper: {
    _id: string;
    title: string;
    subject: string;
    questionsCount?: number;
  };
  classroom: {
    _id: string;
    name: string;
    studentsCount?: number;
  };
  createdBy: {
    _id: string;
    name?: string;
    phone: string;
  };
  totalStudents: number;
  completedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TestResultStudent = {
  _id: string;
  student: {
    _id: string;
    name?: string;
    phone: string;
  };
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  totalQuestions: number;
  attemptedQuestions: number;
  status: "not_started" | "in_progress" | "submitted" | "timed_out";
  startedAt?: string;
  submittedAt?: string;
  totalTimeTaken: number;
};

export type TestResultsData = {
  testSession: any;
  results: TestResultStudent[];
  stats: {
    totalStudents: number;
    participated: number;
    completed: number;
    inProgress: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
  };
};

// Classroom API functions
export async function createClassroom(params: { name: string; description?: string }) {
  const resp = await apiClient.post(`/api/classrooms`, params);
  return resp.data as {
    success: boolean;
    data: {
      _id: string;
      name: string;
      description?: string;
      studentsCount: number;
      createdAt: string;
    };
  };
}

export async function listClassrooms(params: {
  page?: number;
  limit?: number;
  search?: string;
} = {}) {
  const resp = await apiClient.get(`/api/classrooms`, { params });
  return resp.data as {
    success: boolean;
    data: ClassroomListItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  };
}

export async function getClassroom(classroomId: string) {
  const resp = await apiClient.get(`/api/classrooms/${classroomId}`);
  return resp.data as { success: boolean; data: Classroom };
}

export async function updateClassroom(classroomId: string, params: {
  name?: string;
  description?: string | null;
}) {
  const resp = await apiClient.put(`/api/classrooms/${classroomId}`, params);
  return resp.data as {
    success: boolean;
    data: {
      _id: string;
      name: string;
      description?: string;
      studentsCount: number;
      updatedAt: string;
    };
  };
}

export async function deleteClassroom(classroomId: string) {
  const resp = await apiClient.delete(`/api/classrooms/${classroomId}`);
  return resp.data as { success: boolean; message: string };
}

export async function searchUsersForClassroom(query: string, limit: number = 10) {
  const resp = await apiClient.get(`/api/classrooms/users/search`, {
    params: { q: query, limit }
  });
  return resp.data as {
    success: boolean;
    data: Array<{
      _id: string;
      name?: string;
      phone: string;
      createdAt?: string;
    }>;
  };
}

export async function addStudentToClassroom(
  classroomId: string,
  params: { userId?: string; phone?: string; name?: string }
) {
  const resp = await apiClient.post(`/api/classrooms/${classroomId}/students`, params);
  return resp.data as {
    success: boolean;
    data: {
      _id: string;
      name?: string;
      phone: string;
    };
    studentsCount: number;
    message: string;
  };
}

export async function removeStudentFromClassroom(classroomId: string, userId: string) {
  const resp = await apiClient.delete(`/api/classrooms/${classroomId}/students/${userId}`);
  return resp.data as { success: boolean; message: string; studentsCount: number };
}

// Question Paper API functions
export async function listQuestionPapers(params: {
  page?: number;
  limit?: number;
  subject?: string;
  status?: string;
  search?: string;
} = {}) {
  const resp = await apiClient.get(`/api/admin/papers`, { params });
  return resp.data as {
    success: boolean;
    data: QuestionPaperListItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  };
}

export async function deleteQuestionPaper(paperId: string) {
  const resp = await apiClient.delete(`/api/admin/papers/${paperId}`);
  return resp.data as { success: boolean; message: string };
}

// Test Session API functions
export async function assignPaperToClassroom(params: {
  paperId: string;
  classroomId: string;
  title?: string;
}) {
  const resp = await apiClient.post(`/api/tests/assign`, params);
  return resp.data as {
    success: boolean;
    data: {
      _id: string;
      title: string;
      status: string;
      classroom: string;
      paper: string;
      createdAt: string;
    };
    message: string;
  };
}

export async function listTestSessions(params: {
  page?: number;
  limit?: number;
  status?: string;
  classroomId?: string;
} = {}) {
  const resp = await apiClient.get(`/api/tests/sessions`, { params });
  return resp.data as {
    success: boolean;
    data: TestSessionListItem[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  };
}

export async function startTest(testId: string, timeLimitMinutes: number) {
  const resp = await apiClient.post(`/api/tests/sessions/${testId}/start`, { timeLimitMinutes });
  return resp.data as {
    success: boolean;
    data: {
      _id: string;
      status: string;
      timeLimitMinutes: number;
      startedAt: string;
      endsAt: string;
    };
    message: string;
  };
}

export async function stopTest(testId: string) {
  const resp = await apiClient.post(`/api/tests/sessions/${testId}/stop`);
  return resp.data as { success: boolean; message: string };
}

export async function getTestResults(testId: string) {
  const resp = await apiClient.get(`/api/tests/sessions/${testId}/results`);
  return resp.data as { success: boolean; data: TestResultsData };
}

export async function deleteTestSession(testId: string) {
  const resp = await apiClient.delete(`/api/tests/sessions/${testId}`);
  return resp.data as { success: boolean; message: string };
}

// Upload PDF and extract questions to create a question paper (streaming)
export async function uploadPdfToQuestionPaper(
  params: {
    fileUrl: string;
    fileName: string;
    title?: string;
    subject: string;
    startPage?: number;
    numPages?: number;
  },
  onProgress: (event: { type: string; [key: string]: any }) => void
): Promise<{ paperId: string; title: string; questionsCount: number }> {
  const token = await store.get("token");

  return new Promise((resolve, reject) => {
    fetch(`${baseUrl}/api/admin/papers/upload-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(params),
    }).then(async response => {
      if (!response.ok) {
        const errorText = await response.text();
        reject(new Error(errorText || 'Failed to start PDF extraction'));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        reject(new Error('No response body'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);

            if (currentEvent && currentData) {
              try {
                const data = JSON.parse(currentData);
                onProgress({ type: currentEvent, ...data });

                if (currentEvent === 'complete') {
                  resolve({
                    paperId: data.paperId,
                    title: data.title,
                    questionsCount: data.questionsCount,
                  });
                } else if (currentEvent === 'error') {
                  reject(new Error(data.message || 'Extraction failed'));
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }

              currentEvent = '';
              currentData = '';
            }
          }
        }
      }
    }).catch(reject);
  });
}

// Upload file directly (base64)
export async function uploadFileDirect(params: { dataBase64: string; fileType?: string; fileName?: string; isPermanent?: boolean }) {
  const resp = await apiClient.post(`/api/file/upload-direct`, {
    fileType: params.fileType ?? "application/pdf",
    fileName: params.fileName ?? "question.pdf",
    dataBase64: params.dataBase64,
    isPermanent: params.isPermanent ?? true,
  });
  return resp.data as { publicUrl: string };
}