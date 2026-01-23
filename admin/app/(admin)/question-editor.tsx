import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Button, Platform, ScrollView, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useQuestionEditorStore, SUBJECT_TO_CHAPTERS, type QuestionEditorState, type Difficulty, type QuestionType } from "@/store/questionEditor";
import { router } from "expo-router";
import { uploadPdfDirect, generateQuestionMetadata, saveQuestionsBatch } from "@/api/admin";
import MathMarkdown from "@/components/MathMarkdown";

type ChipInputProps = {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  normalize?: (s: string) => string;
};

const ChipInput = ({ values, onChange, placeholder, normalize }: ChipInputProps) => {
  const [text, setText] = useState<string>("");

  const addTokens = (raw: string) => {
    const tokens = String(raw || "")
      .split(",")
      .map((s) => (normalize ? normalize(s.trim()) : s.trim()))
      .filter((s) => s.length > 0);
    if (tokens.length === 0) return;
    const seen = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const tok of tokens) {
      const key = tok.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        next.push(tok);
      }
    }
    onChange(next);
    setText("");
  };

  const removeAt = (idx: number) => {
    const next = values.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {values.map((v, i) => (
          <View
            key={`${v}-${i}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: "#eef3ff",
              borderWidth: 1,
              borderColor: "#cdd9ff",
              borderRadius: 16,
            }}
          >
            <Text style={{ color: "#223", fontSize: 12 }}>{v}</Text>
            <Button title="×" onPress={() => removeAt(i)} />
          </View>
        ))}
        {Platform.OS === "web" ? (
          // @ts-ignore web-only input
          <input
            type="text"
            value={text}
            placeholder={placeholder}
            onChange={(e: any) => setText(String(e?.target?.value ?? ""))}
            onKeyDown={(e: any) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTokens(text);
              }
            }}
            onBlur={() => {
              if (text.trim().length > 0) addTokens(text);
            }}
            style={{
              minWidth: 160,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6,
              padding: 8,
            }}
          />
        ) : (
          <TextInput
            value={text}
            onChangeText={(t) => {
              // If user types a comma, convert to chip(s) immediately
              if (t.includes(",")) {
                addTokens(t);
              } else {
                setText(t);
              }
            }}
            onSubmitEditing={() => addTokens(text)}
            placeholder={placeholder}
            style={{
              minWidth: 160,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          />
        )}
      </View>
    </View>
  );
};

const QuestionEditor = () => {
  const {
    questions,
    selectedIndex,
    selectIndex,
    updateQuestionText,
    updateOptionText,
    addOption,
    removeOption,
    setCorrectOption,
    setImage,
    resetImage,
    setChapter,
    setDifficulty,
    setTopics,
    setTags,
    setDescription,
    setQuestionType,
  } = useQuestionEditorStore();
  const selectedSubject = useQuestionEditorStore((s: QuestionEditorState) => s.selectedSubject);
  const addChapterForSubject = useQuestionEditorStore((s: QuestionEditorState) => s.addChapterForSubject);
  const customChaptersBySubject = useQuestionEditorStore((s: QuestionEditorState) => s.customChaptersBySubject);
  const isStreaming = useQuestionEditorStore((s: QuestionEditorState) => s.isStreaming);

  const current = questions[selectedIndex];
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);

  const fileToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const optionIdToIndex = useMemo(() => {
    const m = new Map<string, number>();
    current?.options.forEach((o, i) => m.set(o.id, i));
    return m;
  }, [current]);

  const currentNumber = selectedIndex + 1;
  const total = questions.length;
  const correctIndex =
    current.correctOptionId && optionIdToIndex.has(current.correctOptionId)
      ? (optionIdToIndex.get(current.correctOptionId) as number)
      : -1;
  const availableChapters = React.useMemo(() => {
    if (!selectedSubject) return [];
    const base = SUBJECT_TO_CHAPTERS[selectedSubject] ?? [];
    const extras = customChaptersBySubject[selectedSubject] ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];
    [...base, ...extras].forEach((c) => {
      const key = c.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(c);
      }
    });
    return merged;
  }, [selectedSubject, customChaptersBySubject]);
  const [newChapter, setNewChapter] = useState<string>("");

  if (!current) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>Question Editor</Text>
        {isStreaming ? (
          <View style={{ 
            backgroundColor: "#f0f4ff", 
            padding: 16, 
            borderRadius: 12, 
            gap: 12,
            borderWidth: 1,
            borderColor: "#c7d2fe",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator size="small" color="#4361ee" />
              <Text style={{ color: "#4361ee", fontWeight: "600" }}>
                Extracting questions from PDF...
              </Text>
            </View>
            <Text style={{ color: "#666" }}>
              Questions will appear here as they are extracted. Please wait...
            </Text>
          </View>
        ) : (
          <Text style={{ color: "#666" }}>No questions loaded. Go back and process a PDF first.</Text>
        )}
        <Button title="Back to Question DB" onPress={() => router.replace("/(admin)/question-db")} />
      </View>
    );
  }

  const handleAutoGenerate = async () => {
    if (!current) return;
    setGenerateError(null);
    setGenerating(true);
    try {
      const resp = await generateQuestionMetadata({
        text: current.text,
        options: current.options.map((o) => o.text),
        subject: selectedSubject,
        preferExamTag: (current.tags && current.tags[0]) || "jee mains",
      });
      const data = resp?.data;
      if (data) {
        if (data.chapter) setChapter(current.id, data.chapter);
        if (data.difficulty) setDifficulty(current.id, data.difficulty as Difficulty);
        if (Array.isArray(data.topics)) setTopics(current.id, data.topics);
        if (Array.isArray(data.tags)) {
          const existing = current.tags ?? [];
          const aiTags = data.tags.map((t: string) => String(t));
          const seen = new Set(existing.map((t) => t.toLowerCase()));
          const merged = [...existing];
          for (const t of aiTags) {
            const key = t.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(t);
            }
          }
          setTags(current.id, merged);
        }
        if (typeof data.correctIndex === "number") {
          const optionAt = current.options[data.correctIndex];
          if (optionAt) setCorrectOption(current.id, optionAt.id);
        }
        if (typeof data.description === "string") setDescription(current.id, data.description);
      }
    } catch (err: any) {
      setGenerateError(err?.response?.data?.message || err?.message || "Failed to generate metadata");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>Question Editor</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title="Back" onPress={() => router.replace("/(admin)/question-db")} />
        </View>
      </View>

      {/* Streaming Progress Banner */}
      {isStreaming && (
        <View style={{ 
          backgroundColor: "#f0f4ff", 
          padding: 12, 
          borderRadius: 10, 
          borderWidth: 1,
          borderColor: "#c7d2fe",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}>
          <ActivityIndicator size="small" color="#4361ee" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#4361ee", fontWeight: "600", fontSize: 14 }}>
              📄 Still extracting questions...
            </Text>
            <Text style={{ color: "#6b7280", fontSize: 12 }}>
              {total} questions so far • New questions will appear automatically
            </Text>
          </View>
          <Pressable
            onPress={() => router.replace("/(admin)/question-db")}
            style={{
              backgroundColor: "#4361ee",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "500" }}>View Progress</Text>
          </Pressable>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Button title="Prev" disabled={selectedIndex <= 0} onPress={() => selectIndex(selectedIndex - 1)} />
        <Text>
          {currentNumber} / {total}{isStreaming ? "+" : ""}
        </Text>
        <Button title="Next" disabled={selectedIndex >= total - 1} onPress={() => selectIndex(selectedIndex + 1)} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: "#555" }}>
          Subject: {selectedSubject ?? "— Select subject during upload —"}
        </Text>
        {/* Question Type Indicator */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#555" }}>Question Type:</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setQuestionType(current.id, "objective")}
              style={{
                backgroundColor: current.questionType === "objective" ? "#4361ee" : "#e8e8e8",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
              }}
            >
              <Text style={{ color: current.questionType === "objective" ? "#fff" : "#333", fontWeight: "500", fontSize: 13 }}>
                📝 Objective (MCQ)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setQuestionType(current.id, "subjective")}
              style={{
                backgroundColor: current.questionType === "subjective" ? "#10b981" : "#e8e8e8",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
              }}
            >
              <Text style={{ color: current.questionType === "subjective" ? "#fff" : "#333", fontWeight: "500", fontSize: 13 }}>
                ✍️ Subjective
              </Text>
            </Pressable>
          </View>
        </View>
        {current.questionType === "subjective" && (
          <View style={{ backgroundColor: "#ecfdf5", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#a7f3d0" }}>
            <Text style={{ color: "#065f46", fontSize: 13 }}>
              ℹ️ This is a subjective question (essay/short-answer). Options are not applicable.
            </Text>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "500" }}>Question</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setShowRawEditor((v) => !v)}
              style={{
                backgroundColor: showRawEditor ? "#4361ee" : "#e8e8e8",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: showRawEditor ? "#fff" : "#333", fontSize: 12, fontWeight: "500" }}>
                {showRawEditor ? "📝 Editing" : "👁 Preview"}
              </Text>
            </Pressable>
          </View>
        </View>
        {showRawEditor ? (
          <TextInput
            value={current.text}
            onChangeText={(t) => updateQuestionText(current.id, t)}
            placeholder="Enter question text (supports LaTeX: $x^2$, $$\frac{a}{b}$$)"
            multiline
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
              minHeight: 80,
              fontFamily: Platform.OS === "web" ? "monospace" : undefined,
            }}
          />
        ) : (
          <Pressable
            onPress={() => setShowRawEditor(true)}
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 8,
              padding: 12,
              minHeight: 80,
              backgroundColor: "#fafafa",
            }}
          >
            {current.text ? (
              <MathMarkdown content={current.text} fontSize={15} />
            ) : (
              <Text style={{ color: "#9ca3af", fontStyle: "italic" }}>Click to add question text...</Text>
            )}
          </Pressable>
        )}
        <Text style={{ color: "#6b7280", fontSize: 11 }}>
          {"💡 Tip: Use LaTeX for math — inline: $x^2 + y^2$ or block: $$\\frac{a}{b}$$"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Button title={generating ? "Generating..." : "Auto-generate metadata"} onPress={handleAutoGenerate} disabled={generating} />
        {generating ? (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: "#666" }}>Reviewing question…</Text>
          </View>
        ) : null}
      </View>
      {generateError ? <Text style={{ color: "red" }}>{generateError}</Text> : null}

      {/* Chapter (dependent on subject) */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Chapter</Text>
        {Platform.OS === "web" ? (
          // @ts-ignore web-only select
          <select
            value={current.chapter ?? ""}
            onChange={(e: any) => setChapter(current.id, e?.target?.value || null)}
            disabled={!selectedSubject}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, minWidth: 220 }}
          >
            {/* @ts-ignore */}
            <option value="" disabled>
              {selectedSubject ? "Select chapter" : "Select subject first"}
            </option>
            {availableChapters.map((c) => (
              // @ts-ignore
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <Text style={{ color: "#666" }}>
            Chapter selection available on web. Selected: {current.chapter ?? "None"}
          </Text>
        )}
        {/* Add new chapter input */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={newChapter}
            onChangeText={setNewChapter}
            placeholder="Add new chapter"
            editable={!!selectedSubject}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
              opacity: selectedSubject ? 1 : 0.6,
            }}
          />
          <Button
            title="Add"
            disabled={!selectedSubject || !newChapter.trim()}
            onPress={() => {
              if (!selectedSubject) return;
              const trimmed = newChapter.trim();
              if (!trimmed) return;
              addChapterForSubject(selectedSubject, trimmed);
              setChapter(current.id, trimmed);
              setNewChapter("");
            }}
          />
        </View>
      </View>

      {/* Difficulty */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Difficulty</Text>
        {Platform.OS === "web" ? (
          // @ts-ignore web-only select
          <select
            value={current.difficulty ?? ""}
            onChange={(e: any) => setDifficulty(current.id, (e?.target?.value || null) as Difficulty | null)}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, minWidth: 160 }}
          >
            {/* @ts-ignore */}
            <option value="" disabled>
              Select difficulty
            </option>
            {/* @ts-ignore */}
            <option value="easy">Easy</option>
            {/* @ts-ignore */}
            <option value="medium">Medium</option>
            {/* @ts-ignore */}
            <option value="hard">Hard</option>
          </select>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["easy", "medium", "hard"] as Difficulty[]).map((lvl) => {
              const isSel = current.difficulty === lvl;
              return (
                <Button
                  key={lvl}
                  title={`${isSel ? "✓ " : ""}${lvl[0].toUpperCase()}${lvl.slice(1)}`}
                  onPress={() => setDifficulty(current.id, lvl)}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* Topics */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Topics</Text>
        <ChipInput
          values={current.topics ?? []}
          onChange={(next) => setTopics(current.id, next)}
          placeholder="Type and press comma or Enter"
          normalize={(s) => s}
        />
      </View>

      {/* Tags */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Tags</Text>
        <ChipInput
          values={current.tags ?? []}
          onChange={(next) => setTags(current.id, next)}
          placeholder="Type and press comma or Enter (e.g., JEE, NEET, algebra, mock-test)"
          normalize={(s) => s}
        />
      </View>

      {/* Description */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "500" }}>Description / Solution Notes</Text>
          <Pressable
            onPress={() => setEditingDescription((v) => !v)}
            style={{
              backgroundColor: editingDescription ? "#4361ee" : "#e8e8e8",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: editingDescription ? "#fff" : "#333", fontSize: 12, fontWeight: "500" }}>
              {editingDescription ? "📝 Editing" : "👁 Preview"}
            </Text>
          </Pressable>
        </View>
        {editingDescription ? (
          <TextInput
            value={current.description ?? ""}
            onChangeText={(t) => setDescription(current.id, t || null)}
            placeholder="Add description, solution notes, exam history... (supports markdown)"
            multiline
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
              minHeight: 100,
              fontFamily: Platform.OS === "web" ? "monospace" : undefined,
            }}
          />
        ) : (
          <Pressable
            onPress={() => setEditingDescription(true)}
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 8,
              padding: 12,
              minHeight: 60,
              backgroundColor: "#fafafa",
            }}
          >
            {current.description ? (
              <MathMarkdown content={current.description} fontSize={14} />
            ) : (
              <Text style={{ color: "#9ca3af", fontStyle: "italic" }}>
                Click to add description, exam history, solution notes...
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Only show options for objective (MCQ) questions */}
      {current.questionType !== "subjective" && (
        <>
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "500" }}>Correct Option</Text>
            {Platform.OS === "web" ? (
              // @ts-ignore web-only select
              <select
                value={correctIndex >= 0 ? String(correctIndex) : ""}
                onChange={(e: any) => {
                  const idx = Number(e?.target?.value);
                  const opt = current.options[idx];
                  setCorrectOption(current.id, opt ? opt.id : null);
                }}
                style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, minWidth: 160 }}
              >
                {/* @ts-ignore */}
                <option value="" disabled>
                  Select correct option
                </option>
                {current.options.map((o, i) => (
                  // @ts-ignore web-only option
                  <option key={o.id} value={String(i)}>
                    {`Option ${i + 1}`}
                  </option>
                ))}
              </select>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {current.options.map((o, i) => {
                  const isSelected = current.correctOptionId === o.id;
                  return (
                    <Button
                      key={o.id}
                      title={`${isSelected ? "✓ " : ""}Option ${i + 1}`}
                      onPress={() => setCorrectOption(current.id, o.id)}
                    />
                  );
                })}
              </View>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "500" }}>Options</Text>
            <View style={{ gap: 10 }}>
              {current.options.map((o, i) => {
                const isEditing = editingOptionId === o.id;
                const isCorrect = current.correctOptionId === o.id;
                return (
                  <View 
                    key={o.id} 
                    style={{ 
                      flexDirection: "row", 
                      alignItems: "flex-start", 
                      gap: 8,
                      padding: 8,
                      backgroundColor: isCorrect ? "#ecfdf5" : "#f9fafb",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: isCorrect ? "#86efac" : "#e5e7eb",
                    }}
                  >
                    <View style={{ 
                      width: 28, 
                      height: 28, 
                      borderRadius: 14, 
                      backgroundColor: isCorrect ? "#22c55e" : "#d1d5db",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 4,
                    }}>
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
                        {String.fromCharCode(65 + i)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      {isEditing ? (
                        <TextInput
                          value={o.text}
                          onChangeText={(t) => updateOptionText(current.id, o.id, t)}
                          placeholder={`Option ${String.fromCharCode(65 + i)} (supports markdown)`}
                          multiline
                          autoFocus
                          onBlur={() => setEditingOptionId(null)}
                          style={{
                            borderWidth: 1,
                            borderColor: "#3b82f6",
                            borderRadius: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            minHeight: 40,
                            backgroundColor: "#fff",
                            fontFamily: Platform.OS === "web" ? "monospace" : undefined,
                            fontSize: 14,
                          }}
                        />
                      ) : (
                        <Pressable
                          onPress={() => setEditingOptionId(o.id)}
                          style={{
                            minHeight: 32,
                            justifyContent: "center",
                          }}
                        >
                          {o.text ? (
                            <MathMarkdown content={o.text} fontSize={14} />
                          ) : (
                            <Text style={{ color: "#9ca3af", fontStyle: "italic", fontSize: 14 }}>
                              Click to add option text...
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                      <Pressable
                        onPress={() => setEditingOptionId(isEditing ? null : o.id)}
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          backgroundColor: isEditing ? "#3b82f6" : "#e5e7eb",
                        }}
                      >
                        <Text style={{ fontSize: 12, color: isEditing ? "#fff" : "#374151" }}>
                          {isEditing ? "✓" : "✏️"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => removeOption(current.id, o.id)}
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          backgroundColor: "#fee2e2",
                        }}
                      >
                        <Text style={{ fontSize: 12, color: "#dc2626" }}>🗑</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
            <View>
              <Button title="+ Add Option" onPress={() => addOption(current.id)} />
            </View>
          </View>
        </>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Diagram (optional)</Text>
        {current.image ? (
          <View style={{ gap: 8 }}>
            <Image
              source={{ uri: current.image }}
              style={{ width: 320, height: 240, borderRadius: 6, borderWidth: 1, borderColor: "#ddd" }}
              contentFit="contain"
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Clear Image" onPress={() => setImage(current.id, null)} />
              <Button
                title="Revert to Original"
                disabled={!current.originalImage || current.originalImage === current.image}
                onPress={() => resetImage(current.id)}
              />
            </View>
          </View>
        ) : (
          <Text style={{ color: "#666" }}>No diagram attached.</Text>
        )}
        {/* Replace by uploading locally (web). Image is uploaded to storage, then FE updated only. */}
        {Platform.OS === "web" ? (
          // @ts-ignore web-only input
          <input
            type="file"
            accept="image/*"
            onChange={async (e: any) => {
              const f = e?.target?.files?.[0];
              if (!f || !f.type?.startsWith("image/")) return;
              setUploadError(null);
              setUploadingImage(true);
              try {
                const dataUrl = await fileToDataUrl(f);
                const { publicUrl } = await uploadPdfDirect({
                  dataBase64: dataUrl,
                  fileType: f.type || "image/png",
                  fileName: f.name || "diagram.png",
                  isPermanent: true,
                });
                setImage(current.id, publicUrl);
              } catch (err: any) {
                setUploadError(err?.response?.data || err?.message || "Image upload failed");
              } finally {
                setUploadingImage(false);
              }
            }}
          />
        ) : (
          <Text style={{ color: "#666" }}>
            Image picker not set up on native. Install expo-image-picker to enable.
          </Text>
        )}
        {uploadingImage ? (
          <View style={{ marginTop: 8, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 6, color: "#666" }}>Uploading image…</Text>
          </View>
        ) : null}
        {uploadError ? <Text style={{ color: "red" }}>{uploadError}</Text> : null}
        <TextInput
          value={current.image ?? ""}
          onChangeText={(t) => setImage(current.id, t || null)}
          placeholder="Paste data URL or image URL"
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        />
      </View>

      {selectedIndex === total - 1 ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          {finishError ? <Text style={{ color: "red" }}>{finishError}</Text> : null}
          <Button
            title={finishing ? "Finishing…" : "Finish Upload"}
            disabled={finishing || !selectedSubject}
            onPress={async () => {
              if (!selectedSubject) {
                setFinishError("Please select a subject before finishing.");
                return;
              }
              setFinishError(null);
              setFinishing(true);
              try {
                // Prepare payload
                const items = questions.map((q) => {
                  const optIndexMap = new Map<string, number>();
                  q.options.forEach((o, i) => optIndexMap.set(o.id, i));
                  // Only calculate correct index for objective questions
                  const correctIndex =
                    q.questionType !== "subjective" && q.correctOptionId && optIndexMap.has(q.correctOptionId)
                      ? (optIndexMap.get(q.correctOptionId) as number)
                      : null;
                  return {
                    text: q.text,
                    questionType: q.questionType ?? "objective",
                    options: q.questionType === "subjective" ? [] : q.options.map((o) => o.text),
                    correctIndex: q.questionType === "subjective" ? null : correctIndex,
                    image: q.image ?? null,
                    chapter: q.chapter ?? null,
                    difficulty: (q.difficulty as any) ?? null,
                    topics: q.topics ?? [],
                    tags: q.tags ?? [],
                    description: q.description ?? null,
                  };
                });
                await saveQuestionsBatch({
                  subject: selectedSubject,
                  items,
                });
                router.replace("/(admin)/question-db");
              } catch (err: any) {
                setFinishError(err?.response?.data?.message || err?.message || "Failed to finish upload");
              } finally {
                setFinishing(false);
              }
            }}
          />
        </View>
      ) : null}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

export default QuestionEditor;


