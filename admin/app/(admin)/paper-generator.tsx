import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SUBJECTS, SUBJECT_TO_CHAPTERS, useQuestionEditorStore } from "@/store/questionEditor";
import { 
  generateQuestionPaper, 
  generateQuestionPaperV1_5, 
  generateQuestionPaperV2,
  createQuestionPaper,
  type GeneratedPaperItem,
  type GeneratedPaperItemV1_5,
  type GeneratedPaperItemV2,
} from "@/api/admin";

const DIFFICULTIES: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];
const TAG_SUGGESTIONS = ["jee", "jee mains", "jee advanced", "neet", "boards"];

type ModelVersion = "v1" | "v1.5" | "v2";
const MODEL_OPTIONS: { value: ModelVersion; label: string; endpoint: string }[] = [
  { value: "v1", label: "Model 1", endpoint: "/api/admin/papers/generate" },
  { value: "v1.5", label: "Model 1.5", endpoint: "/api/admin/papers/generate-v1.5" },
  { value: "v2", label: "Model 2", endpoint: "/api/admin/papers/generate-v2" },
];

export default function PaperGeneratorScreen() {
  const router = useRouter();
  const customChaptersBySubject = useQuestionEditorStore((s) => s.customChaptersBySubject);
  const addChapterForSubject = useQuestionEditorStore((s) => s.addChapterForSubject);

  const [subject, setSubject] = useState<string | null>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const [overallDifficulty, setOverallDifficulty] = useState<"easy" | "medium" | "hard" | null>(null);
  const [easyCount, setEasyCount] = useState<string>("0");
  const [mediumCount, setMediumCount] = useState<string>("0");
  const [hardCount, setHardCount] = useState<string>("0");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [description, setDescription] = useState<string>("");
  const [modelVersion, setModelVersion] = useState<ModelVersion>("v1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [paperTitle, setPaperTitle] = useState<string>("");
  const [results, setResults] = useState<(GeneratedPaperItem | GeneratedPaperItemV1_5 | GeneratedPaperItemV2)[]>([]);

  const chapters = useMemo(() => {
    if (!subject) return [];
    const defaults = SUBJECT_TO_CHAPTERS[subject] ?? [];
    const customs = customChaptersBySubject[subject] ?? [];
    return [...defaults, ...customs];
  }, [subject, customChaptersBySubject]);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput("");
  };

  const removeTag = (t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  };

  const addTopic = () => {
    const t = topicInput.trim();
    if (!t) return;
    if (!topics.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTopics((prev) => [...prev, t]);
    }
    setTopicInput("");
  };

  const removeTopic = (t: string) => {
    setTopics((prev) => prev.filter((x) => x !== t));
  };

  const onAddCustomChapter = () => {
    if (!subject) {
      Alert.alert("Select subject first", "Please select a subject to add a custom chapter.");
      return;
    }
    if (!chapter || !chapter.trim()) {
      Alert.alert("Enter chapter", "Type a chapter name before adding.");
      return;
    }
    addChapterForSubject(subject, chapter);
  };

  const totalCount = (parseInt(easyCount || "0") || 0) + (parseInt(mediumCount || "0") || 0) + (parseInt(hardCount || "0") || 0);

  const onGenerate = async () => {
    if (!subject) {
      Alert.alert("Subject required", "Please select a subject.");
      return;
    }
    if (totalCount <= 0) {
      Alert.alert("Add questions", "Set at least one of easy/medium/hard counts.");
      return;
    }
    try {
      setIsGenerating(true);
      const payload = {
        subject,
        chapter,
        overallDifficulty,
        easyCount: parseInt(easyCount || "0") || 0,
        mediumCount: parseInt(mediumCount || "0") || 0,
        hardCount: parseInt(hardCount || "0") || 0,
        tags,
        topics,
        description,
      };
      
      let resp: { success: boolean; data: any[]; meta?: unknown };
      const selectedModel = MODEL_OPTIONS.find((m) => m.value === modelVersion);
      
      switch (modelVersion) {
        case "v1.5":
          resp = await generateQuestionPaperV1_5(payload as any);
          break;
        case "v2":
          resp = await generateQuestionPaperV2(payload as any);
          break;
        case "v1":
        default:
          resp = await generateQuestionPaper(payload as any);
          break;
      }
      
      const items = Array.isArray(resp?.data) ? resp.data : [];
      setResults(items);
      const sample = items.slice(0, 3).map((q: any, i: number) => `${i + 1}. ${q?.text?.slice(0, 120) ?? ""}${(q?.text?.length ?? 0) > 120 ? "..." : ""}`).join("\n");
      Alert.alert(
        "Paper generated",
        [
          `Model: ${selectedModel?.label ?? modelVersion}`,
          `Endpoint: ${selectedModel?.endpoint ?? ""}`,
          `Requested: E${payload.easyCount} / M${payload.mediumCount} / H${payload.hardCount}`,
          `Generated: ${items.length}`,
          items.length ? "\nPreview:" : "",
          sample,
        ].filter(Boolean).join("\n"),
        [{ text: "OK" }]
      );
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || "Failed to generate paper";
      Alert.alert("Error", String(message));
    } finally {
      setIsGenerating(false);
    }
  };

  const onClearResults = () => {
    setResults([]);
    setPaperTitle("");
  };

  const onSavePaper = async () => {
    if (!subject) {
      Alert.alert("Error", "Subject is required to save paper");
      return;
    }
    if (results.length === 0) {
      Alert.alert("Error", "Generate questions first before saving");
      return;
    }
    const title = paperTitle.trim() || `${subject} Paper - ${new Date().toLocaleDateString()}`;
    
    try {
      setIsSaving(true);
      const resp = await createQuestionPaper({
        title,
        description: description || undefined,
        subject,
        chapter: chapter || undefined,
        overallDifficulty: overallDifficulty || undefined,
        tags,
        topics,
        modelVersion,
        requestedCounts: {
          easy: parseInt(easyCount || "0") || 0,
          medium: parseInt(mediumCount || "0") || 0,
          hard: parseInt(hardCount || "0") || 0,
        },
        questions: results.map((q) => ({
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          subject: q.subject,
          chapter: q.chapter || undefined,
          difficulty: q.difficulty,
          topics: q.topics,
          tags: q.tags,
          source: q.source,
        })),
        status: "draft",
      });
      
      Alert.alert(
        "Paper Saved!",
        `"${resp.data.title}" has been saved with ${resp.data.questionsCount} questions.`,
        [
          { text: "View History", onPress: () => router.push("/paper-history" as any) },
          { text: "Edit Paper", onPress: () => router.push(`/paper-editor?id=${resp.data._id}` as any) },
          { text: "OK" },
        ]
      );
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || "Failed to save paper";
      Alert.alert("Error", String(message));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Question Paper Generator</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Model Version</Text>
        <View style={styles.rowWrap}>
          {MODEL_OPTIONS.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setModelVersion(m.value)}
              style={[styles.chip, modelVersion === m.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, modelVersion === m.value && styles.chipTextActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.helper}>
          Endpoint: {MODEL_OPTIONS.find((m) => m.value === modelVersion)?.endpoint}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Subject</Text>
        <View style={styles.rowWrap}>
          {SUBJECTS.map((s) => (
            <Pressable key={s} onPress={() => { setSubject(subject === s ? null : s); setChapter(null); }} style={[styles.chip, subject === s && styles.chipActive]}>
              <Text style={[styles.chipText, subject === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Chapter (optional)</Text>
        {subject ? (
          <>
            <View style={styles.rowWrap}>
              {chapters.map((c) => (
                <Pressable key={c} onPress={() => setChapter(chapter === c ? null : c)} style={[styles.chip, chapter === c && styles.chipActive]}>
                  <Text style={[styles.chipText, chapter === c && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.inlineControls}>
              <TextInput
                placeholder="Add custom chapter"
                value={chapter ?? ""}
                onChangeText={setChapter as any}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={onAddCustomChapter}
              />
              <Pressable onPress={onAddCustomChapter} style={styles.btn}>
                <Text style={styles.btnText}>Add</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={styles.helper}>Select a subject to choose chapters</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Overall difficulty (optional)</Text>
        <View style={styles.rowWrap}>
          {DIFFICULTIES.map((d) => (
            <Pressable key={d} onPress={() => setOverallDifficulty(overallDifficulty === d ? null : d)} style={[styles.chip, overallDifficulty === d && styles.chipActive]}>
              <Text style={[styles.chipText, overallDifficulty === d && styles.chipTextActive]}>{d}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Question counts</Text>
        <View style={styles.countRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Easy</Text>
            <TextInput value={easyCount} onChangeText={setEasyCount} keyboardType={Platform.select({ ios: "number-pad", android: "numeric", default: "number-pad" }) as any} style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Medium</Text>
            <TextInput value={mediumCount} onChangeText={setMediumCount} keyboardType={Platform.select({ ios: "number-pad", android: "numeric", default: "number-pad" }) as any} style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Hard</Text>
            <TextInput value={hardCount} onChangeText={setHardCount} keyboardType={Platform.select({ ios: "number-pad", android: "numeric", default: "number-pad" }) as any} style={styles.input} />
          </View>
        </View>
        <Text style={styles.helper}>Total: {totalCount}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Tags</Text>
        <View style={styles.rowWrap}>
          {TAG_SUGGESTIONS.map((s) => (
            <Pressable key={s} onPress={() => { if (!tags.includes(s)) setTags((prev) => [...prev, s]); }} style={styles.suggestion}>
              <Text style={styles.suggestionText}>+ {s}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.inlineControls}>
          <TextInput
            placeholder="Add tag (e.g., jee mains)"
            value={tagInput}
            onChangeText={setTagInput}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={addTag}
          />
          <Pressable onPress={addTag} style={styles.btn}>
            <Text style={styles.btnText}>Add</Text>
          </Pressable>
        </View>
        {tags.length > 0 && (
          <View style={styles.rowWrap}>
            {tags.map((t) => (
              <Pressable key={t} onPress={() => removeTag(t)} style={[styles.chip, styles.removeChip]}>
                <Text style={styles.chipText}>✕ {t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Topics (optional)</Text>
        <View style={styles.inlineControls}>
          <TextInput
            placeholder="Add topic"
            value={topicInput}
            onChangeText={setTopicInput}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={addTopic}
          />
          <Pressable onPress={addTopic} style={styles.btn}>
            <Text style={styles.btnText}>Add</Text>
          </Pressable>
        </View>
        {topics.length > 0 && (
          <View style={styles.rowWrap}>
            {topics.map((t) => (
              <Pressable key={t} onPress={() => removeTopic(t)} style={[styles.chip, styles.removeChip]}>
                <Text style={styles.chipText}>✕ {t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          placeholder="Any notes for this paper..."
          value={description}
          onChangeText={setDescription}
          style={[styles.input, { height: 90, textAlignVertical: "top" }]}
          multiline
        />
      </View>

      <Pressable disabled={isGenerating} onPress={onGenerate} style={[styles.btn, styles.generateBtn, isGenerating && { opacity: 0.7 }]}>
        <Text style={styles.btnText}>{isGenerating ? "Generating..." : "Generate"}</Text>
      </Pressable>

      {results.length > 0 && (
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={styles.label}>Generated Questions ({results.length})</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => router.push("/paper-history" as any)} style={[styles.btn, styles.outlineBtn, { height: 32, paddingHorizontal: 10 }]}>
                <Text style={styles.outlineBtnText}>History</Text>
              </Pressable>
              <Pressable onPress={onClearResults} style={[styles.btn, styles.dangerBtn, { height: 32, paddingHorizontal: 10 }]}>
                <Text style={styles.btnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
          
          {/* Save Paper Section */}
          <View style={styles.saveSection}>
            <TextInput
              placeholder="Paper title (optional, auto-generated if empty)"
              value={paperTitle}
              onChangeText={setPaperTitle}
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable 
              disabled={isSaving} 
              onPress={onSavePaper} 
              style={[styles.btn, styles.saveBtn, isSaving && { opacity: 0.7 }]}
            >
              <Text style={styles.btnText}>{isSaving ? "Saving..." : "Save Paper"}</Text>
            </Pressable>
          </View>
          
          <View style={{ gap: 12 }}>
            {results.map((q, idx) => {
              const correct = typeof q.correctIndex === "number" ? q.correctIndex : -1;
              return (
                <View key={`${idx}-${q.text.slice(0, 16)}`} style={styles.card}>
                  <Text style={styles.qIndex}>Q{idx + 1}.</Text>
                  <Text style={styles.qText}>{q.text}</Text>
                  <View style={{ gap: 6, marginTop: 8 }}>
                    {Array.isArray(q.options) && q.options.map((opt, i) => (
                      <View key={i} style={[styles.optRow, i === correct && styles.optCorrect]}>
                        <Text style={[styles.optBullet, i === correct && styles.optBulletCorrect]}>{String.fromCharCode(65 + i)}.</Text>
                        <Text style={[styles.optText, i === correct && styles.optTextCorrect]}>{opt}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaPill}>{q.difficulty}</Text>
                    {!!q.chapter && <Text style={styles.metaPill}>{q.chapter}</Text>}
                    {Array.isArray(q.topics) && q.topics.slice(0, 3).map((t, i) => (
                      <Text key={i} style={styles.metaPill}>{t}</Text>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32, gap: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  section: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  small: { fontSize: 12, color: "#6b7280", marginBottom: 6 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 12, height: 40 },
  inlineControls: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: "#ddd", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { color: "#111827" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  suggestion: { backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#e5e7eb" },
  suggestionText: { color: "#111827" },
  removeChip: { borderColor: "#fecaca", backgroundColor: "#fff1f2" },
  countRow: { flexDirection: "row", gap: 12 },
  btn: { backgroundColor: "#111827", paddingHorizontal: 14, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "600" },
  helper: { color: "#6b7280" },
  generateBtn: { marginTop: 8 },
  // Save section
  saveSection: { flexDirection: "row", gap: 12, alignItems: "center", padding: 12, backgroundColor: "#f0fdf4", borderRadius: 10, borderWidth: 1, borderColor: "#bbf7d0", marginBottom: 8 },
  saveBtn: { backgroundColor: "#16a34a", minWidth: 100 },
  outlineBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#111827" },
  outlineBtnText: { color: "#111827", fontWeight: "600" },
  dangerBtn: { backgroundColor: "#dc2626" },
  // results
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, backgroundColor: "#fff", gap: 6 },
  qIndex: { fontSize: 12, color: "#6b7280" },
  qText: { fontSize: 14, color: "#111827" },
  optRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  optCorrect: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  optBullet: { width: 20, color: "#374151", fontWeight: "600" },
  optBulletCorrect: { color: "#065f46" },
  optText: { flex: 1, color: "#374151" },
  optTextCorrect: { color: "#065f46", fontWeight: "600" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  metaPill: { borderWidth: 1, borderColor: "#e5e7eb", color: "#111827", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 12, backgroundColor: "#f9fafb" },
});


