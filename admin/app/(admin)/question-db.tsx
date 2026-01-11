import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Button, Platform, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { uploadPdfDirect, processQuestionPdfStream, getUploadHistory, getSessionQuestions, type UploadSession, type StreamEvent } from "@/api/admin";
import { useQuestionEditorStore, type QuestionEditorState, SUBJECTS } from "@/store/questionEditor";
import { router } from "expo-router";

type StreamStatus = {
  message: string;
  step: string;
  currentPage?: number;
  totalPages?: number;
  pagesCompleted?: number;
  questionsExtracted?: number;
};

const QuestionDB = () => {
  const [file, setFile] = useState<any | null>(null);
  const [startPage, setStartPage] = useState<string>("1");
  const [numPages, setNumPages] = useState<string>("1");
  const [uploading, setUploading] = useState(false);
  const [uploadedPublicUrl, setUploadedPublicUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>("question.pdf");
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Store access
  const questions = useQuestionEditorStore((s: QuestionEditorState) => s.questions);
  const selectedSubject = useQuestionEditorStore((s: QuestionEditorState) => s.selectedSubject);
  const setSelectedSubject = useQuestionEditorStore((s: QuestionEditorState) => s.setSelectedSubject);
  const isStreaming = useQuestionEditorStore((s: QuestionEditorState) => s.isStreaming);
  const setIsStreaming = useQuestionEditorStore((s: QuestionEditorState) => s.setIsStreaming);
  const clearQuestions = useQuestionEditorStore((s: QuestionEditorState) => s.clearQuestions);
  const addStreamedQuestion = useQuestionEditorStore((s: QuestionEditorState) => s.addStreamedQuestion);
  const setStreamSessionId = useQuestionEditorStore((s: QuestionEditorState) => s.setStreamSessionId);
  const loadFromBackendResult = useQuestionEditorStore((s: QuestionEditorState) => s.loadFromBackendResult);

  const canSubmit = useMemo(() => {
    const sp = parseInt(startPage || "1", 10);
    const np = parseInt(numPages || "1", 10);
    return !!uploadedPublicUrl && Number.isFinite(sp) && sp > 0 && Number.isFinite(np) && np > 0 && !!selectedSubject && !isStreaming;
  }, [uploadedPublicUrl, startPage, numPages, selectedSubject, isStreaming]);

  const fileToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Load upload history
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const resp = await getUploadHistory({ limit: 20 });
      setUploadHistory(resp.data);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Load questions from a history session
  const loadSessionQuestions = async (sessionId: string) => {
    try {
      setLoadingHistory(true);
      const resp = await getSessionQuestions(sessionId);
      if (resp.success && resp.data.questions.length > 0) {
        // Transform to backend result format
        const transformed = {
          data: resp.data.questions.map((q: any) => ({
            question: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
            image: q.image,
          })),
        };
        loadFromBackendResult(transformed);
        setSelectedSubject(resp.data.session.subject);
        router.push("/(admin)/question-editor");
      }
    } catch (e) {
      console.error("Failed to load session questions:", e);
      setError("Failed to load session questions");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle streaming PDF processing
  const handleStartProcessing = async () => {
    if (!canSubmit || !uploadedPublicUrl || !selectedSubject) return;
    
    setError(null);
    setIsStreaming(true);
    clearQuestions();
    setStreamStatus({ message: "Starting...", step: "init" });

    const sp = Math.max(parseInt(startPage || "1", 10) || 1, 1);
    const np = Math.max(parseInt(numPages || "1", 10) || 1, 1);

    try {
      await processQuestionPdfStream(
        {
          pdfUrl: uploadedPublicUrl,
          fileName: uploadedFileName,
          startPage: sp,
          numPages: np,
          subject: selectedSubject,
        },
        (event: StreamEvent) => {
          switch (event.type) {
            case "session_started":
              setStreamSessionId(event.sessionId);
              setStreamStatus({ 
                message: `Processing ${event.fileName}`, 
                step: "started",
                totalPages: event.numPages
              });
              break;
              
            case "progress":
              setStreamStatus(prev => ({ 
                ...prev!,
                message: event.message, 
                step: event.step,
                totalPages: event.totalPages ?? prev?.totalPages,
                pagesCompleted: 0,
              }));
              break;
              
            case "page_start":
              setStreamStatus(prev => ({ 
                ...prev!,
                message: `Extracting questions from page ${event.pageNum} (${event.currentPage}/${event.totalPages})...`, 
                step: "page",
                currentPage: event.currentPage,
                totalPages: event.totalPages,
                pagesCompleted: event.pagesCompleted ?? (event.currentPage - 1),
              }));
              break;
              
            case "question":
              addStreamedQuestion({
                dbId: event.dbId,
                question: event.question,
                options: event.options,
                correctIndex: event.correctIndex,
                image: event.image,
                page: event.page,
              });
              setStreamStatus(prev => ({ 
                ...prev!,
                questionsExtracted: event.index
              }));
              break;
              
            case "page_complete":
              setStreamStatus(prev => ({ 
                ...prev!,
                message: `Completed page ${event.pageNum}`,
                pagesCompleted: (prev?.pagesCompleted ?? 0) + 1,
                questionsExtracted: event.totalSoFar
              }));
              break;
              
            case "complete":
              setStreamStatus({ 
                message: `Done! ${event.totalQuestions} questions extracted and saved`, 
                step: "complete",
                questionsExtracted: event.totalQuestions
              });
              setIsStreaming(false);
              fetchHistory(); // Refresh history
              break;
              
            case "page_error":
              console.warn(`Error on page ${event.pageNum}: ${event.error}`);
              break;
              
            case "error":
              setError(event.message + (event.details ? `: ${event.details}` : ""));
              setIsStreaming(false);
              break;
          }
        },
        (err) => {
          setError(err.message);
          setIsStreaming(false);
        }
      );
    } catch (e: any) {
      setError(e?.message || "Processing failed");
      setIsStreaming(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {/* Main content */}
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#1a1a2e" }}>Question DB</Text>
          <Pressable
            onPress={() => setShowHistory(!showHistory)}
            style={{
              backgroundColor: showHistory ? "#4361ee" : "#e8e8e8",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: showHistory ? "#fff" : "#333", fontWeight: "500" }}>
              {showHistory ? "Hide History" : "Show History"}
            </Text>
          </Pressable>
        </View>

        {/* Upload Section */}
        <View style={{ 
          backgroundColor: "#fff", 
          borderRadius: 12, 
          padding: 16, 
          gap: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        }}>
          <Text style={{ fontWeight: "600", fontSize: 16, color: "#333" }}>Upload PDF</Text>
          
        {Platform.OS === "web" ? (
            // @ts-ignore
          <input
            type="file"
            accept="application/pdf"
              disabled={isStreaming}
              style={{ 
                padding: 10, 
                borderRadius: 8, 
                border: "1px dashed #ccc",
                backgroundColor: "#fafafa",
                cursor: isStreaming ? "not-allowed" : "pointer"
              }}
            onChange={(e: any) => {
              const f = e?.target?.files?.[0];
              if (f && f.type === "application/pdf") {
                (async () => {
                  setFile(f);
                    setError(null);
                  setUploadedPublicUrl(null);
                  setUploading(true);
                    setUploadedFileName(f.name || "question.pdf");
                  try {
                    const dataUrl = await fileToDataUrl(f);
                    const { publicUrl } = await uploadPdfDirect({
                      dataBase64: dataUrl,
                      fileType: f.type || "application/pdf",
                      fileName: f.name || "question.pdf",
                      isPermanent: true,
                    });
                    setUploadedPublicUrl(publicUrl);
                  } catch {
                    setUploadedPublicUrl(null);
                      setError("Upload failed");
                  } finally {
                    setUploading(false);
                  }
                })();
              } else {
                setFile(null);
                setUploadedPublicUrl(null);
              }
            }}
          />
        ) : (
            <View style={{ padding: 16, backgroundColor: "#f5f5f5", borderRadius: 8 }}>
            <Text style={{ color: "#666" }}>
              File picker not set up on native. Install expo-document-picker to enable.
            </Text>
          </View>
        )}
          
          <Text style={{ color: file ? "#10b981" : "#888", fontSize: 13 }}>
            {file ? `Selected: ${file.name || "PDF file"}` : "No file selected"}
        </Text>
          
          {uploading && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color="#4361ee" />
              <Text style={{ color: "#666" }}>Uploading to storage…</Text>
            </View>
          )}
          
          {uploadedPublicUrl && !uploading && (
            <Text style={{ color: "#10b981", fontSize: 13 }}>✓ Uploaded and ready to process</Text>
          )}
      </View>

        {/* Subject Selection */}
        {uploadedPublicUrl && (
          <View style={{ 
            backgroundColor: "#fff", 
            borderRadius: 12, 
            padding: 16, 
            gap: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
          }}>
            <Text style={{ fontWeight: "600", fontSize: 16, color: "#333" }}>Subject</Text>
          {Platform.OS === "web" ? (
              // @ts-ignore
            <select
              value={selectedSubject ?? ""}
                disabled={isStreaming}
              onChange={(e: any) => setSelectedSubject(e?.target?.value || null)}
                style={{ 
                  padding: 10, 
                  borderRadius: 8, 
                  border: "1px solid #ddd",
                  fontSize: 14,
                  backgroundColor: isStreaming ? "#f5f5f5" : "#fff"
                }}
            >
              {/* @ts-ignore */}
                <option value="" disabled>Select subject</option>
              {SUBJECTS.map((s) => (
                  // @ts-ignore
                  <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <TextInput
              value={selectedSubject ?? ""}
              onChangeText={(t) => setSelectedSubject(t || null)}
              placeholder="Enter subject"
                editable={!isStreaming}
              style={{
                borderWidth: 1,
                  borderColor: "#ddd",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
              }}
            />
          )}
            {!selectedSubject && (
              <Text style={{ color: "#ef4444", fontSize: 12 }}>Subject is required</Text>
            )}
        </View>
        )}

        {/* Page Settings */}
        <View style={{ 
          backgroundColor: "#fff", 
          borderRadius: 12, 
          padding: 16, 
          gap: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        }}>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontWeight: "500", color: "#555" }}>Start Page</Text>
        <TextInput
          value={startPage}
          onChangeText={setStartPage}
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="e.g. 3"
                editable={!isStreaming}
          style={{
            borderWidth: 1,
                  borderColor: "#ddd",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  backgroundColor: isStreaming ? "#f5f5f5" : "#fff",
          }}
        />
      </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontWeight: "500", color: "#555" }}>Number of Pages</Text>
        <TextInput
          value={numPages}
          onChangeText={setNumPages}
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="e.g. 2"
                editable={!isStreaming}
          style={{
            borderWidth: 1,
                  borderColor: "#ddd",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  backgroundColor: isStreaming ? "#f5f5f5" : "#fff",
                }}
              />
            </View>
          </View>
      </View>

        {/* Process Button */}
        <Pressable
          onPress={handleStartProcessing}
          disabled={!canSubmit || isStreaming}
          style={{
            backgroundColor: canSubmit && !isStreaming ? "#4361ee" : "#ccc",
            paddingVertical: 14,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
            {isStreaming ? "Processing..." : "Start Processing"}
          </Text>
        </Pressable>

        {/* Streaming Progress */}
        {(isStreaming || streamStatus) && (
          <View style={{ 
            backgroundColor: streamStatus?.step === "complete" ? "#ecfdf5" : "#f0f4ff", 
            borderRadius: 12, 
            padding: 16, 
            gap: 14,
            borderWidth: 1,
            borderColor: streamStatus?.step === "complete" ? "#a7f3d0" : "#c7d2fe",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {isStreaming && <ActivityIndicator size="small" color="#4361ee" />}
              {streamStatus?.step === "complete" && (
                <Text style={{ fontSize: 18 }}>✓</Text>
              )}
              <Text style={{ 
                fontWeight: "600", 
                color: streamStatus?.step === "complete" ? "#059669" : "#4361ee",
                flex: 1
              }}>
                {streamStatus?.message || "Processing..."}
              </Text>
            </View>
            
            {/* Page Progress Details */}
            {streamStatus && streamStatus.totalPages && streamStatus.totalPages > 0 && (
              <View style={{ gap: 8 }}>
                {/* Progress Bar */}
                <View style={{ 
                  backgroundColor: "#e5e7eb", 
                  height: 10, 
                  borderRadius: 5,
                  overflow: "hidden"
                }}>
                  <View style={{ 
                    backgroundColor: streamStatus.step === "complete" ? "#10b981" : "#4361ee", 
                    height: "100%", 
                    width: `${((streamStatus.pagesCompleted ?? 0) / streamStatus.totalPages) * 100}%`,
                    borderRadius: 5,
                  }} />
                </View>
                
                {/* Page Stats */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    {streamStatus.currentPage && streamStatus.step !== "complete" && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ fontSize: 13, color: "#4361ee", fontWeight: "600" }}>
                          📄 Processing:
                        </Text>
                        <Text style={{ fontSize: 13, color: "#374151", fontWeight: "500" }}>
                          Page {streamStatus.currentPage}
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: "#10b981" }}>
                        {streamStatus.pagesCompleted ?? 0}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#6b7280" }}>Extracted</Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: "#f59e0b" }}>
                        {Math.max(0, (streamStatus.totalPages ?? 0) - (streamStatus.pagesCompleted ?? 0))}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#6b7280" }}>Remaining</Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: "#6366f1" }}>
                        {streamStatus.totalPages}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#6b7280" }}>Total</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
            
            {/* Questions Count */}
            {streamStatus?.questionsExtracted !== undefined && streamStatus.questionsExtracted > 0 && (
              <View style={{ 
                backgroundColor: streamStatus?.step === "complete" ? "#d1fae5" : "#e0e7ff",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}>
                <Text style={{ fontSize: 16 }}>📝</Text>
                <Text style={{ color: "#374151", fontWeight: "600", fontSize: 14 }}>
                  {streamStatus.questionsExtracted} questions extracted
                </Text>
                {isStreaming && (
                  <Text style={{ color: "#6b7280", fontSize: 12 }}>(saving to database...)</Text>
                )}
                {streamStatus?.step === "complete" && (
                  <Text style={{ color: "#059669", fontSize: 12 }}>✓ saved</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Error Display */}
        {error && (
          <View style={{ 
            backgroundColor: "#fef2f2", 
            borderRadius: 12, 
            padding: 16,
            borderWidth: 1,
            borderColor: "#fecaca",
          }}>
            <Text style={{ color: "#dc2626", fontWeight: "500" }}>
              ⚠️ {error}
            </Text>
          </View>
        )}

        {/* Live Questions Preview */}
        {questions.length > 0 && (
          <View style={{ 
            backgroundColor: "#fff", 
            borderRadius: 12, 
            padding: 16, 
            gap: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "600", fontSize: 16, color: "#333" }}>
                Extracted Questions ({questions.length})
              </Text>
              <Pressable
                onPress={() => router.push("/(admin)/question-editor")}
                style={{
                  backgroundColor: "#10b981",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "500" }}>
                  Open Editor →
                </Text>
              </Pressable>
      </View>

            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
              {questions.slice(0, 10).map((q, idx) => (
                <View 
                  key={q.id} 
                  style={{ 
                    paddingVertical: 10, 
                    borderBottomWidth: idx < questions.length - 1 ? 1 : 0,
                    borderBottomColor: "#f0f0f0"
                  }}
                >
                  <Text style={{ fontWeight: "500", color: "#374151" }} numberOfLines={2}>
                    {idx + 1}. {q.text}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    {q.options.length} options {q.correctOptionId ? "• Answer set" : ""}
                  </Text>
                </View>
              ))}
              {questions.length > 10 && (
                <Text style={{ color: "#6b7280", fontStyle: "italic", paddingTop: 8 }}>
                  +{questions.length - 10} more questions...
                </Text>
              )}
            </ScrollView>
          </View>
        )}

        {/* Saved Indicator */}
        {streamStatus?.step === "complete" && questions.length > 0 && (
          <View style={{ 
            backgroundColor: "#f0fdf4", 
            borderRadius: 12, 
            padding: 16,
            borderWidth: 1,
            borderColor: "#bbf7d0",
            alignItems: "center",
          }}>
            <Text style={{ color: "#15803d", fontWeight: "600", marginBottom: 8 }}>
              ✓ All questions automatically saved to database
            </Text>
            <Text style={{ color: "#166534", fontSize: 13 }}>
              You can review and edit them in the Question Editor
            </Text>
          </View>
        )}
      </ScrollView>

      {/* History Sidebar */}
      {showHistory && (
        <View style={{ 
          width: 320, 
          backgroundColor: "#f8fafc", 
          borderLeftWidth: 1, 
          borderLeftColor: "#e2e8f0",
          padding: 16,
        }}>
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 16, color: "#1e293b" }}>
            Upload History
          </Text>
          
          {loadingHistory ? (
            <View style={{ alignItems: "center", paddingTop: 32 }}>
              <ActivityIndicator size="large" color="#4361ee" />
            </View>
          ) : uploadHistory.length === 0 ? (
            <Text style={{ color: "#64748b", textAlign: "center", paddingTop: 32 }}>
              No upload history yet
            </Text>
          ) : (
            <ScrollView style={{ flex: 1 }}>
              {uploadHistory.map((session) => (
                <Pressable
                  key={session._id}
                  onPress={() => loadSessionQuestions(session._id)}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 10,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={{ fontWeight: "600", color: "#1e293b", flex: 1 }} numberOfLines={1}>
                      {session.fileName}
                    </Text>
                    <View style={{ 
                      backgroundColor: session.status === "completed" ? "#dcfce7" : session.status === "failed" ? "#fee2e2" : "#fef9c3",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}>
                      <Text style={{ 
                        fontSize: 11, 
                        fontWeight: "500",
                        color: session.status === "completed" ? "#166534" : session.status === "failed" ? "#dc2626" : "#854d0e",
                      }}>
                        {session.status}
                      </Text>
                    </View>
              </View>
                  
                  <Text style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
                    {session.subject} • Pages {session.startPage}-{session.startPage + session.numPages - 1}
                  </Text>
                  
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                      {formatDate(session.createdAt)}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#4361ee", fontWeight: "500" }}>
                      {session.totalQuestionsExtracted} questions
                    </Text>
            </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          
          <Pressable
            onPress={fetchHistory}
            style={{
              marginTop: 12,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: "#e2e8f0",
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#475569", fontWeight: "500" }}>Refresh</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

export default QuestionDB;
