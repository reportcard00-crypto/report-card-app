import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  listQuestionPapers,
  deleteQuestionPaper,
  listClassrooms,
  assignPaperToClassroom,
  uploadFileDirect,
  uploadPdfToQuestionPaper,
  type QuestionPaperListItem,
  type ClassroomListItem,
} from "@/api/client";

const SUBJECTS = [
  "Mathematics", "Science", "Physics", "Chemistry", "Biology",
  "English", "History", "Geography", "Computer Science", "Economics",
];

export default function TeacherPapersScreen() {
  const router = useRouter();
  const [papers, setPapers] = useState<QuestionPaperListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Assign modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<QuestionPaperListItem | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomListItem[]>([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // PDF upload modal state
  const [showPdfUploadModal, setShowPdfUploadModal] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfSubject, setPdfSubject] = useState("");
  const [pdfSubjectOpen, setPdfSubjectOpen] = useState(false);
  const [pdfFileUri, setPdfFileUri] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [questionsExtracted, setQuestionsExtracted] = useState(0);

  const fetchPapers = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const resp = await listQuestionPapers({
        page,
        limit: 20,
        search: search.trim() || undefined,
      });
      setPapers(resp.data);
      setTotalPages(resp.meta.totalPages);
      setTotal(resp.meta.total);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || e?.message || "Failed to load papers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search]);

  const fetchClassrooms = useCallback(async () => {
    try {
      setLoadingClassrooms(true);
      const resp = await listClassrooms({ limit: 100 });
      setClassrooms(resp.data);
    } catch (e: any) {
      Alert.alert("Error", "Failed to load classrooms");
    } finally {
      setLoadingClassrooms(false);
    }
  }, []);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  useFocusEffect(
    useCallback(() => {
      fetchPapers(false);
    }, [fetchPapers])
  );

  const handleDelete = (paper: QuestionPaperListItem) => {
    Alert.alert(
      "Delete Paper",
      `Are you sure you want to delete "${paper.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteQuestionPaper(paper._id);
              Alert.alert("Deleted", "Paper has been deleted.");
              fetchPapers(false);
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.message || "Failed to delete");
            }
          },
        },
      ]
    );
  };

  const handleOpenAssignModal = (paper: QuestionPaperListItem) => {
    setSelectedPaper(paper);
    setSelectedClassroom(null);
    setShowAssignModal(true);
    fetchClassrooms();
  };

  const handleAssign = async () => {
    if (!selectedPaper || !selectedClassroom) {
      Alert.alert("Error", "Please select a classroom");
      return;
    }

    try {
      setIsAssigning(true);
      await assignPaperToClassroom({
        paperId: selectedPaper._id,
        classroomId: selectedClassroom,
        title: selectedPaper.title,
      });
      setShowAssignModal(false);
      Alert.alert(
        "Assigned!",
        `"${selectedPaper.title}" has been assigned. Go to Test Sessions to start the test.`,
        [
          { text: "View Test Sessions", onPress: () => router.push("/teacher/test-sessions" as any) },
          { text: "OK" },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to assign paper");
    } finally {
      setIsAssigning(false);
    }
  };

  const handlePickPdf = async () => {
    // On mobile, we'd use expo-document-picker
    // For now, show a URL input approach
    Alert.alert(
      "Upload PDF",
      "Please provide a PDF URL to upload and extract questions from.",
      [{ text: "OK" }]
    );
  };

  const handleUploadPdf = async () => {
    if (!pdfTitle.trim() || !pdfSubject.trim()) {
      Alert.alert("Error", "Please fill in the title and subject");
      return;
    }

    if (!pdfFileUri) {
      Alert.alert("Error", "Please provide a PDF URL");
      return;
    }

    try {
      setIsUploadingPdf(true);
      setUploadProgress(0);
      setUploadStatus("Starting extraction...");
      setQuestionsExtracted(0);

      await uploadPdfToQuestionPaper(
        {
          fileUrl: pdfFileUri,
          fileName: pdfFileName || "question-paper.pdf",
          title: pdfTitle.trim(),
          subject: pdfSubject,
        },
        (event) => {
          if (event.type === "status") {
            setUploadStatus(event.message || "Processing...");
            setUploadProgress(event.progress || 0);
          } else if (event.type === "question_extracted") {
            setQuestionsExtracted(prev => prev + 1);
          } else if (event.type === "complete") {
            setUploadStatus("Complete!");
            setUploadProgress(100);
          } else if (event.type === "error") {
            setUploadStatus(`Error: ${event.message}`);
          }
        }
      );

      setShowPdfUploadModal(false);
      setPdfTitle("");
      setPdfSubject("");
      setPdfFileUri(null);
      setPdfFileName("");
      setUploadStatus("");
      setUploadProgress(0);
      setQuestionsExtracted(0);

      Alert.alert("Success!", "Question paper has been created from the PDF.");
      fetchPapers(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to upload PDF");
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "finalized": return { bg: "#d1fae5", text: "#065f46" };
      case "draft": return { bg: "#fef3c7", text: "#92400e" };
      case "archived": return { bg: "#e5e7eb", text: "#374151" };
      default: return { bg: "#f3f4f6", text: "#374151" };
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPapers(false); }} colors={["#2563eb"]} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Question Papers</Text>
        <Pressable onPress={() => setShowPdfUploadModal(true)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>+ Upload PDF</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.filterSection}>
        <TextInput
          placeholder="Search papers..."
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
          style={[styles.input, { flex: 1 }]}
          returnKeyType="search"
          placeholderTextColor="#9ca3af"
        />
      </View>

      <Text style={styles.resultsInfo}>
        {total} paper{total !== 1 ? "s" : ""} found
        {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
      </Text>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading papers...</Text>
        </View>
      )}

      {!loading && papers.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📄</Text>
          <Text style={styles.emptyTitle}>No question papers yet</Text>
          <Text style={styles.emptySubtitle}>
            {search ? "Try adjusting your search" : "Upload a PDF to create your first question paper"}
          </Text>
          {!search && (
            <Pressable onPress={() => setShowPdfUploadModal(true)} style={[styles.primaryBtn, { marginTop: 16 }]}>
              <Text style={styles.primaryBtnText}>Upload PDF</Text>
            </Pressable>
          )}
        </View>
      )}

      {!loading && papers.length > 0 && (
        <View style={styles.papersGrid}>
          {papers.map((paper) => {
            const colors = getStatusColor(paper.status);
            return (
              <View key={paper._id} style={styles.paperCard}>
                <View style={styles.paperHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paperTitle} numberOfLines={2}>{paper.title}</Text>
                    <Text style={styles.paperSubject}>{paper.subject}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      {paper.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.paperMeta}>
                  <Text style={styles.paperMetaText}>📝 {paper.questionsCount} questions</Text>
                  <Text style={styles.paperMetaText}>
                    {new Date(paper.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                <View style={styles.paperActions}>
                  <Pressable
                    onPress={() => handleOpenAssignModal(paper)}
                    style={[styles.actionBtn, styles.assignBtn]}
                  >
                    <Text style={styles.actionBtnText}>Assign to Class</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(paper)}
                    style={[styles.actionBtn, styles.deleteBtn]}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <View style={styles.pagination}>
          <Pressable
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
          >
            <Text style={[styles.pageBtnText, page <= 1 && styles.pageBtnTextDisabled]}>← Prev</Text>
          </Pressable>
          <Text style={styles.pageInfo}>Page {page} of {totalPages}</Text>
          <Pressable
            disabled={page >= totalPages}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
          >
            <Text style={[styles.pageBtnText, page >= totalPages && styles.pageBtnTextDisabled]}>Next →</Text>
          </Pressable>
        </View>
      )}

      {/* Assign to Classroom Modal */}
      <Modal
        visible={showAssignModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign to Classroom</Text>
            {selectedPaper && (
              <Text style={styles.modalSubtitle}>"{selectedPaper.title}"</Text>
            )}

            {loadingClassrooms ? (
              <ActivityIndicator color="#2563eb" style={{ marginVertical: 20 }} />
            ) : classrooms.length === 0 ? (
              <View style={styles.noClassroomsMsg}>
                <Text style={styles.noClassroomsMsgText}>No classrooms found.</Text>
                <Text style={styles.noClassroomsMsgHint}>Create a classroom first.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {classrooms.map((classroom) => (
                  <Pressable
                    key={classroom._id}
                    onPress={() => setSelectedClassroom(classroom._id)}
                    style={[
                      styles.classroomOption,
                      selectedClassroom === classroom._id && styles.classroomOptionSelected,
                    ]}
                  >
                    <View style={styles.classroomOptionInfo}>
                      <Text style={[
                        styles.classroomOptionName,
                        selectedClassroom === classroom._id && styles.classroomOptionNameSelected,
                      ]}>
                        {classroom.name}
                      </Text>
                      <Text style={styles.classroomOptionStudents}>
                        {classroom.studentsCount} students
                      </Text>
                    </View>
                    {selectedClassroom === classroom._id && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowAssignModal(false)}
                style={[styles.modalBtn, styles.modalCancelBtn]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAssign}
                disabled={isAssigning || !selectedClassroom}
                style={[styles.modalBtn, styles.modalCreateBtn, (!selectedClassroom || isAssigning) && { opacity: 0.5 }]}
              >
                <Text style={styles.modalCreateBtnText}>{isAssigning ? "Assigning..." : "Assign"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF Upload Modal */}
      <Modal
        visible={showPdfUploadModal}
        transparent
        animationType="fade"
        onRequestClose={() => !isUploadingPdf && setShowPdfUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Question Paper PDF</Text>

            <Text style={styles.inputLabel}>Paper Title *</Text>
            <TextInput
              placeholder="e.g., Physics Mid-Term 2024"
              value={pdfTitle}
              onChangeText={setPdfTitle}
              style={styles.modalInput}
              editable={!isUploadingPdf}
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.inputLabel}>Subject *</Text>
            <Pressable
              style={[styles.modalInput, { justifyContent: "center" }]}
              onPress={() => !isUploadingPdf && setPdfSubjectOpen(!pdfSubjectOpen)}
            >
              <Text style={{ color: pdfSubject ? "#111827" : "#9ca3af" }}>
                {pdfSubject || "Select subject"}
              </Text>
            </Pressable>
            {pdfSubjectOpen && (
              <View style={styles.dropdownPanel}>
                <ScrollView style={{ maxHeight: 200 }}>
                  {SUBJECTS.map((s) => (
                    <Pressable
                      key={s}
                      style={styles.dropdownItem}
                      onPress={() => { setPdfSubject(s); setPdfSubjectOpen(false); }}
                    >
                      <Text style={styles.dropdownText}>{s}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.inputLabel}>PDF URL *</Text>
            <TextInput
              placeholder="https://example.com/paper.pdf"
              value={pdfFileUri || ""}
              onChangeText={setPdfFileUri}
              style={styles.modalInput}
              editable={!isUploadingPdf}
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor="#9ca3af"
            />

            {isUploadingPdf && (
              <View style={styles.uploadProgress}>
                <ActivityIndicator color="#2563eb" />
                <Text style={styles.uploadStatusText}>{uploadStatus}</Text>
                {questionsExtracted > 0 && (
                  <Text style={styles.questionsExtractedText}>
                    {questionsExtracted} questions extracted so far...
                  </Text>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  if (!isUploadingPdf) {
                    setShowPdfUploadModal(false);
                    setPdfTitle("");
                    setPdfSubject("");
                    setPdfFileUri(null);
                    setUploadStatus("");
                    setUploadProgress(0);
                    setQuestionsExtracted(0);
                  }
                }}
                disabled={isUploadingPdf}
                style={[styles.modalBtn, styles.modalCancelBtn, isUploadingPdf && { opacity: 0.5 }]}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleUploadPdf}
                disabled={isUploadingPdf || !pdfTitle.trim() || !pdfSubject.trim() || !pdfFileUri}
                style={[
                  styles.modalBtn,
                  styles.modalCreateBtn,
                  (isUploadingPdf || !pdfTitle.trim() || !pdfSubject.trim() || !pdfFileUri) && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.modalCreateBtnText}>
                  {isUploadingPdf ? "Uploading..." : "Upload & Extract"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#1e3a5f" },
  primaryBtn: { backgroundColor: "#2563eb", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  filterSection: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingHorizontal: 12, height: 42, backgroundColor: "#fff", color: "#111827" },
  resultsInfo: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  loadingContainer: { alignItems: "center", paddingVertical: 60 },
  loadingText: { marginTop: 12, color: "#6b7280" },
  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  papersGrid: { gap: 16 },
  paperCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  paperHeader: { flexDirection: "row", gap: 12, marginBottom: 10 },
  paperTitle: { fontSize: 16, fontWeight: "600", color: "#1e3a5f", marginBottom: 4 },
  paperSubject: { fontSize: 13, color: "#6b7280" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  paperMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  paperMetaText: { fontSize: 13, color: "#6b7280" },
  paperActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center" },
  assignBtn: { backgroundColor: "#2563eb" },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  deleteBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  deleteBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  pagination: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 24 },
  pageBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  pageBtnDisabled: { opacity: 0.5 },
  pageBtnText: { color: "#374151", fontWeight: "500" },
  pageBtnTextDisabled: { color: "#9ca3af" },
  pageInfo: { fontSize: 14, color: "#6b7280" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 450,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#1e3a5f", marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: "#6b7280", marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: "#f9fafb",
    color: "#111827",
    height: 44,
  },
  dropdownPanel: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#fff",
    marginTop: -12,
    marginBottom: 16,
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  dropdownText: { color: "#111827", fontSize: 15 },
  noClassroomsMsg: { alignItems: "center", paddingVertical: 20 },
  noClassroomsMsgText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  noClassroomsMsgHint: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  classroomOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  classroomOptionSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  classroomOptionInfo: {},
  classroomOptionName: { fontSize: 15, fontWeight: "600", color: "#374151" },
  classroomOptionNameSelected: { color: "#2563eb" },
  classroomOptionStudents: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  checkmark: { fontSize: 18, color: "#2563eb", fontWeight: "700" },
  uploadProgress: { alignItems: "center", paddingVertical: 16, gap: 8 },
  uploadStatusText: { fontSize: 14, color: "#374151", textAlign: "center" },
  questionsExtractedText: { fontSize: 13, color: "#059669", fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  modalCancelBtn: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#d1d5db" },
  modalCancelBtnText: { color: "#374151", fontWeight: "600" },
  modalCreateBtn: { backgroundColor: "#2563eb" },
  modalCreateBtnText: { color: "#fff", fontWeight: "600" },
});
