import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Image, Modal, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { 
  getQuestionPaper, 
  updateQuestionPaper,
  updateQuestionInPaper,
  deleteQuestionFromPaper,
  addQuestionToPaper,
  uploadImageDirect,
  type QuestionPaper,
  type PaperQuestion,
} from "@/api/admin";
import { SUBJECTS, SUBJECT_TO_CHAPTERS } from "@/store/questionEditor";

const DIFFICULTIES: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];
const STATUSES: ("draft" | "finalized" | "archived")[] = ["draft", "finalized", "archived"];

type EditingQuestion = PaperQuestion & {
  _tempTopicInput?: string;
  _tempTagInput?: string;
};

export default function PaperEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const newImageInputRef = useRef<HTMLInputElement>(null);
  
  const [paper, setPaper] = useState<QuestionPaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<EditingQuestion | null>(null);
  const [showMetaEditor, setShowMetaEditor] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState<EditingQuestion>({
    _id: "",
    text: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    subject: "",
    difficulty: "medium",
    topics: [],
    tags: [],
    _tempTopicInput: "",
    _tempTagInput: "",
  });

  const fetchPaper = useCallback(async () => {
    if (!id) {
      Alert.alert("Error", "No paper ID provided");
      router.back();
      return;
    }
    try {
      setLoading(true);
      const resp = await getQuestionPaper(id);
      setPaper(resp.data);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to load paper");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchPaper();
  }, [fetchPaper]);

  // Image upload handler for web
  const handleImageUpload = async (
    file: File,
    setQuestion: (q: EditingQuestion) => void,
    currentQuestion: EditingQuestion
  ) => {
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      Alert.alert("Error", "Please select an image file");
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      Alert.alert("Error", "Image must be less than 5MB");
      return;
    }

    try {
      setUploadingImage(true);
      
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Upload to server
      const resp = await uploadImageDirect({
        dataBase64: base64,
        fileType: file.type,
        fileName: `question-image-${Date.now()}.${file.name.split('.').pop()}`,
      });
      
      // Update question with new image URL
      setQuestion({ ...currentQuestion, image: resp.publicUrl });
      Alert.alert("Success", "Image uploaded successfully!");
    } catch (e: any) {
      console.error("Image upload error:", e);
      Alert.alert("Error", e?.response?.data?.message || e?.message || "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSavePaperMeta = async () => {
    if (!paper || !id) return;
    try {
      setSaving(true);
      await updateQuestionPaper(id, {
        title: paper.title,
        description: paper.description || undefined,
        subject: paper.subject,
        chapter: paper.chapter || undefined,
        overallDifficulty: paper.overallDifficulty || undefined,
        tags: paper.tags,
        topics: paper.topics,
        status: paper.status,
      });
      setShowMetaEditor(false);
      Alert.alert("Saved", "Paper details updated successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleEditQuestion = (index: number) => {
    if (!paper) return;
    const q = paper.questions[index];
    setEditingQuestion({
      ...q,
      options: [...q.options],
      topics: [...(q.topics || [])],
      tags: [...(q.tags || [])],
      _tempTopicInput: "",
      _tempTagInput: "",
    });
    setEditingQuestionIndex(index);
  };

  const handleSaveQuestion = async () => {
    if (!paper || !id || editingQuestionIndex === null || !editingQuestion) return;
    const questionId = paper.questions[editingQuestionIndex]._id;
    
    // Validate
    if (!editingQuestion.text.trim()) {
      Alert.alert("Error", "Question text is required");
      return;
    }
    // Only validate options for objective questions
    if (editingQuestion.questionType !== "subjective" && editingQuestion.options.filter(o => o.trim()).length < 2) {
      Alert.alert("Error", "At least 2 options are required for objective questions");
      return;
    }

    try {
      setSaving(true);
      await updateQuestionInPaper(id, questionId, {
        text: editingQuestion.text,
        options: editingQuestion.options.filter(o => o.trim()),
        correctIndex: editingQuestion.correctIndex,
        image: editingQuestion.image || undefined,
        chapter: editingQuestion.chapter || undefined,
        difficulty: editingQuestion.difficulty,
        topics: editingQuestion.topics,
        tags: editingQuestion.tags,
      });
      
      // Update local state
      setPaper(prev => {
        if (!prev) return prev;
        const newQuestions = [...prev.questions];
        newQuestions[editingQuestionIndex] = {
          ...newQuestions[editingQuestionIndex],
          text: editingQuestion.text,
          options: editingQuestion.options.filter(o => o.trim()),
          correctIndex: editingQuestion.correctIndex,
          image: editingQuestion.image,
          chapter: editingQuestion.chapter,
          difficulty: editingQuestion.difficulty,
          topics: editingQuestion.topics,
          tags: editingQuestion.tags,
        };
        return { ...prev, questions: newQuestions };
      });
      
      setEditingQuestion(null);
      setEditingQuestionIndex(null);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = (index: number) => {
    if (!paper || !id) return;
    const q = paper.questions[index];
    
    Alert.alert(
      "Delete Question",
      `Are you sure you want to delete Q${index + 1}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteQuestionFromPaper(id, q._id);
              setPaper(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  questions: prev.questions.filter((_, i) => i !== index),
                };
              });
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.message || "Failed to delete");
            }
          },
        },
      ]
    );
  };

  const handleAddQuestion = async () => {
    if (!paper || !id) return;
    
    if (!newQuestion.text.trim()) {
      Alert.alert("Error", "Question text is required");
      return;
    }
    // Only validate options for objective questions (non-subjective papers)
    if (paper.paperType !== "subjective" && newQuestion.options.filter(o => o.trim()).length < 2) {
      Alert.alert("Error", "At least 2 options are required for objective questions");
      return;
    }

    try {
      setSaving(true);
      const resp = await addQuestionToPaper(id, {
        text: newQuestion.text,
        options: newQuestion.options.filter(o => o.trim()),
        correctIndex: newQuestion.correctIndex,
        image: newQuestion.image || undefined,
        subject: paper.subject,
        chapter: newQuestion.chapter || paper.chapter || undefined,
        difficulty: newQuestion.difficulty,
        topics: newQuestion.topics,
        tags: newQuestion.tags,
      });
      
      setPaper(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: [...prev.questions, resp.data],
        };
      });
      
      setShowAddQuestion(false);
      setNewQuestion({
        _id: "",
        text: "",
        options: ["", "", "", ""],
        correctIndex: 0,
        subject: paper.subject,
        difficulty: "medium",
        topics: [],
        tags: [],
        _tempTopicInput: "",
        _tempTagInput: "",
      });
      
      Alert.alert("Added", "Question added successfully");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to add question");
    } finally {
      setSaving(false);
    }
  };

  const addTopicToQuestion = (q: EditingQuestion, setQ: (q: EditingQuestion) => void) => {
    const topic = (q._tempTopicInput || "").trim();
    if (!topic) return;
    if (!q.topics?.includes(topic)) {
      setQ({ ...q, topics: [...(q.topics || []), topic], _tempTopicInput: "" });
    } else {
      setQ({ ...q, _tempTopicInput: "" });
    }
  };

  const removeTopicFromQuestion = (q: EditingQuestion, setQ: (q: EditingQuestion) => void, topic: string) => {
    setQ({ ...q, topics: (q.topics || []).filter(t => t !== topic) });
  };

  const addTagToQuestion = (q: EditingQuestion, setQ: (q: EditingQuestion) => void) => {
    const tag = (q._tempTagInput || "").trim();
    if (!tag) return;
    if (!q.tags?.includes(tag)) {
      setQ({ ...q, tags: [...(q.tags || []), tag], _tempTagInput: "" });
    } else {
      setQ({ ...q, _tempTagInput: "" });
    }
  };

  const removeTagFromQuestion = (q: EditingQuestion, setQ: (q: EditingQuestion) => void, tag: string) => {
    setQ({ ...q, tags: (q.tags || []).filter(t => t !== tag) });
  };

  const chapters = paper ? (SUBJECT_TO_CHAPTERS[paper.subject] || []) : [];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Loading paper...</Text>
      </View>
    );
  }

  if (!paper) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Paper not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" };
      case "finalized": return { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" };
      case "archived": return { bg: "#e5e7eb", border: "#9ca3af", text: "#374151" };
      default: return { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" };
    }
  };

  const statusColors = getStatusColor(paper.status);

  return (
    <View style={styles.wrapper}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Paper Header */}
        <View style={styles.paperHeader}>
          <View style={styles.paperHeaderLeft}>
            <Pressable onPress={() => router.back()} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back to History</Text>
            </Pressable>
            <Text style={styles.paperTitle}>{paper.title}</Text>
            <Text style={styles.paperSubtitle}>
              {paper.subject}{paper.chapter ? ` • ${paper.chapter}` : ""} • {paper.questions.length} questions
            </Text>
          </View>
          <View style={styles.paperHeaderRight}>
            {/* Paper Type Badge */}
            {paper.paperType === "subjective" && (
              <View style={[styles.statusBadge, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]}>
                <Text style={[styles.statusText, { color: "#065f46" }]}>✍️ Subjective</Text>
              </View>
            )}
            {paper.paperType !== "subjective" && (
              <View style={[styles.statusBadge, { backgroundColor: "#eff6ff", borderColor: "#93c5fd" }]}>
                <Text style={[styles.statusText, { color: "#1d4ed8" }]}>📝 Objective</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
              <Text style={[styles.statusText, { color: statusColors.text }]}>{paper.status}</Text>
            </View>
            <Pressable onPress={() => setShowMetaEditor(true)} style={styles.editMetaBtn}>
              <Text style={styles.editMetaBtnText}>Edit Details</Text>
            </Pressable>
          </View>
        </View>

        {/* Questions List */}
        <View style={styles.questionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Questions</Text>
            <Pressable onPress={() => setShowAddQuestion(true)} style={styles.addQuestionBtn}>
              <Text style={styles.addQuestionBtnText}>+ Add Question</Text>
            </Pressable>
          </View>

          {paper.questions.length === 0 && (
            <View style={styles.emptyQuestions}>
              <Text style={styles.emptyText}>No questions in this paper yet.</Text>
              <Pressable onPress={() => setShowAddQuestion(true)} style={[styles.addQuestionBtn, { marginTop: 12 }]}>
                <Text style={styles.addQuestionBtnText}>+ Add First Question</Text>
              </Pressable>
            </View>
          )}

          {paper.questions.map((q, idx) => {
            const correct = typeof q.correctIndex === "number" ? q.correctIndex : -1;
            const isEditing = editingQuestionIndex === idx;
            
            return (
              <View key={q._id} style={[styles.questionCard, isEditing && styles.questionCardEditing]}>
                <View style={styles.questionHeader}>
                  <Text style={styles.questionIndex}>Q{idx + 1}</Text>
                  <View style={styles.questionActions}>
                    <Pressable onPress={() => handleEditQuestion(idx)} style={styles.questionActionBtn}>
                      <Text style={styles.questionActionText}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDeleteQuestion(idx)} style={[styles.questionActionBtn, styles.deleteActionBtn]}>
                      <Text style={styles.deleteActionText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.questionText}>{q.text}</Text>

                {q.image && (
                  <View style={styles.imageContainer}>
                    <Image source={{ uri: q.image }} style={styles.questionImage} resizeMode="contain" />
                  </View>
                )}

                {/* Only show options for objective questions */}
                {q.questionType !== "subjective" && q.options && q.options.length > 0 && (
                  <View style={styles.optionsContainer}>
                    {q.options.map((opt, i) => (
                      <View key={i} style={[styles.optionRow, i === correct && styles.optionCorrect]}>
                        <Text style={[styles.optionLetter, i === correct && styles.optionLetterCorrect]}>
                          {String.fromCharCode(65 + i)}.
                        </Text>
                        <Text style={[styles.optionText, i === correct && styles.optionTextCorrect]}>{opt}</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Show answer space for subjective questions */}
                {q.questionType === "subjective" && (
                  <View style={styles.answerSpace}>
                    <Text style={styles.answerSpaceText}>📝 Subjective - Answer space for written response</Text>
                  </View>
                )}

                <View style={styles.questionMeta}>
                  {q.difficulty && (
                    <View style={[styles.metaPill, styles[`difficulty_${q.difficulty}`]]}>
                      <Text style={styles.metaPillText}>{q.difficulty}</Text>
                    </View>
                  )}
                  {q.chapter && (
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{q.chapter}</Text>
                    </View>
                  )}
                  {(q.topics || []).slice(0, 3).map((t, i) => (
                    <View key={i} style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{t}</Text>
                    </View>
                  ))}
                  {(q.topics || []).length > 3 && (
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>+{(q.topics || []).length - 3} more</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Question Editor Modal */}
      <Modal visible={editingQuestion !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalTitle}>Edit Question {editingQuestionIndex !== null ? editingQuestionIndex + 1 : ""}</Text>
              
              {editingQuestion && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Question Text *</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={editingQuestion.text}
                      onChangeText={(t) => setEditingQuestion({ ...editingQuestion, text: t })}
                      multiline
                      placeholder="Enter the question..."
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Image (optional)</Text>
                    <View style={styles.imageUploadSection}>
                      {/* Hidden file input for web */}
                      {Platform.OS === 'web' && (
                        <input
                          ref={editImageInputRef as any}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file && editingQuestion) {
                              handleImageUpload(file, setEditingQuestion, editingQuestion);
                            }
                          }}
                        />
                      )}
                      <Pressable
                        onPress={() => {
                          if (Platform.OS === 'web') {
                            (editImageInputRef.current as any)?.click();
                          }
                        }}
                        disabled={uploadingImage}
                        style={[styles.uploadBtn, uploadingImage && { opacity: 0.6 }]}
                      >
                        <Text style={styles.uploadBtnText}>
                          {uploadingImage ? "Uploading..." : "📷 Choose Image"}
                        </Text>
                      </Pressable>
                      <Text style={styles.orText}>or enter URL:</Text>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={editingQuestion.image || ""}
                        onChangeText={(t) => setEditingQuestion({ ...editingQuestion, image: t || undefined })}
                        placeholder="https://..."
                      />
                      {editingQuestion.image && (
                        <Pressable
                          onPress={() => setEditingQuestion({ ...editingQuestion, image: undefined })}
                          style={styles.removeImageBtn}
                        >
                          <Text style={styles.removeImageBtnText}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                    {editingQuestion.image && (
                      <View style={styles.imagePreviewContainer}>
                        <Image source={{ uri: editingQuestion.image }} style={styles.previewImage} resizeMode="contain" />
                        <Pressable
                          onPress={() => setEditingQuestion({ ...editingQuestion, image: undefined })}
                          style={styles.removeImageOverlay}
                        >
                          <Text style={styles.removeImageOverlayText}>Remove Image</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* Only show options for objective questions */}
                  {editingQuestion.questionType !== "subjective" && (
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Options *</Text>
                      {editingQuestion.options.map((opt, i) => (
                        <View key={i} style={styles.optionInputRow}>
                          <Pressable
                            onPress={() => setEditingQuestion({ ...editingQuestion, correctIndex: i })}
                            style={[
                              styles.correctRadio,
                              editingQuestion.correctIndex === i && styles.correctRadioActive,
                            ]}
                          >
                            <Text style={[
                              styles.correctRadioText,
                              editingQuestion.correctIndex === i && styles.correctRadioTextActive,
                            ]}>
                              {String.fromCharCode(65 + i)}
                            </Text>
                          </Pressable>
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            value={opt}
                            onChangeText={(t) => {
                              const newOpts = [...editingQuestion.options];
                              newOpts[i] = t;
                              setEditingQuestion({ ...editingQuestion, options: newOpts });
                            }}
                            placeholder={`Option ${String.fromCharCode(65 + i)}`}
                          />
                        </View>
                      ))}
                      <Text style={styles.formHint}>Click the letter to mark as correct answer</Text>
                    </View>
                  )}
                  
                  {/* Show subjective indicator */}
                  {editingQuestion.questionType === "subjective" && (
                    <View style={styles.formGroup}>
                      <View style={styles.subjectiveIndicator}>
                        <Text style={styles.subjectiveIndicatorText}>
                          ✍️ This is a subjective question - options are not applicable
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Difficulty</Text>
                    <View style={styles.chipRow}>
                      {DIFFICULTIES.map((d) => (
                        <Pressable
                          key={d}
                          onPress={() => setEditingQuestion({ ...editingQuestion, difficulty: d })}
                          style={[styles.chip, editingQuestion.difficulty === d && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, editingQuestion.difficulty === d && styles.chipTextActive]}>{d}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Chapter</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      <Pressable
                        onPress={() => setEditingQuestion({ ...editingQuestion, chapter: undefined })}
                        style={[styles.chip, !editingQuestion.chapter && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, !editingQuestion.chapter && styles.chipTextActive]}>None</Text>
                      </Pressable>
                      {chapters.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setEditingQuestion({ ...editingQuestion, chapter: c })}
                          style={[styles.chip, editingQuestion.chapter === c && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, editingQuestion.chapter === c && styles.chipTextActive]}>{c}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Topics</Text>
                    <View style={styles.inputWithBtn}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={editingQuestion._tempTopicInput || ""}
                        onChangeText={(t) => setEditingQuestion({ ...editingQuestion, _tempTopicInput: t })}
                        placeholder="Add topic"
                        onSubmitEditing={() => addTopicToQuestion(editingQuestion, setEditingQuestion)}
                      />
                      <Pressable onPress={() => addTopicToQuestion(editingQuestion, setEditingQuestion)} style={styles.addBtn}>
                        <Text style={styles.addBtnText}>Add</Text>
                      </Pressable>
                    </View>
                    {(editingQuestion.topics || []).length > 0 && (
                      <View style={styles.chipRow}>
                        {(editingQuestion.topics || []).map((t, i) => (
                          <Pressable 
                            key={i} 
                            onPress={() => removeTopicFromQuestion(editingQuestion, setEditingQuestion, t)}
                            style={[styles.chip, styles.removeChip]}
                          >
                            <Text style={styles.chipText}>✕ {t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Tags</Text>
                    <View style={styles.inputWithBtn}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={editingQuestion._tempTagInput || ""}
                        onChangeText={(t) => setEditingQuestion({ ...editingQuestion, _tempTagInput: t })}
                        placeholder="Add tag"
                        onSubmitEditing={() => addTagToQuestion(editingQuestion, setEditingQuestion)}
                      />
                      <Pressable onPress={() => addTagToQuestion(editingQuestion, setEditingQuestion)} style={styles.addBtn}>
                        <Text style={styles.addBtnText}>Add</Text>
                      </Pressable>
                    </View>
                    {(editingQuestion.tags || []).length > 0 && (
                      <View style={styles.chipRow}>
                        {(editingQuestion.tags || []).map((t, i) => (
                          <Pressable 
                            key={i} 
                            onPress={() => removeTagFromQuestion(editingQuestion, setEditingQuestion, t)}
                            style={[styles.chip, styles.removeChip]}
                          >
                            <Text style={styles.chipText}>✕ {t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => { setEditingQuestion(null); setEditingQuestionIndex(null); }}
                style={[styles.modalBtn, styles.modalBtnCancel]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={handleSaveQuestion}
                style={[styles.modalBtn, styles.modalBtnSave, saving && { opacity: 0.7 }]}
              >
                <Text style={styles.modalBtnSaveText}>{saving ? "Saving..." : "Save Question"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Question Modal */}
      <Modal visible={showAddQuestion} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalTitle}>Add New Question</Text>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Question Text *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={newQuestion.text}
                  onChangeText={(t) => setNewQuestion({ ...newQuestion, text: t })}
                  multiline
                  placeholder="Enter the question..."
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Image (optional)</Text>
                <View style={styles.imageUploadSection}>
                  {/* Hidden file input for web */}
                  {Platform.OS === 'web' && (
                    <input
                      ref={newImageInputRef as any}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          handleImageUpload(file, setNewQuestion, newQuestion);
                        }
                      }}
                    />
                  )}
                  <Pressable
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        (newImageInputRef.current as any)?.click();
                      }
                    }}
                    disabled={uploadingImage}
                    style={[styles.uploadBtn, uploadingImage && { opacity: 0.6 }]}
                  >
                    <Text style={styles.uploadBtnText}>
                      {uploadingImage ? "Uploading..." : "📷 Choose Image"}
                    </Text>
                  </Pressable>
                  <Text style={styles.orText}>or enter URL:</Text>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={newQuestion.image || ""}
                    onChangeText={(t) => setNewQuestion({ ...newQuestion, image: t || undefined })}
                    placeholder="https://..."
                  />
                  {newQuestion.image && (
                    <Pressable
                      onPress={() => setNewQuestion({ ...newQuestion, image: undefined })}
                      style={styles.removeImageBtn}
                    >
                      <Text style={styles.removeImageBtnText}>✕</Text>
                    </Pressable>
                  )}
                </View>
                {newQuestion.image && (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: newQuestion.image }} style={styles.previewImage} resizeMode="contain" />
                    <Pressable
                      onPress={() => setNewQuestion({ ...newQuestion, image: undefined })}
                      style={styles.removeImageOverlay}
                    >
                      <Text style={styles.removeImageOverlayText}>Remove Image</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {/* Only show options for objective papers */}
              {paper.paperType !== "subjective" && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Options *</Text>
                  {newQuestion.options.map((opt, i) => (
                    <View key={i} style={styles.optionInputRow}>
                      <Pressable
                        onPress={() => setNewQuestion({ ...newQuestion, correctIndex: i })}
                        style={[
                          styles.correctRadio,
                          newQuestion.correctIndex === i && styles.correctRadioActive,
                        ]}
                      >
                        <Text style={[
                          styles.correctRadioText,
                          newQuestion.correctIndex === i && styles.correctRadioTextActive,
                        ]}>
                          {String.fromCharCode(65 + i)}
                        </Text>
                      </Pressable>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={opt}
                        onChangeText={(t) => {
                          const newOpts = [...newQuestion.options];
                          newOpts[i] = t;
                          setNewQuestion({ ...newQuestion, options: newOpts });
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      />
                    </View>
                  ))}
                  <Text style={styles.formHint}>Click the letter to mark as correct answer</Text>
                </View>
              )}
              
              {/* Show subjective indicator for subjective papers */}
              {paper.paperType === "subjective" && (
                <View style={styles.formGroup}>
                  <View style={styles.subjectiveIndicator}>
                    <Text style={styles.subjectiveIndicatorText}>
                      ✍️ This is a subjective paper - options are not applicable
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Difficulty</Text>
                <View style={styles.chipRow}>
                  {DIFFICULTIES.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setNewQuestion({ ...newQuestion, difficulty: d })}
                      style={[styles.chip, newQuestion.difficulty === d && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, newQuestion.difficulty === d && styles.chipTextActive]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Chapter</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable
                    onPress={() => setNewQuestion({ ...newQuestion, chapter: undefined })}
                    style={[styles.chip, !newQuestion.chapter && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, !newQuestion.chapter && styles.chipTextActive]}>None</Text>
                  </Pressable>
                  {chapters.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setNewQuestion({ ...newQuestion, chapter: c })}
                      style={[styles.chip, newQuestion.chapter === c && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, newQuestion.chapter === c && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Topics</Text>
                <View style={styles.inputWithBtn}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={newQuestion._tempTopicInput || ""}
                    onChangeText={(t) => setNewQuestion({ ...newQuestion, _tempTopicInput: t })}
                    placeholder="Add topic"
                    onSubmitEditing={() => addTopicToQuestion(newQuestion, setNewQuestion)}
                  />
                  <Pressable onPress={() => addTopicToQuestion(newQuestion, setNewQuestion)} style={styles.addBtn}>
                    <Text style={styles.addBtnText}>Add</Text>
                  </Pressable>
                </View>
                {(newQuestion.topics || []).length > 0 && (
                  <View style={styles.chipRow}>
                    {(newQuestion.topics || []).map((t, i) => (
                      <Pressable 
                        key={i} 
                        onPress={() => removeTopicFromQuestion(newQuestion, setNewQuestion, t)}
                        style={[styles.chip, styles.removeChip]}
                      >
                        <Text style={styles.chipText}>✕ {t}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tags</Text>
                <View style={styles.inputWithBtn}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={newQuestion._tempTagInput || ""}
                    onChangeText={(t) => setNewQuestion({ ...newQuestion, _tempTagInput: t })}
                    placeholder="Add tag"
                    onSubmitEditing={() => addTagToQuestion(newQuestion, setNewQuestion)}
                  />
                  <Pressable onPress={() => addTagToQuestion(newQuestion, setNewQuestion)} style={styles.addBtn}>
                    <Text style={styles.addBtnText}>Add</Text>
                  </Pressable>
                </View>
                {(newQuestion.tags || []).length > 0 && (
                  <View style={styles.chipRow}>
                    {(newQuestion.tags || []).map((t, i) => (
                      <Pressable 
                        key={i} 
                        onPress={() => removeTagFromQuestion(newQuestion, setNewQuestion, t)}
                        style={[styles.chip, styles.removeChip]}
                      >
                        <Text style={styles.chipText}>✕ {t}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowAddQuestion(false)}
                style={[styles.modalBtn, styles.modalBtnCancel]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={handleAddQuestion}
                style={[styles.modalBtn, styles.modalBtnSave, saving && { opacity: 0.7 }]}
              >
                <Text style={styles.modalBtnSaveText}>{saving ? "Adding..." : "Add Question"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Paper Meta Editor Modal */}
      <Modal visible={showMetaEditor} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalTitle}>Edit Paper Details</Text>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={paper.title}
                  onChangeText={(t) => setPaper({ ...paper, title: t })}
                  placeholder="Paper title"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={paper.description || ""}
                  onChangeText={(t) => setPaper({ ...paper, description: t || undefined })}
                  multiline
                  placeholder="Optional description..."
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Subject</Text>
                <View style={styles.chipRow}>
                  {SUBJECTS.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setPaper({ ...paper, subject: s })}
                      style={[styles.chip, paper.subject === s && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, paper.subject === s && styles.chipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Chapter</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable
                    onPress={() => setPaper({ ...paper, chapter: null })}
                    style={[styles.chip, !paper.chapter && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, !paper.chapter && styles.chipTextActive]}>None</Text>
                  </Pressable>
                  {(SUBJECT_TO_CHAPTERS[paper.subject] || []).map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setPaper({ ...paper, chapter: c })}
                      style={[styles.chip, paper.chapter === c && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, paper.chapter === c && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Overall Difficulty</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => setPaper({ ...paper, overallDifficulty: null })}
                    style={[styles.chip, !paper.overallDifficulty && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, !paper.overallDifficulty && styles.chipTextActive]}>None</Text>
                  </Pressable>
                  {DIFFICULTIES.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setPaper({ ...paper, overallDifficulty: d })}
                      style={[styles.chip, paper.overallDifficulty === d && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, paper.overallDifficulty === d && styles.chipTextActive]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Status</Text>
                <View style={styles.chipRow}>
                  {STATUSES.map((s) => {
                    const colors = getStatusColor(s);
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setPaper({ ...paper, status: s })}
                        style={[
                          styles.chip,
                          paper.status === s && { backgroundColor: colors.bg, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[
                          styles.chipText,
                          paper.status === s && { color: colors.text, fontWeight: "600" },
                        ]}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => { setShowMetaEditor(false); fetchPaper(); }}
                style={[styles.modalBtn, styles.modalBtnCancel]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={handleSavePaperMeta}
                style={[styles.modalBtn, styles.modalBtnSave, saving && { opacity: 0.7 }]}
              >
                <Text style={styles.modalBtnSaveText}>{saving ? "Saving..." : "Save Details"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#f9fafb" },
  container: { padding: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  loadingText: { marginTop: 12, color: "#6b7280", fontSize: 14 },
  errorText: { fontSize: 16, color: "#dc2626", marginBottom: 16 },
  backBtn: { backgroundColor: "#111827", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: "#fff", fontWeight: "600" },
  
  // Paper Header
  paperHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 },
  paperHeaderLeft: { flex: 1, minWidth: 200 },
  paperHeaderRight: { flexDirection: "row", gap: 8, alignItems: "center" },
  backLink: { marginBottom: 8 },
  backLinkText: { color: "#6b7280", fontSize: 13 },
  paperTitle: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 4 },
  paperSubtitle: { fontSize: 14, color: "#6b7280" },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  editMetaBtn: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  editMetaBtnText: { color: "#374151", fontWeight: "500", fontSize: 13 },
  
  // Questions Section
  questionsSection: { gap: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#111827" },
  addQuestionBtn: { backgroundColor: "#16a34a", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addQuestionBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  emptyQuestions: { alignItems: "center", padding: 40, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  emptyText: { color: "#6b7280", fontSize: 14 },
  
  // Question Card
  questionCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  questionCardEditing: { borderColor: "#3b82f6", borderWidth: 2 },
  questionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  questionIndex: { fontSize: 14, fontWeight: "700", color: "#6b7280", backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  questionActions: { flexDirection: "row", gap: 8 },
  questionActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: "#f3f4f6" },
  questionActionText: { fontSize: 12, fontWeight: "500", color: "#374151" },
  deleteActionBtn: { backgroundColor: "#fef2f2" },
  deleteActionText: { fontSize: 12, fontWeight: "500", color: "#dc2626" },
  questionText: { fontSize: 15, color: "#111827", lineHeight: 22, marginBottom: 12 },
  imageContainer: { marginBottom: 12, borderRadius: 8, overflow: "hidden", backgroundColor: "#f3f4f6" },
  questionImage: { width: "100%", height: 200 },
  optionsContainer: { gap: 8, marginBottom: 12 },
  optionRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 10, borderRadius: 8, backgroundColor: "#f9fafb" },
  optionCorrect: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  optionLetter: { width: 24, fontSize: 14, fontWeight: "600", color: "#6b7280" },
  optionLetterCorrect: { color: "#065f46" },
  optionText: { flex: 1, fontSize: 14, color: "#374151" },
  optionTextCorrect: { color: "#065f46", fontWeight: "500" },
  questionMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  metaPillText: { fontSize: 11, color: "#374151", fontWeight: "500" },
  difficulty_easy: { backgroundColor: "#d1fae5", borderColor: "#6ee7b7" },
  difficulty_medium: { backgroundColor: "#fef3c7", borderColor: "#fcd34d" },
  difficulty_hard: { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%", minHeight: "50%" },
  modalScroll: { padding: 20, paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 20 },
  modalActions: { flexDirection: "row", gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalBtnCancel: { backgroundColor: "#f3f4f6" },
  modalBtnCancelText: { color: "#374151", fontWeight: "600" },
  modalBtnSave: { backgroundColor: "#111827" },
  modalBtnSaveText: { color: "#fff", fontWeight: "600" },
  
  // Form
  formGroup: { marginBottom: 20 },
  formLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  formHint: { fontSize: 12, color: "#9ca3af", marginTop: 6 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingHorizontal: 12, height: 44, backgroundColor: "#fff", fontSize: 14 },
  textArea: { height: 100, paddingTop: 12, textAlignVertical: "top" },
  previewImage: { width: "100%", height: 150, borderRadius: 8, backgroundColor: "#f3f4f6" },
  imageUploadSection: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  uploadBtn: { backgroundColor: "#3b82f6", paddingHorizontal: 16, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  uploadBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  orText: { color: "#9ca3af", fontSize: 12 },
  removeImageBtn: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", alignItems: "center", justifyContent: "center" },
  removeImageBtnText: { color: "#dc2626", fontSize: 18, fontWeight: "600" },
  imagePreviewContainer: { marginTop: 12, position: "relative", borderRadius: 12, overflow: "hidden" },
  removeImageOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(220, 38, 38, 0.9)", paddingVertical: 8, alignItems: "center" },
  removeImageOverlayText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  optionInputRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  correctRadio: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d1d5db" },
  correctRadioActive: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  correctRadioText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  correctRadioTextActive: { color: "#fff" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  removeChip: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  inputWithBtn: { flexDirection: "row", gap: 8 },
  addBtn: { backgroundColor: "#111827", paddingHorizontal: 16, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  // Subjective question styles
  answerSpace: { backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 16, marginTop: 8, marginBottom: 8, borderStyle: "dashed" },
  answerSpaceText: { color: "#9ca3af", fontStyle: "italic", textAlign: "center" },
  subjectiveIndicator: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0", borderRadius: 8, padding: 12 },
  subjectiveIndicatorText: { color: "#065f46", fontSize: 14 },
});

