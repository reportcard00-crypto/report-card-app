import { create } from "zustand";

export type EditorOption = {
  id: string;
  text: string;
};

export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "objective" | "subjective";

export type EditorQuestion = {
  id: string;
  text: string;
  questionType: QuestionType; // objective (MCQ) or subjective (open-ended)
  options: EditorOption[];
  correctOptionId?: string | null;
  image?: string | null;
  originalImage?: string | null;
  chapter?: string | null;
  difficulty?: Difficulty | null;
  topics?: string[];
  tags?: string[];
  description?: string | null;
};

export type QuestionEditorState = {
  questions: EditorQuestion[];
  selectedIndex: number;
  selectedSubject: string | null;
  customChaptersBySubject: Record<string, string[]>;
  isStreaming: boolean;
  streamSessionId: string | null;
  setQuestions: (questions: EditorQuestion[], selectIndex?: number) => void;
  selectIndex: (index: number) => void;
  updateQuestionText: (questionId: string, text: string) => void;
  updateOptionText: (questionId: string, optionId: string, text: string) => void;
  addOption: (questionId: string) => void;
  removeOption: (questionId: string, optionId: string) => void;
  setCorrectOption: (questionId: string, optionId: string | null) => void;
  setImage: (questionId: string, image: string | null) => void;
  resetImage: (questionId: string) => void;
  loadFromBackendResult: (result: any) => void;
  setSelectedSubject: (subject: string | null) => void;
  setChapter: (questionId: string, chapter: string | null) => void;
  setDifficulty: (questionId: string, difficulty: Difficulty | null) => void;
  setTopics: (questionId: string, topics: string[]) => void;
  setTags: (questionId: string, tags: string[]) => void;
  addChapterForSubject: (subject: string, chapter: string) => void;
  setDescription: (questionId: string, description: string | null) => void;
  setQuestionType: (questionId: string, questionType: QuestionType) => void;
  // Streaming support
  clearQuestions: () => void;
  addStreamedQuestion: (data: {
    dbId: string;
    question: string;
    questionType?: QuestionType;
    options: string[];
    correctIndex?: number;
    image?: string | null;
    page: number;
  }) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamSessionId: (sessionId: string | null) => void;
};

const makeId = (prefix = "id") => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const toDataUrlIfNeeded = (maybeBase64?: string | null): string | null => {
  if (!maybeBase64) return null;
  if (maybeBase64.startsWith("data:image/")) return maybeBase64;
  // crude base64 detection: only letters/numbers/+/
  const base64Like = /^[A-Za-z0-9+/=]+$/.test(maybeBase64.replace(/\s+/g, ""));
  if (base64Like) return `data:image/png;base64,${maybeBase64}`;
  // otherwise assume it's already a URL
  return maybeBase64;
};

const normalizeResult = (result: any): EditorQuestion[] => {
  const items: any[] = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
  return items.map((item, idx) => {
    const text: string =
      item?.question ??
      item?.text ??
      item?.prompt ??
      item?.title ??
      "";
    const rawOptions: any[] = Array.isArray(item?.options)
      ? item.options
      : Array.isArray(item?.choices)
      ? item.choices
      : Array.isArray(item?.answers)
      ? item.answers
      : [];
    const options: EditorOption[] = rawOptions.map((opt: any) => {
      const text = typeof opt === "string" ? opt : opt?.text ?? "";
      return { id: makeId("opt"), text };
    });
    const image = toDataUrlIfNeeded(item?.image || item?.diagram || item?.img || null);
    
    // Determine question type - default to objective if has options, subjective if no options
    const questionType: QuestionType = 
      item?.questionType === "subjective" || (options.length === 0) ? "subjective" : "objective";
    
    let correctOptionId: string | null = null;
    // Only process correct option for objective questions
    if (questionType === "objective") {
      const correctFromIndex =
        typeof item?.correctIndex === "number"
          ? item.correctIndex
          : typeof item?.answerIndex === "number"
          ? item.answerIndex
          : typeof item?.correct === "number"
          ? item.correct
          : undefined;
      if (typeof correctFromIndex === "number" && options[correctFromIndex]) {
        correctOptionId = options[correctFromIndex].id;
      } else if (typeof item?.correct === "string" || typeof item?.answer === "string") {
        const correctText = (item?.correct ?? item?.answer) as string;
        const found = options.find((o) => o.text.trim() === correctText.trim());
        correctOptionId = found?.id ?? null;
      }
    }
    return {
      id: makeId(`q${idx + 1}`),
      text,
      questionType,
      options,
      correctOptionId,
      image: image ?? null,
      originalImage: image ?? null,
      chapter: null,
      difficulty: null,
      topics: [],
      tags: [],
      description: null,
    };
  });
};

export const useQuestionEditorStore = create<QuestionEditorState>((set, get) => ({
  questions: [],
  selectedIndex: 0,
  selectedSubject: null,
  customChaptersBySubject: {},
  isStreaming: false,
  streamSessionId: null,
  setQuestions: (questions, selectIndex) =>
    set({
      questions,
      selectedIndex: Math.min(Math.max(selectIndex ?? 0, 0), Math.max(questions.length - 1, 0)),
    }),
  selectIndex: (index) => {
    const n = get().questions.length;
    set({ selectedIndex: Math.min(Math.max(index, 0), Math.max(n - 1, 0)) });
  },
  updateQuestionText: (questionId, text) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, text } : q)),
    })),
  updateOptionText: (questionId, optionId, text) =>
    set((state) => ({
      questions: state.questions.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, text } : o)) }
          : q
      ),
    })),
  addOption: (questionId) =>
    set((state) => ({
      questions: state.questions.map((q) =>
        q.id === questionId
          ? { ...q, options: [...q.options, { id: makeId("opt"), text: "" }] }
          : q
      ),
    })),
  removeOption: (questionId, optionId) =>
    set((state) => ({
      questions: state.questions.map((q) => {
        if (q.id !== questionId) return q;
        const filtered = q.options.filter((o) => o.id !== optionId);
        const nextCorrect =
          q.correctOptionId && q.correctOptionId === optionId ? null : q.correctOptionId;
        return { ...q, options: filtered, correctOptionId: nextCorrect ?? null };
      }),
    })),
  setCorrectOption: (questionId, optionId) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, correctOptionId: optionId } : q)),
    })),
  setImage: (questionId, image) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, image } : q)),
    })),
  resetImage: (questionId) =>
    set((state) => ({
      questions: state.questions.map((q) =>
        q.id === questionId ? { ...q, image: q.originalImage ?? null } : q
      ),
    })),
  loadFromBackendResult: (result) => {
    const normalized = normalizeResult(result);
    set({ questions: normalized, selectedIndex: 0 });
  },
  setSelectedSubject: (subject) => set({ selectedSubject: subject }),
  setChapter: (questionId, chapter) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, chapter } : q)),
    })),
  setDifficulty: (questionId, difficulty) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, difficulty } : q)),
    })),
  setTopics: (questionId, topics) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, topics } : q)),
    })),
  setTags: (questionId, tags) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, tags } : q)),
    })),
  setDescription: (questionId, description) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, description } : q)),
    })),
  setQuestionType: (questionId, questionType) =>
    set((state) => ({
      questions: state.questions.map((q) => (q.id === questionId ? { ...q, questionType } : q)),
    })),
  addChapterForSubject: (subject, chapter) =>
    set((state) => {
      const trimmed = chapter.trim();
      if (!trimmed) return state;
      const existing = state.customChaptersBySubject[subject] ?? [];
      const alreadyExists =
        existing.some((c) => c.toLowerCase() === trimmed.toLowerCase()) ||
        (SUBJECT_TO_CHAPTERS[subject] ?? []).some((c) => c.toLowerCase() === trimmed.toLowerCase());
      if (alreadyExists) return state;
      const nextForSubject = [...existing, trimmed];
      return {
        ...state,
        customChaptersBySubject: { ...state.customChaptersBySubject, [subject]: nextForSubject },
      };
    }),
  // Streaming support methods
  clearQuestions: () => set({ questions: [], selectedIndex: 0 }),
  addStreamedQuestion: (data) =>
    set((state) => {
      const options: EditorOption[] = data.options.map((opt, idx) => ({
        id: makeId("opt"),
        text: opt,
      }));
      
      // Determine question type - default to objective if has options, subjective if no options
      const questionType: QuestionType = 
        data.questionType === "subjective" || (options.length === 0) ? "subjective" : "objective";
      
      let correctOptionId: string | null = null;
      // Only process correct option for objective questions
      if (questionType === "objective" && typeof data.correctIndex === "number" && options[data.correctIndex]) {
        correctOptionId = options[data.correctIndex].id;
      }
      
      const image = toDataUrlIfNeeded(data.image);
      
      const newQuestion: EditorQuestion = {
        id: data.dbId || makeId(`q${state.questions.length + 1}`),
        text: data.question,
        questionType,
        options,
        correctOptionId,
        image: image ?? null,
        originalImage: image ?? null,
        chapter: null,
        difficulty: null,
        topics: [],
        tags: [],
        description: null,
      };
      
      return {
        questions: [...state.questions, newQuestion],
        // Auto-select the newly added question
        selectedIndex: state.questions.length,
      };
    }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamSessionId: (sessionId) => set({ streamSessionId: sessionId }),
}));

export const SUBJECTS: string[] = ["Mathematics", "Physics", "Chemistry", "Biology"];

export const SUBJECT_TO_CHAPTERS: Record<string, string[]> = {
  Mathematics: ["Algebra", "Geometry", "Trigonometry", "Calculus", "Probability"],
  Physics: ["Mechanics", "Thermodynamics", "Optics", "Electricity & Magnetism", "Modern Physics"],
  Chemistry: ["Physical Chemistry", "Organic Chemistry", "Inorganic Chemistry", "Environmental Chemistry"],
  Biology: ["Cell Biology", "Genetics", "Human Physiology", "Plant Physiology", "Ecology"],
};


