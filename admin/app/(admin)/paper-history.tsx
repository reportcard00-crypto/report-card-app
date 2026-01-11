import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { 
  listQuestionPapers, 
  deleteQuestionPaper, 
  duplicateQuestionPaper,
  type QuestionPaperListItem 
} from "@/api/admin";
import { SUBJECTS } from "@/store/questionEditor";

const STATUSES = ["all", "draft", "finalized", "archived"] as const;

export default function PaperHistoryScreen() {
  const router = useRouter();
  const [papers, setPapers] = useState<QuestionPaperListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<typeof STATUSES[number]>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPapers = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const resp = await listQuestionPapers({
        page,
        limit: 20,
        search: search.trim() || undefined,
        subject: subjectFilter || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
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
  }, [page, search, subjectFilter, statusFilter]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  // Refresh when screen comes into focus
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

  const handleDuplicate = async (paper: QuestionPaperListItem) => {
    try {
      const resp = await duplicateQuestionPaper(paper._id);
      Alert.alert(
        "Duplicated!",
        `Created "${resp.data.title}"`,
        [
          { text: "Edit Copy", onPress: () => router.push(`/paper-editor?id=${resp.data._id}` as any) },
          { text: "OK", onPress: () => fetchPapers(false) },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.message || "Failed to duplicate");
    }
  };

  const handleEdit = (paper: QuestionPaperListItem) => {
    router.push(`/paper-editor?id=${paper._id}` as any);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" };
      case "finalized": return { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" };
      case "archived": return { bg: "#e5e7eb", border: "#9ca3af", text: "#374151" };
      default: return { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" };
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Paper History</Text>
        <Pressable onPress={() => router.push("/paper-generator" as any)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>+ New Paper</Text>
        </Pressable>
      </View>

      {/* Search & Filters */}
      <View style={styles.filterSection}>
        <TextInput
          placeholder="Search by title..."
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
          style={[styles.input, { flex: 1 }]}
          returnKeyType="search"
        />
        <Pressable onPress={() => { setRefreshing(true); fetchPapers(false); }} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>{refreshing ? "..." : "↻"}</Text>
        </Pressable>
      </View>

      {/* Subject Filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Subject:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            onPress={() => { setSubjectFilter(null); setPage(1); }}
            style={[styles.filterChip, !subjectFilter && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, !subjectFilter && styles.filterChipTextActive]}>All</Text>
          </Pressable>
          {SUBJECTS.map((s) => (
            <Pressable
              key={s}
              onPress={() => { setSubjectFilter(subjectFilter === s ? null : s); setPage(1); }}
              style={[styles.filterChip, subjectFilter === s && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, subjectFilter === s && styles.filterChipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Status Filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Status:</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              onPress={() => { setStatusFilter(s); setPage(1); }}
              style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Results Info */}
      <Text style={styles.resultsInfo}>
        {total} paper{total !== 1 ? "s" : ""} found
        {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
      </Text>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
          <Text style={styles.loadingText}>Loading papers...</Text>
        </View>
      )}

      {/* Papers List */}
      {!loading && papers.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No papers found</Text>
          <Text style={styles.emptySubtitle}>
            {search || subjectFilter || statusFilter !== "all"
              ? "Try adjusting your filters"
              : "Generate your first question paper to get started"}
          </Text>
          {!search && !subjectFilter && statusFilter === "all" && (
            <Pressable onPress={() => router.push("/paper-generator" as any)} style={[styles.primaryBtn, { marginTop: 16 }]}>
              <Text style={styles.primaryBtnText}>Generate Paper</Text>
            </Pressable>
          )}
        </View>
      )}

      {!loading && papers.length > 0 && (
        <View style={styles.papersGrid}>
          {papers.map((paper) => {
            const statusColors = getStatusColor(paper.status);
            return (
              <View key={paper._id} style={styles.paperCard}>
                <View style={styles.paperHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paperTitle} numberOfLines={2}>{paper.title}</Text>
                    <Text style={styles.paperMeta}>{paper.subject}{paper.chapter ? ` • ${paper.chapter}` : ""}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
                    <Text style={[styles.statusText, { color: statusColors.text }]}>{paper.status}</Text>
                  </View>
                </View>

                {paper.description && (
                  <Text style={styles.paperDesc} numberOfLines={2}>{paper.description}</Text>
                )}

                <View style={styles.paperStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{paper.questionsCount}</Text>
                    <Text style={styles.statLabel}>Questions</Text>
                  </View>
                  {paper.modelVersion && (
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{paper.modelVersion}</Text>
                      <Text style={styles.statLabel}>Model</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.paperDate}>Updated: {formatDate(paper.updatedAt)}</Text>

                <View style={styles.paperActions}>
                  <Pressable onPress={() => handleEdit(paper)} style={[styles.actionBtn, styles.editBtn]}>
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDuplicate(paper)} style={[styles.actionBtn, styles.duplicateBtn]}>
                    <Text style={styles.duplicateBtnText}>Duplicate</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(paper)} style={[styles.actionBtn, styles.deleteBtn]}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  primaryBtn: { backgroundColor: "#111827", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "600" },
  filterSection: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingHorizontal: 12, height: 42, backgroundColor: "#fff" },
  refreshBtn: { width: 42, height: 42, borderRadius: 8, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d1d5db" },
  refreshBtnText: { fontSize: 18, color: "#374151" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  filterLabel: { fontSize: 13, fontWeight: "600", color: "#6b7280", minWidth: 55 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  filterChipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  filterChipText: { fontSize: 13, color: "#374151" },
  filterChipTextActive: { color: "#fff", fontWeight: "600" },
  resultsInfo: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  loadingContainer: { alignItems: "center", paddingVertical: 60 },
  loadingText: { marginTop: 12, color: "#6b7280" },
  emptyContainer: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  papersGrid: { gap: 16 },
  paperCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#e5e7eb", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  paperHeader: { flexDirection: "row", gap: 12, marginBottom: 8 },
  paperTitle: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 4 },
  paperMeta: { fontSize: 13, color: "#6b7280" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  paperDesc: { fontSize: 13, color: "#6b7280", marginBottom: 12 },
  paperStats: { flexDirection: "row", gap: 24, marginBottom: 8 },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 11, color: "#9ca3af", textTransform: "uppercase" },
  paperDate: { fontSize: 12, color: "#9ca3af", marginBottom: 12 },
  paperActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  editBtn: { backgroundColor: "#111827" },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  duplicateBtn: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db" },
  duplicateBtnText: { color: "#374151", fontWeight: "600", fontSize: 13 },
  deleteBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  deleteBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  pagination: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 24 },
  pageBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  pageBtnDisabled: { opacity: 0.5 },
  pageBtnText: { color: "#374151", fontWeight: "500" },
  pageBtnTextDisabled: { color: "#9ca3af" },
  pageInfo: { fontSize: 14, color: "#6b7280" },
});
