import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, Pressable, Modal } from "react-native";
import {
  browseQuestions,
  searchSimilarQuestions,
  getQuestionStats,
  getFilterOptions,
  deleteQuestionFromDb,
  updateQuestion,
  type BrowseQuestion,
  type QuestionStats,
  type FilterOptions,
  type SimilarQuestion,
} from "@/api/admin";
import MathMarkdown from "@/components/MathMarkdown";

type ViewMode = "grid" | "list";
type SearchMode = "text" | "similarity";

const BrowseQuestions = () => {
  // State
  const [questions, setQuestions] = useState<BrowseQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("text");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Similarity search
  const [topK, setTopK] = useState(10);
  const [similarityResults, setSimilarityResults] = useState<SimilarQuestion[]>([]);
  const [searchingSimilar, setSearchingSimilar] = useState(false);
  
  // Stats & Filters data
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  
  // View & UI state
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showFilters, setShowFilters] = useState(true);
  const [showStats, setShowStats] = useState(false);
  
  // Selected question for detail/edit
  const [selectedQuestion, setSelectedQuestion] = useState<BrowseQuestion | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<BrowseQuestion>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load stats and filter options on mount
  useEffect(() => {
    const loadInitialData = async () => {
      setLoadingInitialData(true);
      try {
        const [statsResp, filtersResp] = await Promise.all([
          getQuestionStats(),
          getFilterOptions(),
        ]);
        if (statsResp.success) setStats(statsResp.data);
        if (filtersResp.success) setFilterOptions(filtersResp.data);
      } catch (e) {
        console.error("Failed to load initial data:", e);
      } finally {
        setLoadingInitialData(false);
      }
    };
    loadInitialData();
  }, []);

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    if (searchMode === "similarity" && searchQuery.trim()) {
      // Use similarity search
      setSearchingSimilar(true);
      try {
        const resp = await searchSimilarQuestions({
          query: searchQuery.trim(),
          topK,
          subject: selectedSubject || undefined,
          difficulty: selectedDifficulty || undefined,
        });
        if (resp.success) {
          setSimilarityResults(resp.data);
          setQuestions([]);
          setTotal(resp.data.length);
          setTotalPages(1);
        }
      } catch (e) {
        console.error("Similarity search failed:", e);
      } finally {
        setSearchingSimilar(false);
      }
      return;
    }

    // Regular text search / browse
    setLoading(true);
    try {
      const resp = await browseQuestions({
        page,
        limit,
        search: searchQuery.trim() || undefined,
        subject: selectedSubject || undefined,
        chapter: selectedChapter || undefined,
        difficulty: selectedDifficulty || undefined,
        questionType: selectedType || undefined,
        tags: selectedTags || undefined,
        sortBy,
        sortOrder,
      });
      if (resp.success) {
        setQuestions(resp.data);
        setSimilarityResults([]);
        setTotalPages(resp.meta.totalPages);
        setTotal(resp.meta.total);
      }
    } catch (e) {
      console.error("Failed to fetch questions:", e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, searchMode, selectedSubject, selectedChapter, selectedDifficulty, selectedType, selectedTags, sortBy, sortOrder, topK]);

  // Fetch when filters change (with debounce for search)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchMode === "text" || searchQuery.trim().length === 0) {
        fetchQuestions();
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, selectedSubject, selectedChapter, selectedDifficulty, selectedType, selectedTags, sortBy, sortOrder]);

  // Handle search submit
  const handleSearch = () => {
    setPage(1);
    fetchQuestions();
  };

  // Reset filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedSubject("");
    setSelectedChapter("");
    setSelectedDifficulty("");
    setSelectedType("");
    setSelectedTags("");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
    setSearchMode("text");
  };

  // Find similar to a specific question
  const findSimilar = async (question: BrowseQuestion) => {
    setSearchingSimilar(true);
    try {
      const resp = await searchSimilarQuestions({
        questionId: question._id,
        topK,
        subject: selectedSubject || undefined,
      });
      if (resp.success) {
        setSimilarityResults(resp.data);
        setQuestions([]);
        setTotal(resp.data.length);
        setTotalPages(1);
        setSearchMode("similarity");
        setSearchQuery(`Similar to: "${question.text.substring(0, 50)}..."`);
      }
    } catch (e) {
      console.error("Find similar failed:", e);
    } finally {
      setSearchingSimilar(false);
    }
  };

  // Open question detail
  const openQuestion = (q: BrowseQuestion) => {
    setSelectedQuestion(q);
    setEditForm({ ...q });
    setEditMode(false);
    setShowDetailModal(true);
  };

  // Save question edits
  const handleSave = async () => {
    if (!selectedQuestion) return;
    setSaving(true);
    try {
      const resp = await updateQuestion(selectedQuestion._id, {
        text: editForm.text,
        options: editForm.options,
        correctIndex: editForm.correctIndex,
        chapter: editForm.chapter || null,
        difficulty: editForm.difficulty || null,
        topics: editForm.topics,
        tags: editForm.tags,
        description: editForm.description || null,
      });
      if (resp.success) {
        // Update in list
        setQuestions((prev) =>
          prev.map((q) => (q._id === selectedQuestion._id ? resp.data : q))
        );
        setSimilarityResults((prev) =>
          prev.map((q) => (q._id === selectedQuestion._id ? { ...resp.data, similarityScore: q.similarityScore } : q))
        );
        setSelectedQuestion(resp.data);
        setEditMode(false);
      }
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  // Delete question
  const handleDelete = async () => {
    if (!selectedQuestion) return;
    const confirmed = window.confirm("Are you sure you want to delete this question? This cannot be undone.");
    if (!confirmed) return;
    
    setDeleting(true);
    try {
      const resp = await deleteQuestionFromDb(selectedQuestion._id);
      if (resp.success) {
        setQuestions((prev) => prev.filter((q) => q._id !== selectedQuestion._id));
        setSimilarityResults((prev) => prev.filter((q) => q._id !== selectedQuestion._id));
        setShowDetailModal(false);
        setSelectedQuestion(null);
        setTotal((prev) => prev - 1);
      }
    } catch (e) {
      console.error("Failed to delete:", e);
    } finally {
      setDeleting(false);
    }
  };

  // Available chapters based on selected subject
  const availableChapters = useMemo(() => {
    if (!selectedSubject || !filterOptions) return [];
    return filterOptions.chaptersBySubject[selectedSubject] || [];
  }, [selectedSubject, filterOptions]);

  // Display list (either regular or similarity results)
  const displayList = searchMode === "similarity" && similarityResults.length > 0 ? similarityResults : questions;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "easy": return { bg: "#dcfce7", text: "#166534" };
      case "medium": return { bg: "#fef3c7", text: "#92400e" };
      case "hard": return { bg: "#fee2e2", text: "#991b1b" };
      default: return { bg: "#f3f4f6", text: "#6b7280" };
    }
  };

  const getTypeColor = (type?: string) => {
    return type === "subjective" 
      ? { bg: "#e0e7ff", text: "#3730a3" }
      : { bg: "#dbeafe", text: "#1e40af" };
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      {/* Header */}
      <View style={{ 
        padding: 20, 
        backgroundColor: "#fff", 
        borderBottomWidth: 1, 
        borderBottomColor: "#e2e8f0",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "700", color: "#0f172a", fontFamily: "system-ui" }}>
            Question Database
          </Text>
          <Text style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>
            {total.toLocaleString()} questions in database
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setShowStats(!showStats)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: showStats ? "#6366f1" : "#e2e8f0",
            }}
          >
            <Text style={{ color: showStats ? "#fff" : "#475569", fontWeight: "500" }}>
              📊 Stats
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowFilters(!showFilters)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: showFilters ? "#6366f1" : "#e2e8f0",
            }}
          >
            <Text style={{ color: showFilters ? "#fff" : "#475569", fontWeight: "500" }}>
              🔍 Filters
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Sidebar Filters */}
        {showFilters && (
          <View style={{ 
            width: 280, 
            backgroundColor: "#fff", 
            borderRightWidth: 1, 
            borderRightColor: "#e2e8f0",
            padding: 16,
          }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Search Mode Toggle */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                  Search Mode
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => setSearchMode("text")}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      backgroundColor: searchMode === "text" ? "#6366f1" : "#f1f5f9",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: searchMode === "text" ? "#fff" : "#64748b", fontSize: 13, fontWeight: "500" }}>
                      Text
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSearchMode("similarity")}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 6,
                      backgroundColor: searchMode === "similarity" ? "#6366f1" : "#f1f5f9",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: searchMode === "similarity" ? "#fff" : "#64748b", fontSize: 13, fontWeight: "500" }}>
                      Similar
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Search Input */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                  {searchMode === "similarity" ? "Semantic Query" : "Search"}
                </Text>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={searchMode === "similarity" ? "Describe what you're looking for..." : "Search questions..."}
                  onSubmitEditing={handleSearch}
                  style={{
                    backgroundColor: "#f8fafc",
                    borderWidth: 1,
                    borderColor: "#e2e8f0",
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 14,
                  }}
                  multiline={searchMode === "similarity"}
                  numberOfLines={searchMode === "similarity" ? 3 : 1}
                />
                {searchMode === "similarity" && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Top K results: {topK}</Text>
                    {/* @ts-ignore */}
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={topK}
                      onChange={(e: any) => setTopK(parseInt(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </View>
                )}
                <Pressable
                  onPress={handleSearch}
                  style={{
                    backgroundColor: "#6366f1",
                    paddingVertical: 10,
                    borderRadius: 8,
                    alignItems: "center",
                    marginTop: 10,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>
                    {searchMode === "similarity" ? "🔮 Find Similar" : "🔍 Search"}
                  </Text>
                </Pressable>
              </View>

              {/* Subject Filter */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                  Subject
                </Text>
                {/* @ts-ignore */}
                <select
                  value={selectedSubject}
                  onChange={(e: any) => {
                    setSelectedSubject(e.target.value);
                    setSelectedChapter("");
                    setPage(1);
                  }}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#f8fafc",
                    fontSize: 14,
                  }}
                >
                  {/* @ts-ignore */}
                  <option value="">All Subjects</option>
                  {(filterOptions?.subjects || []).map((s) => (
                    // @ts-ignore
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </View>

              {/* Chapter Filter */}
              {availableChapters.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                    Chapter
                  </Text>
                  {/* @ts-ignore */}
                  <select
                    value={selectedChapter}
                    onChange={(e: any) => {
                      setSelectedChapter(e.target.value);
                      setPage(1);
                    }}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#f8fafc",
                      fontSize: 14,
                    }}
                  >
                    {/* @ts-ignore */}
                    <option value="">All Chapters</option>
                    {availableChapters.map((c) => (
                      // @ts-ignore
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </View>
              )}

              {/* Difficulty Filter */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                  Difficulty
                </Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {["", "easy", "medium", "hard"].map((d) => (
                    <Pressable
                      key={d || "all"}
                      onPress={() => {
                        setSelectedDifficulty(d);
                        setPage(1);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: selectedDifficulty === d 
                          ? (d ? getDifficultyColor(d).bg : "#6366f1")
                          : "#f1f5f9",
                      }}
                    >
                      <Text style={{ 
                        fontSize: 13,
                        color: selectedDifficulty === d 
                          ? (d ? getDifficultyColor(d).text : "#fff")
                          : "#64748b",
                        fontWeight: "500",
                      }}>
                        {d || "All"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Question Type Filter */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                  Type
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["", "objective", "subjective"].map((t) => (
                    <Pressable
                      key={t || "all"}
                      onPress={() => {
                        setSelectedType(t);
                        setPage(1);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: selectedType === t 
                          ? (t ? getTypeColor(t).bg : "#6366f1")
                          : "#f1f5f9",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ 
                        fontSize: 12,
                        color: selectedType === t 
                          ? (t ? getTypeColor(t).text : "#fff")
                          : "#64748b",
                        fontWeight: "500",
                      }}>
                        {t === "objective" ? "MCQ" : t === "subjective" ? "Open" : "All"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Sort */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                  Sort By
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {/* @ts-ignore */}
                  <select
                    value={sortBy}
                    onChange={(e: any) => {
                      setSortBy(e.target.value);
                      setPage(1);
                    }}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#f8fafc",
                      fontSize: 14,
                    }}
                  >
                    {/* @ts-ignore */}
                    <option value="createdAt">Date Added</option>
                    {/* @ts-ignore */}
                    <option value="updatedAt">Last Updated</option>
                    {/* @ts-ignore */}
                    <option value="subject">Subject</option>
                    {/* @ts-ignore */}
                    <option value="difficulty">Difficulty</option>
                  </select>
                  <Pressable
                    onPress={() => {
                      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      setPage(1);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: "#f1f5f9",
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Tags Filter */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
                  Tags (comma-separated)
                </Text>
                <TextInput
                  value={selectedTags}
                  onChangeText={(t) => {
                    setSelectedTags(t);
                    setPage(1);
                  }}
                  placeholder="e.g., JEE, NEET"
                  style={{
                    backgroundColor: "#f8fafc",
                    borderWidth: 1,
                    borderColor: "#e2e8f0",
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 14,
                  }}
                />
              </View>

              {/* Reset Button */}
              <Pressable
                onPress={resetFilters}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <Text style={{ color: "#64748b", fontWeight: "500" }}>Reset Filters</Text>
              </Pressable>
            </ScrollView>
          </View>
        )}

        {/* Main Content */}
        <View style={{ flex: 1 }}>
          {/* Stats Panel */}
          {showStats && (loadingInitialData ? (
            <View style={{ 
              backgroundColor: "#fff", 
              padding: 24, 
              borderBottomWidth: 1, 
              borderBottomColor: "#e2e8f0",
              alignItems: "center",
            }}>
              <ActivityIndicator size="small" color="#6366f1" />
              <Text style={{ marginTop: 8, color: "#64748b" }}>Loading stats...</Text>
            </View>
          ) : stats && (
            <View style={{ 
              backgroundColor: "#fff", 
              padding: 16, 
              borderBottomWidth: 1, 
              borderBottomColor: "#e2e8f0" 
            }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  {/* Total */}
                  <View style={{ 
                    backgroundColor: "#f0f9ff", 
                    padding: 16, 
                    borderRadius: 12, 
                    minWidth: 140,
                    borderWidth: 1,
                    borderColor: "#bae6fd",
                  }}>
                    <Text style={{ fontSize: 28, fontWeight: "700", color: "#0369a1" }}>
                      {stats.total.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 13, color: "#0c4a6e" }}>Total Questions</Text>
                  </View>
                  
                  {/* Recent */}
                  <View style={{ 
                    backgroundColor: "#f0fdf4", 
                    padding: 16, 
                    borderRadius: 12, 
                    minWidth: 140,
                    borderWidth: 1,
                    borderColor: "#bbf7d0",
                  }}>
                    <Text style={{ fontSize: 28, fontWeight: "700", color: "#15803d" }}>
                      {stats.recentCount.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 13, color: "#166534" }}>Added This Week</Text>
                  </View>
                  
                  {/* By Subject */}
                  {stats.bySubject.slice(0, 4).map((s) => (
                    <Pressable
                      key={s.subject}
                      onPress={() => {
                        setSelectedSubject(s.subject);
                        setPage(1);
                      }}
                      style={{ 
                        backgroundColor: "#faf5ff", 
                        padding: 16, 
                        borderRadius: 12, 
                        minWidth: 120,
                        borderWidth: 1,
                        borderColor: selectedSubject === s.subject ? "#a855f7" : "#e9d5ff",
                      }}
                    >
                      <Text style={{ fontSize: 22, fontWeight: "700", color: "#7e22ce" }}>
                        {s.count.toLocaleString()}
                      </Text>
                      <Text style={{ fontSize: 13, color: "#6b21a8" }}>{s.subject}</Text>
                    </Pressable>
                  ))}
                  
                  {/* By Difficulty */}
                  {stats.byDifficulty.map((d) => {
                    const colors = getDifficultyColor(d.difficulty);
                    return (
                      <Pressable
                        key={d.difficulty}
                        onPress={() => {
                          setSelectedDifficulty(d.difficulty === "unset" ? "" : d.difficulty);
                          setPage(1);
                        }}
                        style={{ 
                          backgroundColor: colors.bg, 
                          padding: 16, 
                          borderRadius: 12, 
                          minWidth: 100,
                          borderWidth: 1,
                          borderColor: selectedDifficulty === d.difficulty ? colors.text : "transparent",
                        }}
                      >
                        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>
                          {d.count.toLocaleString()}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text, textTransform: "capitalize" }}>
                          {d.difficulty}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ))}

          {/* View Controls */}
          <View style={{ 
            flexDirection: "row", 
            justifyContent: "space-between", 
            alignItems: "center",
            padding: 12,
            backgroundColor: "#fff",
            borderBottomWidth: 1,
            borderBottomColor: "#e2e8f0",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ color: "#64748b", fontSize: 14 }}>
                Showing {displayList.length} of {total.toLocaleString()}
              </Text>
              {searchMode === "similarity" && similarityResults.length > 0 && (
                <View style={{ 
                  backgroundColor: "#fef3c7", 
                  paddingHorizontal: 10, 
                  paddingVertical: 4, 
                  borderRadius: 12 
                }}>
                  <Text style={{ fontSize: 12, color: "#92400e" }}>🔮 Similarity Search</Text>
                </View>
              )}
              {/* Page limit selector */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 13, color: "#64748b" }}>Per page:</Text>
                {/* @ts-ignore */}
                <select
                  value={limit}
                  onChange={(e: any) => {
                    setLimit(parseInt(e.target.value));
                    setPage(1);
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#f8fafc",
                    fontSize: 13,
                  }}
                >
                  {/* @ts-ignore */}
                  <option value="10">10</option>
                  {/* @ts-ignore */}
                  <option value="20">20</option>
                  {/* @ts-ignore */}
                  <option value="50">50</option>
                  {/* @ts-ignore */}
                  <option value="100">100</option>
                </select>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setViewMode("grid")}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: viewMode === "grid" ? "#6366f1" : "#f1f5f9",
                }}
              >
                <Text style={{ color: viewMode === "grid" ? "#fff" : "#64748b" }}>▤ Grid</Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode("list")}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: viewMode === "list" ? "#6366f1" : "#f1f5f9",
                }}
              >
                <Text style={{ color: viewMode === "list" ? "#fff" : "#64748b" }}>☰ List</Text>
              </Pressable>
            </View>
          </View>

          {/* Questions List */}
          {(loading || searchingSimilar) ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={{ marginTop: 12, color: "#64748b" }}>
                {searchingSimilar ? "Finding similar questions..." : "Loading questions..."}
              </Text>
            </View>
          ) : displayList.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📭</Text>
              <Text style={{ fontSize: 18, color: "#64748b" }}>No questions found</Text>
              <Pressable onPress={resetFilters} style={{ marginTop: 12 }}>
                <Text style={{ color: "#6366f1", fontWeight: "500" }}>Clear filters</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView 
              style={{ flex: 1 }} 
              contentContainerStyle={{ 
                padding: 16,
                flexDirection: viewMode === "grid" ? "row" : "column",
                flexWrap: viewMode === "grid" ? "wrap" : "nowrap",
                gap: 16,
              }}
            >
              {displayList.map((q) => {
                const isSimilar = "similarityScore" in q;
                const diffColors = getDifficultyColor(q.difficulty);
                const typeColors = getTypeColor(q.questionType);
                
                return (
                  <Pressable
                    key={q._id}
                    onPress={() => openQuestion(q)}
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      ...(viewMode === "grid" 
                        ? { width: 340, minHeight: 200 }
                        : { flexDirection: "row", alignItems: "flex-start", gap: 16 }),
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.05,
                      shadowRadius: 8,
                    }}
                  >
                    {/* Question Content */}
                    <View style={{ flex: 1 }}>
                      {/* Header badges */}
                      <View style={{ flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                        <View style={{ backgroundColor: "#f1f5f9", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, color: "#64748b" }}>{q.subject}</Text>
                        </View>
                        {q.chapter && (
                          <View style={{ backgroundColor: "#f1f5f9", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                            <Text style={{ fontSize: 11, color: "#64748b" }}>{q.chapter}</Text>
                          </View>
                        )}
                        <View style={{ backgroundColor: diffColors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, color: diffColors.text, textTransform: "capitalize" }}>
                            {q.difficulty || "—"}
                          </Text>
                        </View>
                        <View style={{ backgroundColor: typeColors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, color: typeColors.text }}>
                            {q.questionType === "subjective" ? "Open" : "MCQ"}
                          </Text>
                        </View>
                        {isSimilar && (
                          <View style={{ backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                            <Text style={{ fontSize: 11, color: "#92400e" }}>
                              {((q as SimilarQuestion).similarityScore * 100).toFixed(0)}% match
                            </Text>
                          </View>
                        )}
                      </View>
                      
                      {/* Question text */}
                      <Text 
                        style={{ 
                          fontSize: 14, 
                          color: "#1e293b", 
                          lineHeight: 20,
                          marginBottom: 10,
                        }}
                        numberOfLines={viewMode === "grid" ? 4 : 2}
                      >
                        {q.text}
                      </Text>
                      
                      {/* Options preview (for MCQ) */}
                      {q.questionType === "objective" && q.options.length > 0 && (
                        <View style={{ marginBottom: 10 }}>
                          {q.options.slice(0, viewMode === "grid" ? 4 : 2).map((opt, idx) => (
                            <Text 
                              key={idx} 
                              style={{ 
                                fontSize: 12, 
                                color: q.correctIndex === idx ? "#16a34a" : "#64748b",
                                marginBottom: 2,
                              }}
                              numberOfLines={1}
                            >
                              {String.fromCharCode(65 + idx)}. {opt}
                              {q.correctIndex === idx && " ✓"}
                            </Text>
                          ))}
                        </View>
                      )}
                      
                      {/* Tags */}
                      {q.tags && q.tags.length > 0 && (
                        <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                          {q.tags.slice(0, 3).map((tag, idx) => (
                            <View key={idx} style={{ backgroundColor: "#ede9fe", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, color: "#7c3aed" }}>{tag}</Text>
                            </View>
                          ))}
                          {q.tags.length > 3 && (
                            <Text style={{ fontSize: 10, color: "#64748b" }}>+{q.tags.length - 3}</Text>
                          )}
                        </View>
                      )}
                      
                      {/* Footer */}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                          {formatDate(q.createdAt)}
                        </Text>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            findSimilar(q);
                          }}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 4,
                            backgroundColor: "#f1f5f9",
                          }}
                        >
                          <Text style={{ fontSize: 11, color: "#64748b" }}>🔮 Similar</Text>
                        </Pressable>
                      </View>
                    </View>
                    
                    {/* Image thumbnail if exists */}
                    {q.image && viewMode === "list" && (
                      <View style={{ width: 80, height: 80, borderRadius: 8, overflow: "hidden", backgroundColor: "#f1f5f9" }}>
                        {/* @ts-ignore */}
                        <img src={q.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Pagination - show when displaying regular questions (not similarity results) */}
          {!loading && !searchingSimilar && similarityResults.length === 0 && totalPages > 1 && (
            <View style={{ 
              flexDirection: "row", 
              justifyContent: "center", 
              alignItems: "center", 
              padding: 16,
              backgroundColor: "#fff",
              borderTopWidth: 1,
              borderTopColor: "#e2e8f0",
              gap: 8,
            }}>
              <Pressable
                onPress={() => setPage(1)}
                disabled={page === 1}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: page === 1 ? "#f1f5f9" : "#e2e8f0",
                }}
              >
                <Text style={{ color: page === 1 ? "#94a3b8" : "#475569" }}>« First</Text>
              </Pressable>
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: page === 1 ? "#f1f5f9" : "#e2e8f0",
                }}
              >
                <Text style={{ color: page === 1 ? "#94a3b8" : "#475569" }}>‹ Prev</Text>
              </Pressable>
              
              <View style={{ flexDirection: "row", gap: 4 }}>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  if (pageNum > totalPages) return null;
                  return (
                    <Pressable
                      key={pageNum}
                      onPress={() => setPage(pageNum)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        backgroundColor: page === pageNum ? "#6366f1" : "#f1f5f9",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: page === pageNum ? "#fff" : "#475569", fontWeight: page === pageNum ? "600" : "400" }}>
                        {pageNum}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              
              <Pressable
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: page === totalPages ? "#f1f5f9" : "#e2e8f0",
                }}
              >
                <Text style={{ color: page === totalPages ? "#94a3b8" : "#475569" }}>Next ›</Text>
              </Pressable>
              <Pressable
                onPress={() => setPage(totalPages)}
                disabled={page === totalPages}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: page === totalPages ? "#f1f5f9" : "#e2e8f0",
                }}
              >
                <Text style={{ color: page === totalPages ? "#94a3b8" : "#475569" }}>Last »</Text>
              </Pressable>
              
              {/* Go to page input */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 12 }}>
                <Text style={{ fontSize: 13, color: "#64748b" }}>Go to:</Text>
                {/* @ts-ignore */}
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  placeholder={String(page)}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter") {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= totalPages) {
                        setPage(val);
                        e.target.value = "";
                      }
                    }
                  }}
                  style={{
                    width: 60,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                    textAlign: "center",
                  }}
                />
                <Text style={{ fontSize: 12, color: "#94a3b8" }}>of {totalPages}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Question Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}>
          <View style={{ 
            backgroundColor: "#fff", 
            borderRadius: 16, 
            width: "100%",
            maxWidth: 800,
            maxHeight: "90%",
            overflow: "hidden",
          }}>
            {/* Modal Header */}
            <View style={{ 
              flexDirection: "row", 
              justifyContent: "space-between", 
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#e2e8f0",
            }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#1e293b" }}>
                {editMode ? "Edit Question" : "Question Details"}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {!editMode && (
                  <>
                    <Pressable
                      onPress={() => selectedQuestion && findSimilar(selectedQuestion)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: "#fef3c7",
                      }}
                    >
                      <Text style={{ color: "#92400e", fontWeight: "500" }}>🔮 Find Similar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setEditMode(true)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: "#e0e7ff",
                      }}
                    >
                      <Text style={{ color: "#3730a3", fontWeight: "500" }}>✏️ Edit</Text>
                    </Pressable>
                  </>
                )}
                <Pressable
                  onPress={() => setShowDetailModal(false)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  <Text style={{ color: "#64748b" }}>✕</Text>
                </Pressable>
              </View>
            </View>
            
            {/* Modal Content */}
            <ScrollView style={{ flex: 1, padding: 16 }}>
              {selectedQuestion && (
                <View style={{ gap: 16 }}>
                  {/* Question Text */}
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                      Question
                    </Text>
                    {editMode ? (
                      <TextInput
                        value={editForm.text || ""}
                        onChangeText={(t) => setEditForm({ ...editForm, text: t })}
                        multiline
                        style={{
                          backgroundColor: "#f8fafc",
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 14,
                          minHeight: 100,
                        }}
                      />
                    ) : (
                      <View style={{ backgroundColor: "#f8fafc", padding: 12, borderRadius: 8 }}>
                        <MathMarkdown content={selectedQuestion.text} />
                      </View>
                    )}
                  </View>
                  
                  {/* Image */}
                  {selectedQuestion.image && (
                    <View>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                        Image
                      </Text>
                      <View style={{ backgroundColor: "#f8fafc", padding: 8, borderRadius: 8, alignItems: "center" }}>
                        {/* @ts-ignore */}
                        <img 
                          src={selectedQuestion.image} 
                          style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 4 }} 
                        />
                      </View>
                    </View>
                  )}
                  
                  {/* Options (for MCQ) */}
                  {selectedQuestion.questionType === "objective" && (
                    <View>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                        Options
                      </Text>
                      <View style={{ gap: 8 }}>
                        {(editMode ? editForm.options || [] : selectedQuestion.options).map((opt, idx) => (
                          <View 
                            key={idx}
                            style={{ 
                              flexDirection: "row", 
                              alignItems: "center", 
                              gap: 8,
                              backgroundColor: (editMode ? editForm.correctIndex : selectedQuestion.correctIndex) === idx ? "#dcfce7" : "#f8fafc",
                              padding: 12,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: (editMode ? editForm.correctIndex : selectedQuestion.correctIndex) === idx ? "#86efac" : "#e2e8f0",
                            }}
                          >
                            <View style={{ 
                              width: 24, 
                              height: 24, 
                              borderRadius: 12, 
                              backgroundColor: (editMode ? editForm.correctIndex : selectedQuestion.correctIndex) === idx ? "#22c55e" : "#e2e8f0",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <Text style={{ 
                                fontSize: 12, 
                                fontWeight: "600", 
                                color: (editMode ? editForm.correctIndex : selectedQuestion.correctIndex) === idx ? "#fff" : "#64748b" 
                              }}>
                                {String.fromCharCode(65 + idx)}
                              </Text>
                            </View>
                            {editMode ? (
                              <TextInput
                                value={opt}
                                onChangeText={(t) => {
                                  const newOpts = [...(editForm.options || [])];
                                  newOpts[idx] = t;
                                  setEditForm({ ...editForm, options: newOpts });
                                }}
                                style={{ flex: 1, fontSize: 14 }}
                              />
                            ) : (
                              <Text style={{ flex: 1, fontSize: 14, color: "#1e293b" }}>{opt}</Text>
                            )}
                            {editMode && (
                              <Pressable
                                onPress={() => setEditForm({ ...editForm, correctIndex: idx })}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 4,
                                  backgroundColor: editForm.correctIndex === idx ? "#22c55e" : "#e2e8f0",
                                }}
                              >
                                <Text style={{ 
                                  fontSize: 11, 
                                  color: editForm.correctIndex === idx ? "#fff" : "#64748b" 
                                }}>
                                  {editForm.correctIndex === idx ? "Correct ✓" : "Set Correct"}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  
                  {/* Metadata Grid */}
                  <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
                    {/* Subject */}
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                        Subject
                      </Text>
                      <View style={{ backgroundColor: "#f8fafc", padding: 12, borderRadius: 8 }}>
                        <Text style={{ fontSize: 14, color: "#1e293b" }}>{selectedQuestion.subject}</Text>
                      </View>
                    </View>
                    
                    {/* Chapter */}
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                        Chapter
                      </Text>
                      {editMode ? (
                        <TextInput
                          value={editForm.chapter || ""}
                          onChangeText={(t) => setEditForm({ ...editForm, chapter: t })}
                          placeholder="Enter chapter"
                          style={{
                            backgroundColor: "#f8fafc",
                            borderWidth: 1,
                            borderColor: "#e2e8f0",
                            borderRadius: 8,
                            padding: 12,
                            fontSize: 14,
                          }}
                        />
                      ) : (
                        <View style={{ backgroundColor: "#f8fafc", padding: 12, borderRadius: 8 }}>
                          <Text style={{ fontSize: 14, color: "#1e293b" }}>{selectedQuestion.chapter || "—"}</Text>
                        </View>
                      )}
                    </View>
                    
                    {/* Difficulty */}
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                        Difficulty
                      </Text>
                      {editMode ? (
                        // @ts-ignore
                        <select
                          value={editForm.difficulty || ""}
                          onChange={(e: any) => setEditForm({ ...editForm, difficulty: e.target.value || null })}
                          style={{
                            width: "100%",
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            backgroundColor: "#f8fafc",
                            fontSize: 14,
                          }}
                        >
                          {/* @ts-ignore */}
                          <option value="">Not set</option>
                          {/* @ts-ignore */}
                          <option value="easy">Easy</option>
                          {/* @ts-ignore */}
                          <option value="medium">Medium</option>
                          {/* @ts-ignore */}
                          <option value="hard">Hard</option>
                        </select>
                      ) : (
                        <View style={{ 
                          backgroundColor: getDifficultyColor(selectedQuestion.difficulty).bg, 
                          padding: 12, 
                          borderRadius: 8 
                        }}>
                          <Text style={{ 
                            fontSize: 14, 
                            color: getDifficultyColor(selectedQuestion.difficulty).text,
                            textTransform: "capitalize",
                          }}>
                            {selectedQuestion.difficulty || "Not set"}
                          </Text>
                        </View>
                      )}
                    </View>
                    
                    {/* Type */}
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                        Type
                      </Text>
                      <View style={{ 
                        backgroundColor: getTypeColor(selectedQuestion.questionType).bg, 
                        padding: 12, 
                        borderRadius: 8 
                      }}>
                        <Text style={{ 
                          fontSize: 14, 
                          color: getTypeColor(selectedQuestion.questionType).text 
                        }}>
                          {selectedQuestion.questionType === "subjective" ? "Subjective (Open-ended)" : "Objective (MCQ)"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* Tags */}
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                      Tags
                    </Text>
                    {editMode ? (
                      <TextInput
                        value={(editForm.tags || []).join(", ")}
                        onChangeText={(t) => setEditForm({ ...editForm, tags: t.split(",").map((s) => s.trim()).filter(Boolean) })}
                        placeholder="Enter tags (comma-separated)"
                        style={{
                          backgroundColor: "#f8fafc",
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 14,
                        }}
                      />
                    ) : (
                      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                        {(selectedQuestion.tags || []).length > 0 ? (
                          selectedQuestion.tags!.map((tag, idx) => (
                            <View key={idx} style={{ backgroundColor: "#ede9fe", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                              <Text style={{ fontSize: 13, color: "#7c3aed" }}>{tag}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={{ color: "#94a3b8", fontSize: 14 }}>No tags</Text>
                        )}
                      </View>
                    )}
                  </View>
                  
                  {/* Topics */}
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                      Topics
                    </Text>
                    {editMode ? (
                      <TextInput
                        value={(editForm.topics || []).join(", ")}
                        onChangeText={(t) => setEditForm({ ...editForm, topics: t.split(",").map((s) => s.trim()).filter(Boolean) })}
                        placeholder="Enter topics (comma-separated)"
                        style={{
                          backgroundColor: "#f8fafc",
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 14,
                        }}
                      />
                    ) : (
                      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                        {(selectedQuestion.topics || []).length > 0 ? (
                          selectedQuestion.topics!.map((topic, idx) => (
                            <View key={idx} style={{ backgroundColor: "#dbeafe", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                              <Text style={{ fontSize: 13, color: "#1e40af" }}>{topic}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={{ color: "#94a3b8", fontSize: 14 }}>No topics</Text>
                        )}
                      </View>
                    )}
                  </View>
                  
                  {/* Description */}
                  {(selectedQuestion.description || editMode) && (
                    <View>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                        Description
                      </Text>
                      {editMode ? (
                        <TextInput
                          value={editForm.description || ""}
                          onChangeText={(t) => setEditForm({ ...editForm, description: t })}
                          multiline
                          placeholder="Enter description"
                          style={{
                            backgroundColor: "#f8fafc",
                            borderWidth: 1,
                            borderColor: "#e2e8f0",
                            borderRadius: 8,
                            padding: 12,
                            fontSize: 14,
                            minHeight: 80,
                          }}
                        />
                      ) : selectedQuestion.description ? (
                        <View style={{ backgroundColor: "#f8fafc", padding: 12, borderRadius: 8 }}>
                          <MathMarkdown content={selectedQuestion.description} />
                        </View>
                      ) : null}
                    </View>
                  )}
                  
                  {/* Timestamps */}
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                      Created: {formatDate(selectedQuestion.createdAt)}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                      Updated: {formatDate(selectedQuestion.updatedAt)}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
            
            {/* Modal Footer */}
            {editMode && (
              <View style={{ 
                flexDirection: "row", 
                justifyContent: "space-between",
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: "#e2e8f0",
              }}>
                <Pressable
                  onPress={handleDelete}
                  disabled={deleting}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: "#fee2e2",
                  }}
                >
                  <Text style={{ color: "#dc2626", fontWeight: "500" }}>
                    {deleting ? "Deleting..." : "🗑 Delete"}
                  </Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Pressable
                    onPress={() => {
                      setEditForm({ ...selectedQuestion });
                      setEditMode(false);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: "#f1f5f9",
                    }}
                  >
                    <Text style={{ color: "#64748b", fontWeight: "500" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    disabled={saving}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: saving ? "#a5b4fc" : "#6366f1",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "500" }}>
                      {saving ? "Saving..." : "💾 Save Changes"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default BrowseQuestions;
