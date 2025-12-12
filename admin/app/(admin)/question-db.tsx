import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Button, Platform, ScrollView, ActivityIndicator } from "react-native";
import { uploadPdfDirect, processQuestionPdf } from "@/api/admin";
import { useQuestionEditorStore, type QuestionEditorState, SUBJECTS } from "@/store/questionEditor";
import { router } from "expo-router";

const QuestionDB = () => {
  const [file, setFile] = useState<any | null>(null);
  const [startPage, setStartPage] = useState<string>("1");
  const [numPages, setNumPages] = useState<string>("1");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedPublicUrl, setUploadedPublicUrl] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const loadFromBackendResult = useQuestionEditorStore((s: QuestionEditorState) => s.loadFromBackendResult);
  const selectedSubject = useQuestionEditorStore((s: QuestionEditorState) => s.selectedSubject);
  const setSelectedSubject = useQuestionEditorStore((s: QuestionEditorState) => s.setSelectedSubject);

  const canSubmit = useMemo(() => {
    const sp = parseInt(startPage || "1", 10);
    const np = parseInt(numPages || "1", 10);
    // Allow send only when an upload has completed and pages are valid
    return !!uploadedPublicUrl && Number.isFinite(sp) && sp > 0 && Number.isFinite(np) && np > 0 && !!selectedSubject;
  }, [uploadedPublicUrl, startPage, numPages, selectedSubject]);

  const fileToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const stringifyResultHidingBase64 = (data: any) => {
    try {
      const replacer = (key: string, value: any) => {
        if (key === "image" && typeof value === "string" && value.startsWith("data:image/")) {
          return "[base64 hidden — use Copy button]";
        }
        return value;
      };
      return JSON.stringify(data, replacer, 2);
    } catch {
      return String(data);
    }
  };

  const extractBase64 = (dataUrl: string) => {
    const commaIndex = dataUrl.indexOf(",");
    return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  };

  const copyText = async (text: string, id: string) => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(text);
      } else {
        // Fallback: create a temporary textarea (web) or simply no-op on native
        if (Platform.OS === "web") {
          const el = document.createElement("textarea");
          el.value = text;
          el.setAttribute("readonly", "");
          el.style.position = "absolute";
          el.style.left = "-9999px";
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
        }
      }
      setCopiedFor(id);
      setTimeout(() => setCopiedFor((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // ignore
    }
  };

  // no-op handler retained for possible future native picker integration

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Question DB</Text>

      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Upload PDF</Text>
        {Platform.OS === "web" ? (
          // Render a native input for web
          // @ts-ignore - React Native Web supports DOM elements on web
          <input
            type="file"
            accept="application/pdf"
            onChange={(e: any) => {
              const f = e?.target?.files?.[0];
              if (f && f.type === "application/pdf") {
                (async () => {
                  setFile(f);
                  setResult(null);
                  setUploadedPublicUrl(null);
                  setUploading(true);
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
                    setResult({ error: "Upload failed" });
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
          <View>
            <Text style={{ color: "#666" }}>
              File picker not set up on native. Install expo-document-picker to enable.
            </Text>
          </View>
        )}
        <Text style={{ color: file ? "green" : "#888" }}>
          {file ? `Selected: ${file.name || file.uri || "PDF file"}` : "No file selected"}
        </Text>
        {uploadedPublicUrl ? (
          <Text style={{ color: "#0a7", fontSize: 12 }}>Uploaded to storage. Ready to process.</Text>
        ) : uploading ? (
          <Text style={{ color: "#666", fontSize: 12 }}>Uploading to storage…</Text>
        ) : null}
      </View>

      {/* Subject selection shown once upload has completed */}
      {uploadedPublicUrl ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: "500" }}>Subject</Text>
          {Platform.OS === "web" ? (
            // @ts-ignore web-only select
            <select
              value={selectedSubject ?? ""}
              onChange={(e: any) => setSelectedSubject(e?.target?.value || null)}
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, minWidth: 200 }}
            >
              {/* @ts-ignore */}
              <option value="" disabled>
                Select subject
              </option>
              {SUBJECTS.map((s) => (
                // @ts-ignore web-only option
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <TextInput
              value={selectedSubject ?? ""}
              onChangeText={(t) => setSelectedSubject(t || null)}
              placeholder="Enter subject"
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            />
          )}
          {!selectedSubject ? (
            <Text style={{ color: "#C00", fontSize: 12 }}>Subject is required before processing.</Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Start Page</Text>
        <TextInput
          value={startPage}
          onChangeText={setStartPage}
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="e.g. 3"
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: "500" }}>Number of Pages</Text>
        <TextInput
          value={numPages}
          onChangeText={setNumPages}
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="e.g. 2"
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Button
          title={submitting ? "Processing..." : "Send to Backend"}
          onPress={async () => {
            if (!canSubmit || !uploadedPublicUrl) return;
            setSubmitting(true);
            setResult(null);
            try {
              const sp = Math.max(parseInt(startPage || "1", 10) || 1, 1);
              const np = Math.max(parseInt(numPages || "1", 10) || 1, 1);
              const resp = await processQuestionPdf({ pdfUrl: uploadedPublicUrl, startPage: sp, numPages: np });
              setResult(resp);
              // Load into editor store and navigate to editor screen
              try {
                loadFromBackendResult(resp);
                router.push("/(admin)/question-editor");
              } catch {
                // ignore store/navigation errors to still show raw result
              }
            } catch (e: any) {
              setResult({ error: e?.response?.data || e?.message || "Processing failed" });
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={!canSubmit || submitting || uploading}
        />
        {uploading ? (
          <View style={{ marginTop: 8, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 6, color: "#666" }}>Uploading to storage…</Text>
          </View>
        ) : null}
        {submitting ? (
          <View style={{ marginTop: 8, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 6, color: "#666" }}>Processing PDF…</Text>
          </View>
        ) : null}
      </View>

      {result ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600" }}>Result</Text>
          {/* Quick actions for any images present */}
          {Array.isArray(result?.data) && result.data.some((d: any) => !!d?.image) ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: "#555" }}>Images detected. Copy base64 without displaying:</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {result.data.map((item: any, idx: number) => {
                  if (!item?.image || typeof item.image !== "string") return null;
                  const id = `img-${idx}`;
                  return (
                    <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Button
                        title={copiedFor === id ? "Copied!" : `Copy base64 (Q${idx + 1})`}
                        onPress={() => copyText(extractBase64(item.image), id)}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
          <ScrollView
            style={{
              maxHeight: 320,
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 6,
              backgroundColor: "#fafafa",
            }}
            contentContainerStyle={{ padding: 8 }}
          >
            <Text
              selectable
              style={{
                color: result?.error ? "red" : "#333",
                fontFamily: Platform.OS === "web" ? "monospace" : undefined,
              }}
            >
              {typeof result === "string" ? result : stringifyResultHidingBase64(result)}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

export default QuestionDB;


