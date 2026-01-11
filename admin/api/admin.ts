import apiClient, { baseUrl } from "./client";
import { store } from "@/utils";

export type AdminUser = {
  _id: string;
  name?: string;
  phone: string;
  role: "user" | "teacher" | "admin";
  isPhoneVerified: boolean;
  createdAt?: string;
};

export type ListUsersResponse = {
  success: boolean;
  data: AdminUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export async function listUsers(params: { search?: string; role?: string; page?: number; limit?: number } = {}) {
  const resp = await apiClient.get<ListUsersResponse>("/api/admin/users", { params });
  return resp.data;
}

export async function updateUserRole(userId: string, role: "user" | "teacher" | "admin") {
  const resp = await apiClient.patch<{ success: boolean; user: AdminUser }>(`/api/admin/users/${userId}/role`, { role });
  return resp.data;
}

// Upload history types
export type UploadSession = {
  _id: string;
  fileName: string;
  subject: string;
  startPage: number;
  numPages: number;
  totalQuestionsExtracted: number;
  status: "processing" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
};

export type UploadHistoryResponse = {
  success: boolean;
  data: UploadSession[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

// Fetch upload history
export async function getUploadHistory(params: { page?: number; limit?: number } = {}) {
  const resp = await apiClient.get<UploadHistoryResponse>("/api/admin/upload-history", { params });
  return resp.data;
}

// Fetch questions from a specific session
export async function getSessionQuestions(sessionId: string) {
  const resp = await apiClient.get(`/api/admin/upload-history/${sessionId}/questions`);
  return resp.data as {
    success: boolean;
    data: {
      session: {
        id: string;
        fileName: string;
        subject: string;
        startPage: number;
        numPages: number;
        status: string;
        totalQuestionsExtracted: number;
        createdAt: string;
        completedAt?: string;
      };
      questions: Array<{
        _id: string;
        text: string;
        options: string[];
        correctIndex?: number;
        image?: string;
        subject: string;
        chapter?: string;
        difficulty?: string;
        topics?: string[];
        tags?: string[];
        description?: string;
        sourcePage?: number;
      }>;
    };
  };
}

// Get session status (lightweight, for polling)
export async function getSessionStatus(sessionId: string) {
  const resp = await apiClient.get(`/api/admin/upload-history/${sessionId}/status`);
  return resp.data as {
    success: boolean;
    data: {
      id: string;
      fileName: string;
      subject: string;
      startPage: number;
      numPages: number;
      totalQuestionsExtracted: number;
      status: "processing" | "completed" | "failed";
      errorMessage?: string;
      createdAt: string;
      completedAt?: string;
    };
  };
}

// Get any active (processing) sessions
export async function getActiveSessions() {
  const resp = await apiClient.get(`/api/admin/active-sessions`);
  return resp.data as {
    success: boolean;
    data: Array<{
      id: string;
      fileName: string;
      subject: string;
      startPage: number;
      numPages: number;
      totalQuestionsExtracted: number;
      status: string;
      createdAt: string;
      questions: Array<{
        _id: string;
        text: string;
        options: string[];
        correctIndex?: number;
        image?: string;
        sourcePage?: number;
      }>;
    }>;
  };
}

// Streaming question extraction types
export type StreamEvent = 
  | { type: "session_started"; sessionId: string; fileName: string; subject: string; startPage: number; numPages: number }
  | { type: "progress"; message: string; step: string; totalPages?: number; startPage?: number; endPage?: number; totalPdfPages?: number }
  | { type: "page_start"; pageNum: number; totalPages: number; currentPage: number; pagesCompleted?: number; pagesRemaining?: number }
  | { type: "page_error"; pageNum: number; error: string }
  | { type: "question"; index: number; dbId: string; pineconeId?: string; question: string; options: string[]; correctIndex?: number; correctOption?: string; image?: string | null; page: number; isExisting: boolean }
  | { type: "page_complete"; pageNum: number; questionsOnPage: number; totalSoFar: number }
  | { type: "complete"; sessionId: string; totalQuestions: number; savedToDb: number }
  | { type: "error"; message: string; details?: string };

// Streaming PDF processing using SSE
export async function processQuestionPdfStream(
  params: { 
    pdfUrl: string; 
    fileName: string;
    startPage: number; 
    numPages: number; 
    subject: string;
  },
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Error) => void
): Promise<void> {
  const authToken = await store.get("token");
  
  return new Promise((resolve, reject) => {
    // Use fetch for SSE support
    fetch(`${baseUrl}/api/admin/question-pdfs/process-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "ngrok-skip-browser-warning": "true",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({
        fileUrl: params.pdfUrl,
        fileName: params.fileName,
        startPage: params.startPage,
        numPages: params.numPages,
        subject: params.subject,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        if (!response.body) {
          throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEventType = "";

        const processChunk = async (): Promise<void> => {
          try {
            const { done, value } = await reader.read();
            
            if (done) {
              // Process any remaining buffer
              if (buffer.trim()) {
                processBuffer();
              }
              resolve();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            processBuffer();

            // Continue reading
            return processChunk();
          } catch (error) {
            if (onError && error instanceof Error) {
              onError(error);
            }
            reject(error);
          }
        };

        const processBuffer = () => {
          // Split by double newline (SSE event separator)
          const events = buffer.split("\n\n");
          // Keep last potentially incomplete event in buffer
          buffer = events.pop() || "";
          
          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue;
            
            const lines = eventBlock.split("\n");
            let eventType = "";
            let eventData = "";
            
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                eventData = line.slice(5).trim();
              }
            }
            
            if (eventType && eventData) {
              try {
                const parsed = JSON.parse(eventData);
                onEvent({ type: eventType, ...parsed } as StreamEvent);
              } catch (e) {
                console.error("Failed to parse SSE data:", e, eventData);
              }
            }
          }
        };

        processChunk();
      })
      .catch((error) => {
        if (onError && error instanceof Error) {
          onError(error);
        }
        reject(error);
      });
  });
}

// 1) Ask backend for a presigned slot to upload a PDF to R2
export async function getQuestionPdfUploadSlot(options?: { fileType?: string; fileName?: string; isPermanent?: boolean }) {
  const fileType = options?.fileType ?? "application/pdf";
  const fileName = options?.fileName ?? "question.pdf";
  const isPermanent = options?.isPermanent ?? true;
  const resp = await apiClient.post<{ uploadUrl: string; publicUrl: string }>("/api/file/upload", {
    fileType,
    fileName,
    isPermanent,
  });
  return resp.data;
}

// 2) Server-side upload to R2 to avoid CORS (accepts base64 string)
export async function uploadPdfDirect(params: { dataBase64: string; fileType?: string; fileName?: string; isPermanent?: boolean }) {
  const resp = await apiClient.post<{ publicUrl: string }>("/api/file/upload-direct", {
    fileType: params.fileType ?? "application/pdf",
    fileName: params.fileName ?? "question.pdf",
    dataBase64: params.dataBase64,
    isPermanent: params.isPermanent ?? true,
  });
  return resp.data;
}

// 3) Tell backend to process the already-uploaded PDF by its public URL
export async function processQuestionPdf(params: { pdfUrl: string; startPage: number; numPages: number }) {
  const resp = await apiClient.post(`/api/admin/question-pdfs/process`, {
    startPage: params.startPage,
    numPages: params.numPages,
    fileUrl: params.pdfUrl,
  });
  return resp.data as any;
}

export async function generateQuestionMetadata(params: {
  text: string;
  options: string[];
  subject?: string | null;
  preferExamTag?: string;
}) {
  const payload = {
    text: params.text,
    options: params.options,
    subject: params.subject ?? undefined,
    preferExamTag: params.preferExamTag ?? undefined,
  };
  const resp = await apiClient.post(`/api/admin/questions/auto-metadata`, payload);
  return resp.data as {
    success: boolean;
    data: {
      chapter: string | null;
      difficulty: "easy" | "medium" | "hard";
      topics: string[];
      tags: string[];
      correctIndex: number;
      description: string;
    };
  };
}

export async function saveQuestionsBatch(params: {
  subject: string;
  sourceFileUrl?: string;
  items: Array<{
    text: string;
    options: string[];
    correctIndex?: number | null;
    image?: string | null;
    chapter?: string | null;
    difficulty?: "easy" | "medium" | "hard" | null;
    topics?: string[];
    tags?: string[];
    description?: string | null;
    sourcePage?: number | null;
  }>;
}) {
  const resp = await apiClient.post(`/api/admin/questions/batch`, params);
  return resp.data as {
    success: boolean;
    data: { id: string; pineconeId?: string }[];
  };
}

export type GeneratedPaperItem = {
  text: string;
  options: string[];
  correctIndex: number;
  subject: string;
  chapter?: string | null;
  topics?: string[];
  tags?: string[];
  difficulty: "easy" | "medium" | "hard";
  source?: { curatedPineconeIds?: string[] };
};

export async function generateQuestionPaper(params: {
  subject: string;
  chapter?: string | null;
  overallDifficulty?: "easy" | "medium" | "hard" | null;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  tags?: string[];
  topics?: string[];
  description?: string | null;
}) {
  const payload = {
    subject: params.subject,
    chapter: params.chapter ?? null,
    overallDifficulty: params.overallDifficulty ?? null,
    easyCount: params.easyCount,
    mediumCount: params.mediumCount,
    hardCount: params.hardCount,
    tags: params.tags ?? [],
    topics: params.topics ?? [],
    description: params.description ?? "",
  };
  const resp = await apiClient.post(`/api/admin/papers/generate`, payload);
  return resp.data as {
    success: boolean;
    data: GeneratedPaperItem[];
    meta?: unknown;
  };
}

export type GeneratedPaperItemV1_5 = {
  text: string;
  options: string[];
  correctIndex: number;
  subject: string;
  chapter?: string | null;
  topics?: string[];
  tags?: string[];
  difficulty: "easy" | "medium" | "hard";
  source?: { permutation?: string; curatedPineconeIds?: string[] };
};

export type GeneratePaperV1_5Response = {
  success: boolean;
  data: GeneratedPaperItemV1_5[];
  meta?: {
    requested: { easy: number; medium: number; hard: number; total: number };
    generated: {
      total: number;
      byDifficulty: { easy: number; medium: number; hard: number };
    };
    iterations: number;
    permutationsAvailable: number;
    permutationsUsed: number;
    topicsDiscovered: number;
    tagsDiscovered: number;
  };
};

export async function generateQuestionPaperV1_5(params: {
  subject: string;
  chapter?: string | null;
  overallDifficulty?: "easy" | "medium" | "hard" | null;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  tags?: string[];
  topics?: string[];
  description?: string | null;
  maxIterations?: number;
}) {
  const payload = {
    subject: params.subject,
    chapter: params.chapter ?? null,
    overallDifficulty: params.overallDifficulty ?? null,
    easyCount: params.easyCount,
    mediumCount: params.mediumCount,
    hardCount: params.hardCount,
    tags: params.tags ?? [],
    topics: params.topics ?? [],
    description: params.description ?? "",
    maxIterations: params.maxIterations ?? 3,
  };
  const resp = await apiClient.post(`/api/admin/papers/generate-v1.5`, payload);
  return resp.data as GeneratePaperV1_5Response;
}

export type GeneratedPaperItemV2 = {
  text: string;
  options: string[];
  correctIndex: number;
  subject: string;
  chapter?: string | null;
  topics?: string[];
  tags?: string[];
  difficulty: "easy" | "medium" | "hard";
  source?: { keyword?: string; curatedPineconeIds?: string[] };
};

export type GeneratePaperV2Response = {
  success: boolean;
  data: GeneratedPaperItemV2[];
  meta?: {
    requested: { easy: number; medium: number; hard: number; total: number };
    generated: {
      total: number;
      byDifficulty: { easy: number; medium: number; hard: number };
    };
    iterations: number;
    keywordsUsed: string[];
    evaluation?: {
      overallScore: number;
      coverageScore: number;
      diversityScore: number;
      difficultyBalanceScore: number;
      suggestions: string[];
      weakAreas: string[];
      missingTopics: string[];
    };
  };
};

export async function generateQuestionPaperV2(params: {
  subject: string;
  chapter?: string | null;
  overallDifficulty?: "easy" | "medium" | "hard" | null;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  tags?: string[];
  topics?: string[];
  description?: string | null;
  maxIterations?: number;
}) {
  const payload = {
    subject: params.subject,
    chapter: params.chapter ?? null,
    overallDifficulty: params.overallDifficulty ?? null,
    easyCount: params.easyCount,
    mediumCount: params.mediumCount,
    hardCount: params.hardCount,
    tags: params.tags ?? [],
    topics: params.topics ?? [],
    description: params.description ?? "",
    maxIterations: params.maxIterations ?? 2,
  };
  const resp = await apiClient.post(`/api/admin/papers/generate-v2`, payload);
  return resp.data as GeneratePaperV2Response;
}


