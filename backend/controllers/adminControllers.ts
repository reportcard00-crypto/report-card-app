import type { Request, Response } from "express";
import User from "../models/userModel";
import ROLES from "../types/roles";
import axios from "axios";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist";
import type { CustomRequest } from "../types";
import { uploadBufferToR2 } from "../utils/fileupload";
import Question from "../models/questionModel";
import UploadSession from "../models/uploadSessionModel";
import QuestionPaper from "../models/questionPaperModel";
import { getEmbeddingForText, upsertVectorsToPinecone, querySimilarInPinecone } from "../utils/vector";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

export const listUsers = async (req: Request, res: Response) => {
  try {
    const { search, role, page = "1", limit = "20" } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(parseInt(String(page || "1"), 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit || "20"), 10) || 20, 1), 100);

    const query: Record<string, unknown> = {};

    if (search && String(search).trim().length > 0) {
      const s = String(search).trim();
      query.$or = [
        { name: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } },
      ];
    }

    if (role && Object.values(ROLES).includes(role as any)) {
      query.role = role;
    }

    const [items, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select("name phone role isPhoneVerified createdAt"),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const { role } = (req.body || {}) as { role?: string };

    if (!role || !Object.values(ROLES).includes(role as any)) {
      res.status(400).json({ success: false, message: "Invalid role" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role, updatedAt: new Date() },
      { new: true }
    ).select("name phone role isPhoneVerified");

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const generateQuestionMetadata = async (req: CustomRequest, res: Response) => {
  try {
    const { text, options, subject, preferExamTag } = (req.body || {}) as {
      text?: string;
      options?: string[];
      subject?: string | null;
      preferExamTag?: string | null;
    };

    const questionText = String(text || "").trim();
    const choices: string[] = Array.isArray(options)
      ? options.map((o) => String(o ?? "")).filter((s) => s.length > 0)
      : [];
    const subjectText = subject ? String(subject).trim() : "";
    const preferredExam = preferExamTag ? String(preferExamTag).trim() : "";

    if (!questionText) {
      res.status(400).json({ success: false, message: "text is required" });
      return;
    }

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      res.status(500).json({ success: false, message: "OPENROUTER_API_KEY not configured" });
      return;
    }

    // Prefer Perplexity online/browsing-capable models (stable on chat-completions)
    const modelCandidates = [
      "perplexity/sonar-deep-research",
    ];
    const systemPrompt =
      "You are an expert educational content analyst for Indian competitive exams. " +
      "Given a question (and optionally its multiple-choice options), infer rich, useful metadata with care. " +
      "When helpful, use web research to identify canonical chapter/topic names, exam contexts, or commonly associated tags. " +
      "Return ONLY strict JSON. Do not include any extra text. " +
      "CRITICAL: The `description` field must be an exam-relevance summary (not a paraphrase of the question). " +
      "FORMAT: Use proper markdown formatting in the description field - use **bold** for emphasis, bullet points (- or •), and LaTeX for math expressions ($inline$ or $$block$$).";

    const schemaExample = {
      chapter: "string | null",
      topics: ["string", "string"],
      tags: ["string", "string"],
      difficulty: "easy | medium | hard",
      description: "string",
      correctIndex: "number | null",
    };

    const userInstructions =
      "Generate metadata for the following question.\n" +
      (subjectText ? `- Subject: ${subjectText}\n` : "") +
      (preferredExam ? `- Primary exam context (if relevant): ${preferredExam}\n` : "") +
      "- Use web search if it materially improves accuracy or specificity (e.g., past paper appearances).\n" +
      "- Use neutral, widely-recognized naming for chapter and topics.\n" +
      "- Tags should be helpful for search and organization; include exam tags (e.g., JEE Mains/NEET/Boards) only when meaningful.\n" +
      "- If options are provided, set correctIndex to the index (0-based) of the most plausible correct option; otherwise null.\n" +
      "- DESCRIPTION REQUIREMENTS (very important):\n" +
      "  • Write a compact exam-relevance summary using proper **markdown formatting**.\n" +
      "  • Use bullet points (- item) for lists, **bold** for key terms, and *italics* for emphasis.\n" +
      "  • For any mathematical expressions, use LaTeX: $x^2$ for inline, $$\\frac{a}{b}$$ for block.\n" +
      "  • Cover: Past appearances (years/exams), importance/weightage, concepts tested, marks/time, likelihood.\n" +
      "  • Example format:\n" +
      "    **Exam Trend:** JEE Mains 2019 (Shift 1), 2022 (Shift 2)\n" +
      "    - **Weightage:** ~2–3% in Mechanics\n" +
      "    - **Concepts:** Newton's laws, system acceleration\n" +
      "    - **Key Formula:** $F = ma$, $a_{system} = \\frac{F_{net}}{m_{total}}$\n" +
      "    - **Likelihood:** *High* for next cycle\n" +
      "    - **Refs:** NCERT XI Physics Ch.5\n" +
      "- Respond with ONLY a JSON object conforming to this schema:\n" +
      JSON.stringify(schemaExample, null, 2) +
      "\n\nQuestion:\n" +
      questionText +
      (choices.length > 0
        ? "\n\nOptions (in order):\n" + choices.map((c, i) => `${i}. ${c}`).join("\n")
        : "");

    const headers = {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
      "X-Title": process.env.OPENROUTER_APP_NAME || "ReportCardApp",
    };

    let content = "";
    let lastError: any = null;
    for (const model of modelCandidates) {
      const payload = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInstructions },
        ],
        temperature: 0.6,
        max_tokens: 800,
        // Extra fields are forwarded to the model on OpenRouter; Perplexity models respect web_search
        extra_body: {
          web_search: true,
          return_citations: true,
        },
      };
      try {
        const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, { headers });
        content = String(resp?.data?.choices?.[0]?.message?.content ?? "").trim();
        if (content) break;
      } catch (err) {
        lastError = err;
        // try next candidate
        continue;
      }
    }
    if (!content) {
      // Surface upstream error details for debugging
      try {
        const status = lastError?.response?.status;
        const data = lastError?.response?.data;
        console.error("OpenRouter metadata generation failed for all models:", status, data || lastError);
      } catch {
        console.error("OpenRouter metadata generation failed for all models:", lastError);
      }
      res.status(502).json({ success: false, message: "Upstream AI service failed" });
      return;
    }

    // Try to parse strict JSON object
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonText = extractJsonObject(content);
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        console.error("Failed to parse AI JSON response:", e, content);
        parsed = {};
      }
    }

    // Coerce and validate fields with minimal restriction
    const chapter =
      parsed?.chapter === null || parsed?.chapter === undefined || String(parsed?.chapter).trim() === ""
        ? null
        : String(parsed.chapter);
    const topics: string[] = Array.isArray(parsed?.topics)
      ? parsed.topics.map((t: any) => String(t)).filter((s: string) => s.length > 0)
      : [];
    const tags: string[] = Array.isArray(parsed?.tags)
      ? parsed.tags.map((t: any) => String(t)).filter((s: string) => s.length > 0)
      : [];
    const diffRaw = String(parsed?.difficulty || "").toLowerCase();
    const difficulty: "easy" | "medium" | "hard" =
      diffRaw === "easy" || diffRaw === "hard" ? (diffRaw as any) : "medium";
    const description = typeof parsed?.description === "string" ? parsed.description : "";
    const proposedIndex =
      typeof parsed?.correctIndex === "number" ? parsed.correctIndex : null;
    const correctIndex =
      choices.length > 0 && typeof proposedIndex === "number" && proposedIndex >= 0 && proposedIndex < choices.length
        ? proposedIndex
        : undefined;

    res.status(200).json({
      success: true,
      data: {
        chapter,
        difficulty,
        topics,
        tags,
        correctIndex,
        description,
      },
    });
  } catch (error) {
    console.error("Error generating question metadata:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const uploadQuestionPdf = async (req: CustomRequest, res: Response) => {
  try {
    const { fileUrl, startPage, numPages } = (req.body || {}) as {
      fileUrl?: string;
      startPage?: string | number;
      numPages?: string | number;
    };

    if (!fileUrl || typeof fileUrl !== "string") {
      res.status(400).json({ success: false, message: "fileUrl is required" });
      return;
    }

    const startPageNum = Math.max(parseInt(String(startPage ?? "1"), 10) || 1, 1);
    const numPagesNum = Math.max(parseInt(String(numPages ?? "1"), 10) || 1, 1);

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      res.status(500).json({ success: false, message: "OPENROUTER_API_KEY not configured" });
      return;
    }

    // Download the PDF from R2 and load via pdfjs
    const pdfResp = await axios.get<ArrayBuffer>(fileUrl, { responseType: "arraybuffer" });
    const pdfData = new Uint8Array(pdfResp.data as any);
    const loadingTask = getDocument({ data: pdfData, disableFontFace: true, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const start = Math.min(startPageNum, totalPages);
    const end = Math.min(start + numPagesNum - 1, totalPages);

    type ExtractedQuestion = {
      question: string;
      questionType: "objective" | "subjective";
      options: string[];
      correctOption?: string;
      image?: string | null;
      page: number;
    };

    const pageResults: ExtractedQuestion[] = [];
    const seenQuestions = new Set<string>();
    // Keep previous page context to handle cross-page (split) questions
    let previousPageDataUrl: string | null = null;
    let previousPageExtraction: any[] = [];

    const currentUser = req.user;
    const userId = String(currentUser?._id || "");
    const role = String(currentUser?.role || "");

    for (let pageNum = start; pageNum <= end; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 }); // 2x scale for better OCR quality
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      // @ts-ignore - node-canvas context type compatibility
      const context = canvas.getContext("2d");

      await page.render({ canvasContext: context, viewport }).promise;
      const pngBuffer = canvas.toBuffer("image/png");
      const base64Image = pngBuffer.toString("base64");
      const dataUrl = `data:image/png;base64,${base64Image}`;

      // Extract text layer from PDF (accurate, verbatim text)
      const textContent = await page.getTextContent();
      const textItems = textContent.items as Array<{ str: string; transform?: number[] }>;

      // Sort text items by vertical position (top to bottom) then horizontal (left to right)
      const sortedItems = textItems
        .filter((item) => item.str && item.str.trim())
        .map((item) => ({
          str: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
        }))
        .sort((a, b) => {
          // Sort by Y (descending, since PDF Y is bottom-up) then by X
          const yDiff = b.y - a.y;
          if (Math.abs(yDiff) > 5) return yDiff; // Different lines
          return a.x - b.x; // Same line, sort left to right
        });

      // Reconstruct text with line breaks
      let extractedText = "";
      let lastY: number | null = null;
      for (const item of sortedItems) {
        if (lastY !== null && Math.abs(item.y - lastY) > 5) {
          extractedText += "\n";
        } else if (extractedText && !extractedText.endsWith(" ") && !extractedText.endsWith("\n")) {
          extractedText += " ";
        }
        extractedText += item.str;
        lastY = item.y;
      }

      const hasSelectableText = extractedText.trim().length > 50; // Threshold to detect if PDF has real text

      // Build prompt for OpenRouter (multimodal)
      const model = "google/gemini-3-pro-preview";
      const baseSystemPrompt =
        "You are an expert at parsing printed exam pages. You will receive: " +
        "(1) The EXTRACTED TEXT from the PDF's text layer - this may contain garbled Unicode math symbols. " +
        "(2) An IMAGE of the page - use this to understand the ACTUAL content, especially mathematical expressions. " +
        "CRITICAL MATH FORMATTING RULES: " +
        "- Convert ALL mathematical expressions to proper LaTeX format wrapped in $ delimiters. " +
        "- Examples: 'x 2 /6 + y 2 /3 = 1' should become '$\\frac{x^2}{6} + \\frac{y^2}{3} = 1$'. " +
        "- Subscripts like 'T 1' become '$T_1$', superscripts like 'x 2' become '$x^2$'. " +
        "- Set notation like '{0,1,2,3}' becomes '$\\{0,1,2,3\\}$'. " +
        "- Intervals like '(0,1)' in math context become '$(0,1)$'. " +
        "- Replace garbled symbols (≡, ∈, ⊆, →, etc) with their proper LaTeX equivalents ($\\equiv$, $\\in$, $\\subseteq$, $\\to$). " +
        "- Greek letters should be in LaTeX: α→$\\alpha$, β→$\\beta$, θ→$\\theta$, etc. " +
        "- USE THE IMAGE to determine the correct mathematical meaning when the extracted text is garbled. " +
        "Return ONLY strict JSON (no prose). For each question, include: " +
        "`question` (string with proper LaTeX math), `questionType` ('objective' or 'subjective'), " +
        "`options` (array of strings with proper LaTeX math, ONLY for objective questions, empty array for subjective), " +
        "and, if clearly present for objective questions, `correctOption` (string matching one of the options). " +
        "SUBJECTIVE questions are: essay questions, short-answer questions, numerical problems without options, derivations, proofs, 'explain' questions, 'describe' questions, etc. " +
        "OBJECTIVE questions are: MCQs with A/B/C/D options, true/false, match the following with options. " +
        "If a diagram is associated with a question, set `hasDiagram` to true and also include `diagramBox` " +
        "as an object with normalized coordinates relative to the image dimensions: " +
        "{ x: number, y: number, width: number, height: number } with 0 <= values <= 1. " +
        "The box should tightly enclose only the figure/diagram related to that question (exclude text as much as possible). " +
        "Focus only on printed/typed content; ignore handwritten notes.";

      const extractedTextBlock = hasSelectableText
        ? `\n\n--- EXTRACTED TEXT FROM PDF (reference only, may have garbled math symbols) ---\n${extractedText}\n--- END EXTRACTED TEXT ---\n`
        : "\n\n--- No selectable text found in PDF, using OCR from image ---\n";

      const firstPageInstruction =
        "Extract ALL questions (both objective MCQ and subjective open-ended) from this page. " +
        "IMPORTANT: Use the IMAGE as the primary source for understanding mathematical content. The extracted text may have garbled symbols. " +
        "Convert all mathematical expressions to proper LaTeX format (e.g., $x^2$, $\\frac{a}{b}$, $T_1$, $\\alpha$). " +
        extractedTextBlock +
        "Respond with a JSON array using this exact schema: " +
        "[{ \"question\": string, \"questionType\": \"objective\" | \"subjective\", \"options\": string[], \"correctOption\"?: string, \"hasDiagram\": boolean, " +
        "\"diagramBox\"?: { \"x\": number, \"y\": number, \"width\": number, \"height\": number } }]. " +
        "For subjective questions (essay, short-answer, numerical without options), set questionType to 'subjective' and options to empty array []. " +
        "For objective questions (MCQ with options), set questionType to 'objective' and include all options. " +
        "Do not include any text outside the JSON. If no questions found, return []. " +
        "When a diagram is present, provide a precise `diagramBox` around the diagram only.";

      const continuationInstruction =
        "The next page may contain the continuation of a question that started on the previous page. " +
        "You are given: (1) the previous page image, (2) the JSON extracted from the previous page, (3) the current page image, and (4) the EXTRACTED TEXT from the current page. " +
        "IMPORTANT: Use the IMAGE as the primary source. Convert all math to LaTeX format. The extracted text may have garbled symbols. " +
        "Using these, return ONLY the questions that are NEW on the current page or that CONTINUE from the previous page but were incomplete there. " +
        "Include both objective (MCQ) and subjective (open-ended) questions. " +
        "Do NOT duplicate any question that is already fully captured in the previous JSON. " +
        "Output must be a JSON array with the same exact schema as before (including questionType field). " +
        "If nothing new or continued is found, return [].";

      const payload = {
        model,
        messages: [
          { role: "system", content: baseSystemPrompt },
          pageNum === start
            ? {
                role: "user",
                content: [
                  { type: "text", text: firstPageInstruction },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              }
            : {
                role: "user",
                content: [
                  { type: "text", text: continuationInstruction },
                  // Previous page image
                  ...(previousPageDataUrl ? [{ type: "image_url", image_url: { url: previousPageDataUrl } } as any] : []),
                  // Previous JSON extraction to avoid duplicates and help reconstruction
                  {
                    type: "text",
                    text:
                      "Previous page extracted JSON (may be incomplete for split questions):\n" +
                      JSON.stringify(previousPageExtraction || [], null, 2) +
                      extractedTextBlock,
                  },
                  // Current page image
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
        ],
        temperature: 0,
      };

      const headers = {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        // Optional but recommended headers for OpenRouter
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
        "X-Title": process.env.OPENROUTER_APP_NAME || "ReportCardApp",
      };

      let extracted: any[] = [];
      try {
        const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, { headers });
        const content: string = resp?.data?.choices?.[0]?.message?.content || "[]";
        const jsonText = extractJsonArray(content);
        extracted = JSON.parse(jsonText);
      } catch (err) {
        // If extraction fails for the page, continue to next; log for debugging
        console.error("OpenRouter extraction failed for page", pageNum, err);
        extracted = [];
      }

      for (const item of extracted) {
        // If model returned a diagram box, crop the rendered page to that region
        let diagramUrl: string | null = null;
        if (item?.hasDiagram && item?.diagramBox && typeof item.diagramBox === "object") {
          const rel = item.diagramBox || {};
          const cw = canvas.width;
          const ch = canvas.height;
          // Normalize and clamp
          const rx = Math.max(0, Math.min(1, Number(rel.x)));
          const ry = Math.max(0, Math.min(1, Number(rel.y)));
          const rw = Math.max(0, Math.min(1, Number(rel.width)));
          const rh = Math.max(0, Math.min(1, Number(rel.height)));
          let sx = Math.floor(rx * cw);
          let sy = Math.floor(ry * ch);
          let sw = Math.floor(rw * cw);
          let sh = Math.floor(rh * ch);
          // Add a small padding and clamp again
          const pad = 8;
          sx = Math.max(0, sx - pad);
          sy = Math.max(0, sy - pad);
          sw = Math.min(cw - sx, sw + 2 * pad);
          sh = Math.min(ch - sy, sh + 2 * pad);
          if (sw > 5 && sh > 5) {
            const crop = createCanvas(sw, sh);
            // @ts-ignore
            const cropCtx = crop.getContext("2d");
            // draw from the already-rendered page canvas
            // @ts-ignore
            cropCtx.drawImage(canvas as any, sx, sy, sw, sh, 0, 0, sw, sh);
            const cropBuffer = crop.toBuffer("image/png");
            // Upload cropped diagram to R2 and store its public URL
            try {
              const uploaded = await uploadBufferToR2(
                cropBuffer,
                "image/png",
                `diagram_page_${pageNum}.png`,
                role,
                userId,
                true
              );
              diagramUrl = uploaded.publicUrl;
            } catch (e) {
              console.error("Failed to upload diagram image to R2", e);
              diagramUrl = null;
            }
          }
        }
        const options = Array.isArray(item?.options) ? item.options.map((o: any) => String(o)) : [];
        // Determine question type - default to objective if has options, subjective if no options
        const questionType: "objective" | "subjective" = 
          item?.questionType === "subjective" || (options.length === 0) ? "subjective" : "objective";
        
        const q: ExtractedQuestion = {
          question: String(item?.question || "").trim(),
          questionType,
          options,
          correctOption: questionType === "objective" && item?.correctOption ? String(item.correctOption) : undefined,
          image: item?.hasDiagram ? diagramUrl : null,
          page: pageNum,
        };
        // Allow subjective questions with no options, or objective questions with options
        const isValidQuestion = q.question && 
          ((questionType === "objective" && options.length > 0) || questionType === "subjective");
        
        if (isValidQuestion && !seenQuestions.has(q.question)) {
          seenQuestions.add(q.question);
          pageResults.push(q);
        }
      }

      // Save context for next iteration
      previousPageDataUrl = dataUrl;
      previousPageExtraction = extracted;
    }

    res.status(200).json({
      success: true,
      message: "PDF processed",
      data: pageResults,
    });
  } catch (error) {
    console.error("Error uploading question PDF:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Helper functions for hash computation
const normalizeText = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const computeContentHash = (subjectVal: string, textVal: string, optionVals: string[]) => {
  const base = [
    normalizeText(subjectVal),
    normalizeText(textVal),
    ...optionVals.map((o) => normalizeText(o)),
  ].join("||");
  return createHash("sha256").update(base).digest("hex");
};

// Streaming PDF processing with real-time question extraction and DB saves
export const uploadQuestionPdfStream = async (req: CustomRequest, res: Response) => {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  // Flush headers immediately
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Force flush if available
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  };

  let sessionId: string | null = null;

  try {
    const { fileUrl, fileName, startPage, numPages, subject } = (req.body || {}) as {
      fileUrl?: string;
      fileName?: string;
      startPage?: string | number;
      numPages?: string | number;
      subject?: string;
    };

    if (!fileUrl || typeof fileUrl !== "string") {
      sendEvent("error", { message: "fileUrl is required" });
      res.end();
      return;
    }

    if (!subject || typeof subject !== "string") {
      sendEvent("error", { message: "subject is required" });
      res.end();
      return;
    }

    const currentUser = req.user;
    if (!currentUser?._id) {
      sendEvent("error", { message: "Unauthorized" });
      res.end();
      return;
    }

    const startPageNum = Math.max(parseInt(String(startPage ?? "1"), 10) || 1, 1);
    const numPagesNum = Math.max(parseInt(String(numPages ?? "1"), 10) || 1, 1);

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      sendEvent("error", { message: "OPENROUTER_API_KEY not configured" });
      res.end();
      return;
    }

    // Create upload session record
    const uploadSession = await UploadSession.create({
      fileName: fileName || "question.pdf",
      fileUrl,
      subject,
      startPage: startPageNum,
      numPages: numPagesNum,
      status: "processing",
      createdBy: currentUser._id,
    });
    sessionId = uploadSession._id.toString();

    sendEvent("session_started", { 
      sessionId, 
      fileName: fileName || "question.pdf",
      subject,
      startPage: startPageNum,
      numPages: numPagesNum
    });

    // Download the PDF from R2 and load via pdfjs
    sendEvent("progress", { message: "Downloading PDF...", step: "download" });
    const pdfResp = await axios.get<ArrayBuffer>(fileUrl, { responseType: "arraybuffer" });
    const pdfData = new Uint8Array(pdfResp.data as any);
    const loadingTask = getDocument({ data: pdfData, disableFontFace: true, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const start = Math.min(startPageNum, totalPages);
    const end = Math.min(start + numPagesNum - 1, totalPages);
    const actualNumPages = end - start + 1;

    // Notify about any page adjustment
    if (startPageNum > totalPages || startPageNum + numPagesNum - 1 > totalPages) {
      sendEvent("progress", { 
        message: `PDF has ${totalPages} pages. Adjusted range to pages ${start}-${end} (${actualNumPages} pages)`, 
        step: "adjusted",
        requestedStart: startPageNum,
        requestedNum: numPagesNum,
        actualStart: start,
        actualEnd: end,
        totalPdfPages: totalPages,
        totalPages: actualNumPages
      });
    }

    sendEvent("progress", { 
      message: `Processing ${actualNumPages} page${actualNumPages > 1 ? 's' : ''} (${start} to ${end})`, 
      step: "processing",
      totalPages: actualNumPages,
      startPage: start,
      endPage: end,
      totalPdfPages: totalPages
    });

    type ExtractedQuestion = {
      question: string;
      options: string[];
      correctOption?: string;
      image?: string | null;
      page: number;
    };

    const seenQuestions = new Set<string>();
    let previousPageDataUrl: string | null = null;
    let previousPageExtraction: any[] = [];

    const userId = String(currentUser._id || "");
    const role = String(currentUser.role || "");
    const savedQuestionIds: string[] = [];
    let questionIndex = 0;

    for (let pageNum = start; pageNum <= end; pageNum++) {
      sendEvent("page_start", { 
        pageNum,                          // Actual PDF page number
        totalPages: actualNumPages,       // Total pages to process
        currentPage: pageNum - start + 1, // 1-indexed position in our processing range
        pagesCompleted: pageNum - start,  // How many pages already done
        pagesRemaining: end - pageNum + 1 // How many pages left including current
      });

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      // @ts-ignore
      const context = canvas.getContext("2d");

      await page.render({ canvasContext: context, viewport }).promise;
      const pngBuffer = canvas.toBuffer("image/png");
      const base64Image = pngBuffer.toString("base64");
      const dataUrl = `data:image/png;base64,${base64Image}`;

      // Extract text layer from PDF (accurate, verbatim text)
      const textContent = await page.getTextContent();
      const textItems = textContent.items as Array<{ str: string; transform?: number[] }>;

      // Sort text items by vertical position (top to bottom) then horizontal (left to right)
      const sortedItems = textItems
        .filter((item) => item.str && item.str.trim())
        .map((item) => ({
          str: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
        }))
        .sort((a, b) => {
          // Sort by Y (descending, since PDF Y is bottom-up) then by X
          const yDiff = b.y - a.y;
          if (Math.abs(yDiff) > 5) return yDiff; // Different lines
          return a.x - b.x; // Same line, sort left to right
        });

      // Reconstruct text with line breaks
      let extractedText = "";
      let lastY: number | null = null;
      for (const item of sortedItems) {
        if (lastY !== null && Math.abs(item.y - lastY) > 5) {
          extractedText += "\n";
        } else if (extractedText && !extractedText.endsWith(" ") && !extractedText.endsWith("\n")) {
          extractedText += " ";
        }
        extractedText += item.str;
        lastY = item.y;
      }

      const hasSelectableText = extractedText.trim().length > 50; // Threshold to detect if PDF has real text

      // Build prompt for OpenRouter (multimodal)
      const model = "google/gemini-3-pro-preview";
      const baseSystemPrompt =
        "You are an expert at parsing printed exam pages. You will receive: " +
        "(1) The EXTRACTED TEXT from the PDF's text layer - this may contain garbled Unicode math symbols. " +
        "(2) An IMAGE of the page - use this to understand the ACTUAL content, especially mathematical expressions. " +
        "CRITICAL MATH FORMATTING RULES: " +
        "- Convert ALL mathematical expressions to proper LaTeX format wrapped in $ delimiters. " +
        "- Examples: 'x 2 /6 + y 2 /3 = 1' should become '$\\frac{x^2}{6} + \\frac{y^2}{3} = 1$'. " +
        "- Subscripts like 'T 1' become '$T_1$', superscripts like 'x 2' become '$x^2$'. " +
        "- Set notation like '{0,1,2,3}' becomes '$\\{0,1,2,3\\}$'. " +
        "- Intervals like '(0,1)' in math context become '$(0,1)$'. " +
        "- Replace garbled symbols (≡, ∈, ⊆, →, etc) with their proper LaTeX equivalents ($\\equiv$, $\\in$, $\\subseteq$, $\\to$). " +
        "- Greek letters should be in LaTeX: α→$\\alpha$, β→$\\beta$, θ→$\\theta$, etc. " +
        "- USE THE IMAGE to determine the correct mathematical meaning when the extracted text is garbled. " +
        "Return ONLY strict JSON (no prose). For each question, include: " +
        "`question` (string with proper LaTeX math), `questionType` ('objective' or 'subjective'), " +
        "`options` (array of strings with proper LaTeX math, ONLY for objective questions, empty array for subjective), " +
        "and, if clearly present for objective questions, `correctOption` (string matching one of the options). " +
        "SUBJECTIVE questions are: essay questions, short-answer questions, numerical problems without options, derivations, proofs, 'explain' questions, 'describe' questions, etc. " +
        "OBJECTIVE questions are: MCQs with A/B/C/D options, true/false, match the following with options. " +
        "If a diagram is associated with a question, set `hasDiagram` to true and also include `diagramBox` " +
        "as an object with normalized coordinates relative to the image dimensions: " +
        "{ x: number, y: number, width: number, height: number } with 0 <= values <= 1. " +
        "The box should tightly enclose only the figure/diagram related to that question (exclude text as much as possible). " +
        "Focus only on printed/typed content; ignore handwritten notes.";

      const extractedTextBlock = hasSelectableText
        ? `\n\n--- EXTRACTED TEXT FROM PDF (reference only, may have garbled math symbols) ---\n${extractedText}\n--- END EXTRACTED TEXT ---\n`
        : "\n\n--- No selectable text found in PDF, using OCR from image ---\n";

      const firstPageInstruction =
        "Extract ALL questions (both objective MCQ and subjective open-ended) from this page. " +
        "IMPORTANT: Use the IMAGE as the primary source for understanding mathematical content. The extracted text may have garbled symbols. " +
        "Convert all mathematical expressions to proper LaTeX format (e.g., $x^2$, $\\frac{a}{b}$, $T_1$, $\\alpha$). " +
        extractedTextBlock +
        "Respond with a JSON array using this exact schema: " +
        "[{ \"question\": string, \"questionType\": \"objective\" | \"subjective\", \"options\": string[], \"correctOption\"?: string, \"hasDiagram\": boolean, " +
        "\"diagramBox\"?: { \"x\": number, \"y\": number, \"width\": number, \"height\": number } }]. " +
        "For subjective questions (essay, short-answer, numerical without options), set questionType to 'subjective' and options to empty array []. " +
        "For objective questions (MCQ with options), set questionType to 'objective' and include all options. " +
        "Do not include any text outside the JSON. If no questions found, return []. " +
        "When a diagram is present, provide a precise `diagramBox` around the diagram only.";

      const continuationInstruction =
        "The next page may contain the continuation of a question that started on the previous page. " +
        "You are given: (1) the previous page image, (2) the JSON extracted from the previous page, (3) the current page image, and (4) the EXTRACTED TEXT from the current page. " +
        "IMPORTANT: Use the IMAGE as the primary source. Convert all math to LaTeX format. The extracted text may have garbled symbols. " +
        "Using these, return ONLY the questions that are NEW on the current page or that CONTINUE from the previous page but were incomplete there. " +
        "Include both objective (MCQ) and subjective (open-ended) questions. " +
        "Do NOT duplicate any question that is already fully captured in the previous JSON. " +
        "Output must be a JSON array with the same exact schema as before (including questionType field). " +
        "If nothing new or continued is found, return [].";

      const payload = {
        model,
        messages: [
          { role: "system", content: baseSystemPrompt },
          pageNum === start
            ? {
                role: "user",
                content: [
                  { type: "text", text: firstPageInstruction },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              }
            : {
                role: "user",
                content: [
                  { type: "text", text: continuationInstruction },
                  ...(previousPageDataUrl ? [{ type: "image_url", image_url: { url: previousPageDataUrl } } as any] : []),
                  {
                    type: "text",
                    text:
                      "Previous page extracted JSON (may be incomplete for split questions):\n" +
                      JSON.stringify(previousPageExtraction || [], null, 2) +
                      extractedTextBlock,
                  },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
        ],
        temperature: 0,
      };

      const headers = {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
        "X-Title": process.env.OPENROUTER_APP_NAME || "ReportCardApp",
      };

      let extracted: any[] = [];
      try {
        const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, { headers });
        const content: string = resp?.data?.choices?.[0]?.message?.content || "[]";
        const jsonText = extractJsonArray(content);
        extracted = JSON.parse(jsonText);
      } catch (err) {
        console.error("OpenRouter extraction failed for page", pageNum, err);
        extracted = [];
        sendEvent("page_error", { pageNum, error: "AI extraction failed for this page" });
      }

      for (const item of extracted) {
        let diagramUrl: string | null = null;
        if (item?.hasDiagram && item?.diagramBox && typeof item.diagramBox === "object") {
          const rel = item.diagramBox || {};
          const cw = canvas.width;
          const ch = canvas.height;
          const rx = Math.max(0, Math.min(1, Number(rel.x)));
          const ry = Math.max(0, Math.min(1, Number(rel.y)));
          const rw = Math.max(0, Math.min(1, Number(rel.width)));
          const rh = Math.max(0, Math.min(1, Number(rel.height)));
          let sx = Math.floor(rx * cw);
          let sy = Math.floor(ry * ch);
          let sw = Math.floor(rw * cw);
          let sh = Math.floor(rh * ch);
          const pad = 8;
          sx = Math.max(0, sx - pad);
          sy = Math.max(0, sy - pad);
          sw = Math.min(cw - sx, sw + 2 * pad);
          sh = Math.min(ch - sy, sh + 2 * pad);
          if (sw > 5 && sh > 5) {
            const crop = createCanvas(sw, sh);
            // @ts-ignore
            const cropCtx = crop.getContext("2d");
            // @ts-ignore
            cropCtx.drawImage(canvas as any, sx, sy, sw, sh, 0, 0, sw, sh);
            const cropBuffer = crop.toBuffer("image/png");
            try {
              const uploaded = await uploadBufferToR2(
                cropBuffer,
                "image/png",
                `diagram_page_${pageNum}.png`,
                role,
                userId,
                true
              );
              diagramUrl = uploaded.publicUrl;
            } catch (e) {
              console.error("Failed to upload diagram image to R2", e);
              diagramUrl = null;
            }
          }
        }

        const questionText = String(item?.question || "").trim();
        const options: string[] = Array.isArray(item?.options) ? item.options.map((o: any) => String(o)) : [];
        // Determine question type - default to objective if has options, subjective if no options
        const questionType: "objective" | "subjective" = 
          item?.questionType === "subjective" || (options.length === 0) ? "subjective" : "objective";

        // Allow subjective questions with no options, or objective questions with options
        const isValidQuestion = questionText && 
          ((questionType === "objective" && options.length > 0) || questionType === "subjective");

        if (isValidQuestion && !seenQuestions.has(questionText)) {
          seenQuestions.add(questionText);
          questionIndex++;

          // Determine correct index (only for objective questions)
          let correctIndex: number | undefined;
          if (questionType === "objective" && item?.correctOption) {
            const correctText = String(item.correctOption);
            const foundIdx = options.findIndex((o) => o.trim() === correctText.trim());
            if (foundIdx >= 0) correctIndex = foundIdx;
          }

          // Compute content hash for deduplication
          const contentHash = computeContentHash(subject, questionText, options);

          // Check if question already exists in DB
          const existingQuestion = await Question.findOne({ contentHash });
          
          let savedQuestion;
          let dbId: string;
          let pineconeId: string | undefined;

          if (existingQuestion) {
            // Question already exists, use existing
            dbId = existingQuestion._id.toString();
            pineconeId = existingQuestion.pineconeId ?? undefined;
            savedQuestion = existingQuestion;
          } else {
            // Create embedding and save to Pinecone + MongoDB
            try {
              const embedTextParts = [
                subject,
                questionText,
                ...options.map((o: string, i: number) => `(${i + 1}) ${o}`),
              ].filter(Boolean);
              const embedInput = embedTextParts.join("\n");
              const values = await getEmbeddingForText(embedInput);
              const vecId = uuidv4();

              // Build Pinecone metadata
              const metadata: Record<string, string | number | boolean | string[]> = {
                subject,
                hasImage: Boolean(diagramUrl),
                questionType,
              };

              // Upsert to Pinecone
              await upsertVectorsToPinecone([{
                id: vecId,
                values,
                metadata,
              }]);

              // Save to MongoDB
              savedQuestion = await Question.create({
                text: questionText,
                options,
                correctIndex,
                image: diagramUrl,
                questionType,
                subject,
                sourceFileUrl: fileUrl,
                sourcePage: pageNum,
                contentHash,
                pineconeId: vecId,
                createdBy: currentUser._id,
              });

              dbId = savedQuestion._id.toString();
              pineconeId = vecId;
            } catch (saveError) {
              console.error("Failed to save question to DB:", saveError);
              // Still send the question to frontend even if DB save fails
              dbId = `temp_${questionIndex}`;
            }
          }

          savedQuestionIds.push(dbId);

          // Stream the question to the frontend
          sendEvent("question", {
            index: questionIndex,
            dbId,
            pineconeId,
            question: questionText,
            questionType,
            options,
            correctIndex,
            correctOption: item?.correctOption || null,
            image: diagramUrl,
            page: pageNum,
            isExisting: !!existingQuestion,
          });
        }
      }

      // Update session progress
      await UploadSession.findByIdAndUpdate(sessionId, {
        totalQuestionsExtracted: savedQuestionIds.length,
        questionIds: savedQuestionIds.filter(id => !id.startsWith('temp_')).map(id => id),
      });

      sendEvent("page_complete", { pageNum, questionsOnPage: extracted.length, totalSoFar: questionIndex });

      // Save context for next iteration
      previousPageDataUrl = dataUrl;
      previousPageExtraction = extracted;
    }

    // Mark session as completed
    await UploadSession.findByIdAndUpdate(sessionId, {
      status: "completed",
      completedAt: new Date(),
      totalQuestionsExtracted: savedQuestionIds.length,
      questionIds: savedQuestionIds.filter(id => !id.startsWith('temp_')),
    });

    sendEvent("complete", { 
      sessionId,
      totalQuestions: questionIndex,
      savedToDb: savedQuestionIds.filter(id => !id.startsWith('temp_')).length
    });
    res.end();

  } catch (error) {
    console.error("Error in streaming PDF upload:", error);
    
    // Update session status to failed if we have a sessionId
    if (sessionId) {
      await UploadSession.findByIdAndUpdate(sessionId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
    
    sendEvent("error", { message: "Processing failed", details: error instanceof Error ? error.message : "Unknown error" });
    res.end();
  }
};

// Get upload history for the current user
export const getUploadHistory = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { limit = "20", page = "1" } = req.query as { limit?: string; page?: string };
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);

    const [sessions, total] = await Promise.all([
      UploadSession.find({ createdBy: currentUser._id })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select("fileName subject startPage numPages totalQuestionsExtracted status createdAt completedAt"),
      UploadSession.countDocuments({ createdBy: currentUser._id }),
    ]);

    res.status(200).json({
      success: true,
      data: sessions,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching upload history:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get questions from a specific upload session
export const getSessionQuestions = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { sessionId } = req.params;
    
    const session = await UploadSession.findOne({ 
      _id: sessionId, 
      createdBy: currentUser._id 
    }).populate({
      path: "questionIds",
      select: "text options correctIndex image subject chapter difficulty topics tags description sourcePage",
    });

    if (!session) {
      res.status(404).json({ success: false, message: "Session not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        session: {
          id: session._id,
          fileName: session.fileName,
          subject: session.subject,
          startPage: session.startPage,
          numPages: session.numPages,
          status: session.status,
          totalQuestionsExtracted: session.totalQuestionsExtracted,
          createdAt: session.createdAt,
          completedAt: session.completedAt,
        },
        questions: session.questionIds,
      },
    });
  } catch (error) {
    console.error("Error fetching session questions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get status of a specific session (lightweight, for polling)
export const getSessionStatus = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { sessionId } = req.params;
    
    const session = await UploadSession.findOne({ 
      _id: sessionId, 
      createdBy: currentUser._id 
    }).select("fileName subject startPage numPages totalQuestionsExtracted status createdAt completedAt errorMessage");

    if (!session) {
      res.status(404).json({ success: false, message: "Session not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: session._id,
        fileName: session.fileName,
        subject: session.subject,
        startPage: session.startPage,
        numPages: session.numPages,
        totalQuestionsExtracted: session.totalQuestionsExtracted,
        status: session.status,
        errorMessage: session.errorMessage,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching session status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get any active (processing) sessions for the current user
export const getActiveSessions = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const activeSessions = await UploadSession.find({ 
      createdBy: currentUser._id,
      status: "processing"
    })
      .sort({ createdAt: -1 })
      .select("fileName subject startPage numPages totalQuestionsExtracted status createdAt")
      .populate({
        path: "questionIds",
        select: "text options correctIndex image sourcePage",
      });

    res.status(200).json({
      success: true,
      data: activeSessions.map(session => ({
        id: session._id,
        fileName: session.fileName,
        subject: session.subject,
        startPage: session.startPage,
        numPages: session.numPages,
        totalQuestionsExtracted: session.totalQuestionsExtracted,
        status: session.status,
        createdAt: session.createdAt,
        questions: session.questionIds,
      })),
    });
  } catch (error) {
    console.error("Error fetching active sessions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Delete an upload session (and optionally its extracted questions)
export const deleteUploadSession = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { sessionId } = req.params;
    const { deleteQuestions = false } = req.query as { deleteQuestions?: string | boolean };
    const shouldDeleteQuestions = deleteQuestions === "true" || deleteQuestions === true;

    const session = await UploadSession.findOne({
      _id: sessionId,
      createdBy: currentUser._id,
    });

    if (!session) {
      res.status(404).json({ success: false, message: "Upload session not found" });
      return;
    }

    // Optionally delete associated questions
    let deletedQuestionsCount = 0;
    if (shouldDeleteQuestions && session.questionIds && session.questionIds.length > 0) {
      const deleteResult = await Question.deleteMany({ _id: { $in: session.questionIds } });
      deletedQuestionsCount = deleteResult.deletedCount || 0;
    }

    // Delete the session
    await UploadSession.deleteOne({ _id: sessionId });

    res.status(200).json({
      success: true,
      message: `Upload session deleted${shouldDeleteQuestions ? ` along with ${deletedQuestionsCount} questions` : ""}`,
      deletedQuestionsCount,
    });
  } catch (error) {
    console.error("Error deleting upload session:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Mark stuck processing sessions as failed (sessions older than 30 minutes)
export const cleanupStuckSessions = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const result = await UploadSession.updateMany(
      {
        createdBy: currentUser._id,
        status: "processing",
        createdAt: { $lt: thirtyMinutesAgo },
      },
      {
        $set: {
          status: "failed",
          errorMessage: "Session timed out - processing took too long or connection was lost",
        },
      }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} stuck session(s) marked as failed`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error cleaning up stuck sessions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Delete all processing sessions (and optionally their extracted questions)
export const deleteAllProcessingSessions = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { deleteQuestions = false } = req.query as { deleteQuestions?: string | boolean };
    const shouldDeleteQuestions = deleteQuestions === "true" || deleteQuestions === true;

    // Find all processing sessions for this user
    const processingSessions = await UploadSession.find({
      createdBy: currentUser._id,
      status: "processing",
    });

    if (processingSessions.length === 0) {
      res.status(200).json({
        success: true,
        message: "No processing sessions found",
        deletedSessions: 0,
        deletedQuestionsCount: 0,
      });
      return;
    }

    // Collect all question IDs if we need to delete them
    let deletedQuestionsCount = 0;
    if (shouldDeleteQuestions) {
      const allQuestionIds = processingSessions.flatMap(s => s.questionIds || []);
      if (allQuestionIds.length > 0) {
        const deleteResult = await Question.deleteMany({ _id: { $in: allQuestionIds } });
        deletedQuestionsCount = deleteResult.deletedCount || 0;
      }
    }

    // Delete all processing sessions
    const sessionIds = processingSessions.map(s => s._id);
    await UploadSession.deleteMany({ _id: { $in: sessionIds } });

    res.status(200).json({
      success: true,
      message: `Deleted ${processingSessions.length} processing session(s)${shouldDeleteQuestions ? ` along with ${deletedQuestionsCount} questions` : ""}`,
      deletedSessions: processingSessions.length,
      deletedQuestionsCount,
    });
  } catch (error) {
    console.error("Error deleting all processing sessions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const saveQuestionsBatch = async (req: CustomRequest, res: Response) => {
  try {
    const currentUser = req.user;
    if (!currentUser?._id) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const body = (req.body || {}) as {
      subject?: string | null;
      sourceFileUrl?: string | null;
      items?: Array<{
        text?: string;
        options?: string[];
        correctIndex?: number | null;
        image?: string | null;
        chapter?: string | null;
        difficulty?: "easy" | "medium" | "hard" | null;
        topics?: string[];
        tags?: string[];
        description?: string | null;
        sourcePage?: number | null;
      }>;
    };
    const subject = String(body?.subject || "").trim();
    if (!subject) {
      res.status(400).json({ success: false, message: "subject is required" });
      return;
    }
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      res.status(400).json({ success: false, message: "items is required" });
      return;
    }

    // Helpers to normalize and hash
    const normalize = (s: string) =>
      s
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const computeHash = (subjectVal: string, textVal: string, optionVals: string[]) => {
      const base = [
        normalize(subjectVal),
        normalize(textVal),
        ...optionVals.map((o) => normalize(o)),
      ].join("||");
      return createHash("sha256").update(base).digest("hex");
    };

    // Prepare in-memory dedupe and build candidate docs
    const draftDocs: Array<{
      text: string;
      options: string[];
      correctIndex?: number;
      image?: string;
      subject: string;
      chapter?: string;
      difficulty?: string;
      topics: string[];
      tags: string[];
      description?: string;
      sourceFileUrl?: string;
      sourcePage?: number;
      pineconeId?: string;
      createdBy: any;
      contentHash: string;
    }> = [];
    const seenHashes = new Set<string>();

    for (const item of items) {
      const text = String(item?.text || "").trim();
      const options = Array.isArray(item?.options) ? item.options.map((o) => String(o)) : [];
      if (!text || options.length === 0) {
        // skip invalid
        continue;
      }
      const correctIndex =
        typeof item?.correctIndex === "number" && item.correctIndex >= 0 && item.correctIndex < options.length
          ? item.correctIndex
          : undefined;
      const chapter = item?.chapter ? String(item.chapter) : undefined;
      const difficulty = item?.difficulty ? String(item.difficulty) : undefined;
      const topics = Array.isArray(item?.topics) ? item.topics.map((t) => String(t)) : [];
      const tags = Array.isArray(item?.tags) ? item.tags.map((t) => String(t)) : [];
      const description = item?.description ? String(item.description) : undefined;
      const image = item?.image ? String(item.image) : undefined;
      const sourceFileUrl = body?.sourceFileUrl ? String(body.sourceFileUrl) : undefined;
      const sourcePage = typeof item?.sourcePage === "number" ? item.sourcePage : undefined;

      const contentHash = computeHash(subject, text, options);
      if (seenHashes.has(contentHash)) {
        // duplicate within batch; skip
        continue;
      }
      seenHashes.add(contentHash);

      const doc = {
        text,
        options,
        correctIndex,
        image,
        subject,
        chapter,
        difficulty,
        topics,
        tags,
        description,
        sourceFileUrl,
        sourcePage,
        pineconeId: undefined as string | undefined,
        createdBy: currentUser._id,
        contentHash,
      };
      draftDocs.push(doc);
    }

    if (draftDocs.length === 0) {
      res.status(400).json({ success: false, message: "No valid questions to save" });
      return;
    }

    // Check DB for existing by contentHash
    const allHashes = draftDocs.map((d) => d.contentHash);
    const existing = await Question.find({ contentHash: { $in: allHashes } }).select("contentHash");
    const existingSet = new Set(existing.map((e) => String((e as any).contentHash)));
    const toInsert = draftDocs.filter((d) => !existingSet.has(d.contentHash));
    const duplicatesSkipped = draftDocs.length - toInsert.length;

    if (toInsert.length === 0) {
      res.status(200).json({
        success: true,
        data: [],
        meta: { inserted: 0, duplicatesSkipped },
      });
      return;
    }

    // Prepare vectors for new docs only
    const vectors: { id: string; values: number[]; metadata?: Record<string, string | number | boolean | string[]> }[] = [];

    // Create embeddings in sequence (can parallelize if rate limits allow)
    for (const doc of toInsert) {
      const embedTextParts = [
        doc.subject,
        doc.chapter || "",
        doc.text,
        ...(doc.options || []).map((o: string, i: number) => `(${i + 1}) ${o}`),
        doc.description || "",
        (doc.topics || []).join(", "),
        (doc.tags || []).join(", "),
        doc.difficulty || "",
      ].filter(Boolean);
      const embedInput = embedTextParts.join("\n");
      const values = await getEmbeddingForText(embedInput);
      const vecId = uuidv4();
      doc.pineconeId = vecId;
      // Build Pinecone metadata without nulls; only allowed types: string, number, boolean, string[]
      const metadata: Record<string, string | number | boolean | string[]> = {
        subject: doc.subject,
        hasImage: Boolean(doc.image),
      };
      if (doc.chapter) metadata.chapter = doc.chapter;
      if (doc.difficulty) metadata.difficulty = doc.difficulty;
      if (doc.topics && doc.topics.length > 0) metadata.topics = doc.topics;
      if (doc.tags && doc.tags.length > 0) metadata.tags = doc.tags;
      if (doc.sourceFileUrl) metadata.sourceFileUrl = doc.sourceFileUrl;
      vectors.push({
        id: vecId,
        values,
        metadata,
      });
    }

    // Upsert vectors then save docs
    await upsertVectorsToPinecone(vectors);
    const created = await Question.insertMany(toInsert);

    res.status(200).json({
      success: true,
      data: created.map((q) => ({
        id: q._id,
        pineconeId: q.pineconeId,
      })),
      meta: { inserted: created.length, duplicatesSkipped },
    });
  } catch (error) {
    console.error("Error saving questions batch:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const generateQuestionPaper = async (req: CustomRequest, res: Response) => {
  try {
    const body = (req.body || {}) as {
      subject?: string;
      chapter?: string | null;
      overallDifficulty?: "easy" | "medium" | "hard" | null;
      easyCount?: number | string | null;
      mediumCount?: number | string | null;
      hardCount?: number | string | null;
      tags?: string[];
      topics?: string[];
      description?: string | null;
    };
    const subject = String(body?.subject || "").trim();
    if (!subject) {
      res.status(400).json({ success: false, message: "subject is required" });
      return;
    }
    const chapter = body?.chapter ? String(body.chapter).trim() : null;
    const overallDifficulty = body?.overallDifficulty ? String(body.overallDifficulty).toLowerCase() as any : null;
    const tags = Array.isArray(body?.tags) ? body.tags.map((t) => String(t)) : [];
    const topics = Array.isArray(body?.topics) ? body.topics.map((t) => String(t)) : [];
    const description = body?.description ? String(body.description) : "";
    const easyCount = Math.max(parseInt(String(body?.easyCount ?? "0"), 10) || 0, 0);
    const mediumCount = Math.max(parseInt(String(body?.mediumCount ?? "0"), 10) || 0, 0);
    const hardCount = Math.max(parseInt(String(body?.hardCount ?? "0"), 10) || 0, 0);
    const targetCounts: Record<"easy" | "medium" | "hard", number> = {
      easy: easyCount,
      medium: mediumCount,
      hard: hardCount,
    };
    const totalRequested = easyCount + mediumCount + hardCount;
    if (totalRequested <= 0) {
      res.status(400).json({ success: false, message: "At least one of easy/medium/hard counts must be > 0" });
      return;
    }

    // Build the generation schedule
    const difficultiesOrder: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];
    const schedule: Array<"easy" | "medium" | "hard"> = [];
    for (const d of difficultiesOrder) {
      for (let i = 0; i < targetCounts[d]; i++) schedule.push(d);
    }

    type GeneratedItem = {
      text: string;
      options: string[];
      correctIndex: number;
      subject: string;
      chapter?: string | null;
      topics?: string[];
      tags?: string[];
      difficulty: "easy" | "medium" | "hard";
      source: {
        curatedPineconeIds: string[];
      };
    };

    const normalize = (s: string) =>
      String(s || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const computeHash = (subjectVal: string, textVal: string, optionVals: string[]) => {
      const base = [
        normalize(subjectVal),
        normalize(textVal),
        ...optionVals.map((o) => normalize(o)),
      ].join("||");
      return createHash("sha256").update(base).digest("hex");
    };

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      res.status(500).json({ success: false, message: "OPENROUTER_API_KEY not configured" });
      return;
    }
    const headers = {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
      "X-Title": process.env.OPENROUTER_APP_NAME || "ReportCardApp",
    };
    const modelCandidates = [
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o-mini",
      "google/gemini-2.0-flash",
    ];

    const generated: GeneratedItem[] = [];
    const seenContentHashes = new Set<string>();
    const seenTexts = new Set<string>();

    // ============================================================
    // PRE-FETCH: Retrieve all questions upfront for each difficulty
    // ============================================================
    const curatedByDifficulty: Record<"easy" | "medium" | "hard", any[]> = {
      easy: [],
      medium: [],
      hard: [],
    };

    for (const diff of difficultiesOrder) {
      if (targetCounts[diff] <= 0) continue;

      // Retrieval query embedding
      const retrievalParts = [
        `Subject: ${subject}`,
        chapter ? `Chapter: ${chapter}` : "",
        `Difficulty: ${diff}`,
        topics.length ? `Topics: ${topics.join(", ")}` : "",
        tags.length ? `Tags: ${tags.join(", ")}` : "",
        "Type: multiple-choice question",
      ].filter(Boolean);
      const retrievalQuery = retrievalParts.join("\n");
      const queryVec = await getEmbeddingForText(retrievalQuery);

      // Use simple metadata filters on Pinecone
      const pineconeFilter: Record<string, unknown> = { subject };
      if (chapter) pineconeFilter.chapter = chapter;
      pineconeFilter.difficulty = diff;

      const matches = await querySimilarInPinecone({
        values: queryVec,
        topK: 300,
        filter: pineconeFilter,
        includeMetadata: true,
      });
      const ids = matches.map((m) => m.id).filter(Boolean);
      const candidateDocs = ids.length
        ? await Question.find({ pineconeId: { $in: ids } })
            .select("text options correctIndex subject chapter topics tags difficulty pineconeId")
            .lean()
        : [];
      const idToDoc = new Map<string, any>();
      for (const doc of candidateDocs) {
        idToDoc.set(String(doc.pineconeId), doc);
      }
      // Maintain score order from matches
      curatedByDifficulty[diff] = matches
        .map((m) => idToDoc.get(m.id))
        .filter((d) => d && d.text && Array.isArray(d.options) && d.options.length > 0);
    }

    // Track which curated questions have been used for inspiration
    const usedCuratedIndices: Record<"easy" | "medium" | "hard", number> = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    for (const difficulty of schedule) {
      // Get the next batch of curated questions for this difficulty
      const allCurated = curatedByDifficulty[difficulty];
      const startIdx = usedCuratedIndices[difficulty];
      const curated = allCurated.slice(startIdx, startIdx + 6);
      usedCuratedIndices[difficulty] = startIdx + 6;

      const avoidTexts = generated.map((g) => g.text);
      const curatedForPrompt = curated.map((d: any, i: number) => ({
        idx: i + 1,
        text: d.text,
        options: d.options,
        correctIndex: typeof d.correctIndex === "number" ? d.correctIndex : undefined,
        chapter: d.chapter || null,
        topics: d.topics || [],
        tags: d.tags || [],
        difficulty: d.difficulty || difficulty,
      }));

      const systemPrompt =
        "You are an expert exam question setter for Indian competitive exams. " +
        "Generate ONE high-quality, original, non-repetitive multiple-choice question (MCQ). " +
        "Strictly respond with a single JSON object only; no prose.";

      const userPrompt =
        [
          `Constraints:`,
          `- Subject: ${subject}`,
          chapter ? `- Chapter: ${chapter}` : `- Chapter: (any within subject)`,
          `- Difficulty: ${difficulty}${overallDifficulty ? ` (overall target: ${overallDifficulty})` : ""}`,
          tags.length ? `- Tags (prefer/include when natural): ${tags.join(", ")}` : "",
          topics.length ? `- Topics focus (optional): ${topics.join(", ")}` : "",
          description ? `- Notes: ${description}` : "",
          "",
          "Use these retrieved examples only as inspiration (do not copy):",
          JSON.stringify(curatedForPrompt, null, 2),
          "",
          avoidTexts.length
            ? `Avoid repeating or paraphrasing any of these generated questions:\n${avoidTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
            : "No previously generated questions.",
          "",
          "Output JSON schema (strict):",
          JSON.stringify(
            {
              text: "string",
              options: ["string", "string", "string", "string"],
              correctIndex: 0,
              chapter: "string | null",
              topics: ["string"],
              tags: ["string"],
              difficulty: "easy | medium | hard",
            },
            null,
            2
          ),
          "",
          "Rules:",
          "- options must be 4–5 concise choices; set correctIndex to the correct option (0-based).",
          "- Ensure originality vs examples and avoids; vary context and phrasing.",
          "- Prefer the given chapter/topics when they make sense; otherwise choose appropriate ones.",
        ].filter(Boolean).join("\n");

      let content = "";
      let lastError: any = null;
      for (const model of modelCandidates) {
        const payload = {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 800,
        };
        try {
          const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, { headers });
          content = String(resp?.data?.choices?.[0]?.message?.content ?? "").trim();
          if (content) break;
        } catch (err) {
          lastError = err;
          continue;
        }
      }
      if (!content) {
        try {
          const status = lastError?.response?.status;
          const data = lastError?.response?.data;
          console.error("OpenRouter paper generation failed for all models:", status, data || lastError);
        } catch {
          console.error("OpenRouter paper generation failed for all models:", lastError);
        }
        res.status(502).json({ success: false, message: "Upstream AI service failed" });
        return;
      }

      // Parse JSON
      let parsed: any = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        try {
          parsed = JSON.parse(extractJsonObject(content));
        } catch (e) {
          parsed = {};
        }
      }

      // Minimal validation and up to 2 retries for invalid/bad duplicates
      let attempts = 0;
      let accepted: GeneratedItem | null = null;
      while (attempts < 2) {
        attempts++;
        const text = String(parsed?.text || "").trim();
        const options: string[] = Array.isArray(parsed?.options)
          ? parsed.options.map((o: any) => String(o)).filter((s: string) => s.length > 0)
          : [];
        const ciRaw = parsed?.correctIndex;
        const correctIndex =
          typeof ciRaw === "number" && ciRaw >= 0 && ciRaw < options.length ? ciRaw : -1;
        const outChapter =
          parsed?.chapter === null || parsed?.chapter === undefined || String(parsed?.chapter).trim() === ""
            ? null
            : String(parsed.chapter);
        const outTopics: string[] = Array.isArray(parsed?.topics)
          ? parsed.topics.map((t: any) => String(t)).filter((s: string) => s.length > 0)
          : [];
        const outTags: string[] = Array.isArray(parsed?.tags)
          ? parsed.tags.map((t: any) => String(t)).filter((s: string) => s.length > 0)
          : [];
        const outDiffRaw = String(parsed?.difficulty || "").toLowerCase();
        const outDifficulty: "easy" | "medium" | "hard" =
          outDiffRaw === "easy" || outDiffRaw === "hard" ? (outDiffRaw as any) : "medium";

        const basicValid = text && options.length >= 4 && correctIndex >= 0;
        const contentHash = basicValid ? computeHash(subject, text, options) : "";
        const duplicate =
          basicValid &&
          (seenContentHashes.has(contentHash) || seenTexts.has(normalize(text)));

        if (basicValid && !duplicate) {
          accepted = {
            text,
            options,
            correctIndex,
            subject,
            chapter: outChapter,
            topics: outTopics,
            tags: outTags,
            difficulty: outDifficulty,
            source: { curatedPineconeIds: curated.map((c: any) => String(c.pineconeId || "")) },
          };
          seenContentHashes.add(contentHash);
          seenTexts.add(normalize(text));
          break;
        }

        // Retry with stricter avoid list
        const retryUserPrompt =
          userPrompt +
          "\n\nThe previous output was invalid or too similar to earlier questions. Regenerate strictly adhering to schema and originality.";
        let retryContent = "";
        for (const model of modelCandidates) {
          const retryPayload = {
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: retryUserPrompt },
            ],
            temperature: 0.6,
            max_tokens: 800,
          };
          try {
            const retryResp = await axios.post("https://openrouter.ai/api/v1/chat/completions", retryPayload, { headers });
            retryContent = String(retryResp?.data?.choices?.[0]?.message?.content ?? "").trim();
            if (retryContent) break;
          } catch {
            continue;
          }
        }
        try {
          parsed = JSON.parse(retryContent);
        } catch {
          try {
            parsed = JSON.parse(extractJsonObject(retryContent));
          } catch {
            parsed = {};
          }
        }
      }

      if (accepted) {
        generated.push(accepted);
      }
      // If not accepted after retries, skip to next in schedule
    }

    res.status(200).json({
      success: true,
      data: generated,
      meta: {
        requested: { easy: easyCount, medium: mediumCount, hard: hardCount, total: totalRequested },
        generated: { total: generated.length },
      },
    });
  } catch (error) {
    console.error("Error generating question paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

function extractJsonArray(text: string): string {
  // Try direct parse
  try {
    JSON.parse(text);
    return text;
  } catch {}
  // Try to locate a JSON code block
  const blockMatch = text.match(/```json([\s\S]*?)```/i);
  if (blockMatch) {
    return (blockMatch[1] ?? "[]").trim();
  }
  // Fallback: grab the first [...] block
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return "[]";
}

function extractJsonObject(text: string): string {
  // Try direct parse
  try {
    JSON.parse(text);
    return text;
  } catch {}
  // Try JSON code block
  const blockMatch = text.match(/```json([\s\S]*?)```/i);
  if (blockMatch) {
    return (blockMatch[1] ?? "{}").trim();
  }
  // Fallback: grab the first {...} block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return "{}";
}

/**
 * generateQuestionPaperv1_5 - Enhanced question paper generation with:
 * 1. Permutation-based retrieval using combinations of topics, tags, and difficulty
 * 2. Each iteration retrieves ~50 questions with different filter combinations
 * 3. Diverse inspiration contexts for better question variety
 * 4. Lightweight evaluation without LLM-powered keyword generation
 */
export const generateQuestionPaperv1_5 = async (req: CustomRequest, res: Response) => {
  try {
    const body = (req.body || {}) as {
      subject?: string;
      chapter?: string | null;
      overallDifficulty?: "easy" | "medium" | "hard" | null;
      easyCount?: number | string | null;
      mediumCount?: number | string | null;
      hardCount?: number | string | null;
      tags?: string[];
      topics?: string[];
      description?: string | null;
      maxIterations?: number | string | null;
    };

    const subject = String(body?.subject || "").trim();
    if (!subject) {
      res.status(400).json({ success: false, message: "subject is required" });
      return;
    }

    const chapter = body?.chapter ? String(body.chapter).trim() : null;
    const overallDifficulty = body?.overallDifficulty ? String(body.overallDifficulty).toLowerCase() as any : null;
    const inputTags = Array.isArray(body?.tags) ? body.tags.map((t) => String(t)).filter(Boolean) : [];
    const inputTopics = Array.isArray(body?.topics) ? body.topics.map((t) => String(t)).filter(Boolean) : [];
    const description = body?.description ? String(body.description) : "";
    const easyCount = Math.max(parseInt(String(body?.easyCount ?? "0"), 10) || 0, 0);
    const mediumCount = Math.max(parseInt(String(body?.mediumCount ?? "0"), 10) || 0, 0);
    const hardCount = Math.max(parseInt(String(body?.hardCount ?? "0"), 10) || 0, 0);
    const maxIterations = Math.min(Math.max(parseInt(String(body?.maxIterations ?? "3"), 10) || 3, 1), 10);

    const targetCounts: Record<"easy" | "medium" | "hard", number> = {
      easy: easyCount,
      medium: mediumCount,
      hard: hardCount,
    };
    const totalRequested = easyCount + mediumCount + hardCount;
    if (totalRequested <= 0) {
      res.status(400).json({ success: false, message: "At least one of easy/medium/hard counts must be > 0" });
      return;
    }

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      res.status(500).json({ success: false, message: "OPENROUTER_API_KEY not configured" });
      return;
    }

    const headers = {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
      "X-Title": process.env.OPENROUTER_APP_NAME || "ReportCardApp",
    };

    const modelCandidates = [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-2.0-flash",
    ];

    const normalize = (s: string) =>
      String(s || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const computeHash = (subjectVal: string, textVal: string, optionVals: string[]) => {
      const base = [
        normalize(subjectVal),
        normalize(textVal),
        ...optionVals.map((o) => normalize(o)),
      ].join("||");
      return createHash("sha256").update(base).digest("hex");
    };

    // Helper to call LLM with retry across models
    const callLLM = async (systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> => {
      for (const model of modelCandidates) {
        const payload = {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: 1500,
        };
        try {
          const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, { headers });
          const content = String(resp?.data?.choices?.[0]?.message?.content ?? "").trim();
          if (content) return content;
        } catch (err) {
          continue;
        }
      }
      return "";
    };

    type GeneratedItem = {
      text: string;
      options: string[];
      correctIndex: number;
      subject: string;
      chapter?: string | null;
      topics?: string[];
      tags?: string[];
      difficulty: "easy" | "medium" | "hard";
      source: {
        permutation: string;
        curatedPineconeIds: string[];
      };
    };

    // Build the generation schedule
    const difficultiesOrder: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];
    const schedule: Array<{ difficulty: "easy" | "medium" | "hard"; index: number }> = [];
    for (const d of difficultiesOrder) {
      for (let i = 0; i < targetCounts[d]; i++) {
        schedule.push({ difficulty: d, index: schedule.length });
      }
    }

    let generated: GeneratedItem[] = [];
    const seenContentHashes = new Set<string>();
    const seenTexts = new Set<string>();
    const usedPineconeIds = new Set<string>();

    // ============================================================
    // PHASE 1: Discover available topics and tags from existing DB
    // ============================================================
    const baseFilter: Record<string, unknown> = { subject };
    if (chapter) baseFilter.chapter = chapter;

    // Query to discover available topics and tags in the database
    const sampleDocs = await Question.find(baseFilter)
      .select("topics tags difficulty")
      .limit(500)
      .lean();

    const discoveredTopics = new Set<string>();
    const discoveredTags = new Set<string>();
    const availableDifficulties = new Set<string>();

    for (const doc of sampleDocs) {
      if (Array.isArray((doc as any).topics)) {
        (doc as any).topics.forEach((t: string) => discoveredTopics.add(t));
      }
      if (Array.isArray((doc as any).tags)) {
        (doc as any).tags.forEach((t: string) => discoveredTags.add(t));
      }
      if ((doc as any).difficulty) {
        availableDifficulties.add((doc as any).difficulty);
      }
    }

    // Combine input topics/tags with discovered ones
    const allTopics = [...new Set([...inputTopics, ...discoveredTopics])];
    const allTags = [...new Set([...inputTags, ...discoveredTags])];

    // ============================================================
    // PHASE 2: Generate permutation combinations
    // ============================================================
    type FilterPermutation = {
      id: string;
      topics: string[];
      tags: string[];
      difficulty: "easy" | "medium" | "hard";
      description: string;
    };

    const generatePermutations = (): FilterPermutation[] => {
      const permutations: FilterPermutation[] = [];
      const difficulties: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];

      // Create permutations for each difficulty with different topic/tag combinations
      for (const diff of difficulties) {
        if (targetCounts[diff] <= 0) continue;

        // Permutation 1: No specific topic/tag filter (broadest)
        permutations.push({
          id: `${diff}-broad`,
          topics: [],
          tags: [],
          difficulty: diff,
          description: `${diff} questions - broad search`,
        });

        // Permutation 2-N: Specific topic combinations
        for (let i = 0; i < allTopics.length; i++) {
          const topic = allTopics[i];
          if (topic) {
            permutations.push({
              id: `${diff}-topic-${i}`,
              topics: [topic],
              tags: [],
              difficulty: diff,
              description: `${diff} questions - topic: ${topic}`,
            });
          }
        }

        // Permutation N+1 to M: Specific tag combinations
        for (let i = 0; i < allTags.length; i++) {
          const tag = allTags[i];
          if (tag) {
            permutations.push({
              id: `${diff}-tag-${i}`,
              topics: [],
              tags: [tag],
              difficulty: diff,
              description: `${diff} questions - tag: ${tag}`,
            });
          }
        }

        // Permutation M+1 to P: Combined topic + tag combinations (subset)
        const maxCombined = Math.min(allTopics.length, 5);
        const maxTagsCombined = Math.min(allTags.length, 3);
        for (let i = 0; i < maxCombined; i++) {
          for (let j = 0; j < maxTagsCombined; j++) {
            const topic = allTopics[i];
            const tag = allTags[j];
            if (topic && tag) {
              permutations.push({
                id: `${diff}-combined-${i}-${j}`,
                topics: [topic],
                tags: [tag],
                difficulty: diff,
                description: `${diff} questions - topic: ${topic}, tag: ${tag}`,
              });
            }
          }
        }

        // Permutation: Multiple topics together
        if (allTopics.length >= 2) {
          for (let i = 0; i < Math.min(allTopics.length - 1, 3); i++) {
            const topic1 = allTopics[i];
            const topic2 = allTopics[i + 1];
            if (topic1 && topic2) {
              permutations.push({
                id: `${diff}-multi-topic-${i}`,
                topics: [topic1, topic2],
                tags: [],
                difficulty: diff,
                description: `${diff} questions - topics: ${topic1}, ${topic2}`,
              });
            }
          }
        }
      }

      // Shuffle to ensure variety in iteration order
      for (let i = permutations.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [permutations[i], permutations[j]] = [permutations[j]!, permutations[i]!];
      }

      return permutations;
    };

    const allPermutations = generatePermutations();
    console.log(`[generateQuestionPaperv1_5] Generated ${allPermutations.length} permutations from ${allTopics.length} topics and ${allTags.length} tags`);

    // ============================================================
    // PHASE 3: Retrieval cache for permutation results
    // ============================================================
    type RetrievalResult = {
      permutation: FilterPermutation;
      matches: Array<{ id: string; score: number; doc: any }>;
    };

    const retrievalCache: Map<string, RetrievalResult> = new Map();

    const retrieveForPermutation = async (perm: FilterPermutation): Promise<RetrievalResult> => {
      if (retrievalCache.has(perm.id)) {
        return retrievalCache.get(perm.id)!;
      }

      // Build embedding query incorporating the permutation context
      const embeddingParts = [
        `Subject: ${subject}`,
        chapter ? `Chapter: ${chapter}` : "",
        `Difficulty: ${perm.difficulty}`,
        perm.topics.length ? `Topics: ${perm.topics.join(", ")}` : "",
        perm.tags.length ? `Tags: ${perm.tags.join(", ")}` : "",
        "Type: multiple-choice question for competitive exam",
        description ? `Context: ${description}` : "",
      ].filter(Boolean);

      const embedding = await getEmbeddingForText(embeddingParts.join("\n"));

      // Build Pinecone filter with the permutation's constraints
      const pineconeFilter: Record<string, unknown> = { subject };
      if (chapter) pineconeFilter.chapter = chapter;
      pineconeFilter.difficulty = perm.difficulty;

      // Add topic filter if specified (using $in for array field)
      if (perm.topics.length === 1) {
        pineconeFilter.topics = { $in: perm.topics };
      } else if (perm.topics.length > 1) {
        // For multiple topics, we want questions that have ANY of these topics
        pineconeFilter.topics = { $in: perm.topics };
      }

      // Add tag filter if specified
      if (perm.tags.length === 1) {
        pineconeFilter.tags = { $in: perm.tags };
      } else if (perm.tags.length > 1) {
        pineconeFilter.tags = { $in: perm.tags };
      }

      // Retrieve up to 50 questions for this permutation
      const matches = await querySimilarInPinecone({
        values: embedding,
        topK: 50,
        filter: pineconeFilter,
        includeMetadata: true,
      });

      // Fetch full documents from MongoDB
      const ids = matches.map((m) => m.id).filter(Boolean);
      const docs = ids.length
        ? await Question.find({ pineconeId: { $in: ids } })
            .select("text options correctIndex subject chapter topics tags difficulty pineconeId")
            .lean()
        : [];

      const idToDoc = new Map<string, any>();
      for (const doc of docs) {
        idToDoc.set(String((doc as any).pineconeId), doc);
      }

      const enrichedMatches = matches
        .map((m) => ({
          id: m.id,
          score: m.score,
          doc: idToDoc.get(m.id),
        }))
        .filter((m) => m.doc && m.doc.text && Array.isArray(m.doc.options) && m.doc.options.length > 0);

      const result: RetrievalResult = { permutation: perm, matches: enrichedMatches };
      retrievalCache.set(perm.id, result);

      console.log(`[generateQuestionPaperv1_5] Permutation "${perm.id}" retrieved ${enrichedMatches.length} questions`);
      return result;
    };

    // ============================================================
    // PHASE 4: Generate question with permutation context
    // ============================================================
    const generateQuestion = async (
      difficulty: "easy" | "medium" | "hard",
      permutation: FilterPermutation,
      inspirations: Array<{ id: string; score: number; doc: any }>,
      avoidTexts: string[]
    ): Promise<GeneratedItem | null> => {
      // Filter out already used inspirations and take top 8
      const freshInspirations = inspirations
        .filter((insp) => !usedPineconeIds.has(String(insp.doc?.pineconeId || "")))
        .slice(0, 8);

      if (freshInspirations.length === 0) {
        // Fallback: use all inspirations even if some were used
        freshInspirations.push(...inspirations.slice(0, 6));
      }

      const curatedForPrompt = freshInspirations.map((insp: any, i: number) => ({
        idx: i + 1,
        text: insp.doc.text,
        options: insp.doc.options,
        correctIndex: typeof insp.doc.correctIndex === "number" ? insp.doc.correctIndex : undefined,
        chapter: insp.doc.chapter || null,
        topics: insp.doc.topics || [],
        tags: insp.doc.tags || [],
        difficulty: insp.doc.difficulty || difficulty,
        relevanceScore: insp.score?.toFixed(3),
      }));

      const systemPrompt =
        "You are an expert exam question setter for Indian competitive exams (JEE, NEET, Boards, etc.). " +
        "Generate ONE high-quality, original, exam-worthy multiple-choice question (MCQ). " +
        "The question must be unique, well-crafted, and appropriate for the specified difficulty. " +
        "Strictly respond with a single JSON object only; no prose.";

      const contextDescription = [
        permutation.topics.length ? `Topics focus: ${permutation.topics.join(", ")}` : "",
        permutation.tags.length ? `Tags context: ${permutation.tags.join(", ")}` : "",
      ].filter(Boolean).join("; ");

      const userPrompt = [
        `=== Question Generation Context ===`,
        `Permutation: ${permutation.description}`,
        contextDescription ? `Additional context: ${contextDescription}` : "",
        ``,
        `Constraints:`,
        `- Subject: ${subject}`,
        chapter ? `- Chapter: ${chapter}` : `- Chapter: (any within subject)`,
        `- Difficulty: ${difficulty}${overallDifficulty ? ` (paper overall: ${overallDifficulty})` : ""}`,
        inputTags.length ? `- Preferred tags: ${inputTags.join(", ")}` : "",
        inputTopics.length ? `- Preferred topics: ${inputTopics.join(", ")}` : "",
        description ? `- Paper notes: ${description}` : "",
        "",
        "=== Retrieved Inspiration Questions (DO NOT COPY - use only as style/concept reference) ===",
        JSON.stringify(curatedForPrompt, null, 2),
        "",
        avoidTexts.length > 0
          ? `=== Already Generated Questions (AVOID similar content) ===\n${avoidTexts.slice(-15).map((t, i) => `${i + 1}. ${t.slice(0, 120)}...`).join("\n")}`
          : "",
        "",
        "=== Output JSON Schema ===",
        JSON.stringify({
          text: "string (question stem)",
          options: ["4-5 options as strings"],
          correctIndex: "0-based index of correct option",
          chapter: "string | null",
          topics: ["relevant topic strings"],
          tags: ["relevant tag strings"],
          difficulty: "easy | medium | hard",
        }, null, 2),
        "",
        "=== Generation Rules ===",
        "1. Create a NOVEL question inspired by the retrieved examples, not a copy",
        "2. Ensure the question tests genuine understanding, not just memorization",
        "3. Options must have exactly one correct answer with plausible distractors",
        "4. Difficulty: easy=direct application, medium=multi-step reasoning, hard=complex problem solving",
        "5. Strictly avoid any overlap with the 'Already Generated Questions' list",
        "6. If inspiration questions focus on specific concepts, explore related but different angles",
      ].filter(Boolean).join("\n");

      const content = await callLLM(systemPrompt, userPrompt, 0.75);
      if (!content) return null;

      let parsed: any = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        try {
          parsed = JSON.parse(extractJsonObject(content));
        } catch {
          return null;
        }
      }

      const text = String(parsed?.text || "").trim();
      const options: string[] = Array.isArray(parsed?.options)
        ? parsed.options.map((o: any) => String(o)).filter((s: string) => s.length > 0)
        : [];
      const ciRaw = parsed?.correctIndex;
      const correctIndex = typeof ciRaw === "number" && ciRaw >= 0 && ciRaw < options.length ? ciRaw : -1;

      if (!text || options.length < 4 || correctIndex < 0) {
        return null;
      }

      const contentHash = computeHash(subject, text, options);
      if (seenContentHashes.has(contentHash) || seenTexts.has(normalize(text))) {
        return null;
      }

      const outChapter = parsed?.chapter === null || parsed?.chapter === undefined || String(parsed?.chapter).trim() === ""
        ? null
        : String(parsed.chapter);
      const outTopics: string[] = Array.isArray(parsed?.topics)
        ? parsed.topics.map((t: any) => String(t)).filter((s: string) => s.length > 0)
        : [];
      const outTags: string[] = Array.isArray(parsed?.tags)
        ? parsed.tags.map((t: any) => String(t)).filter((s: string) => s.length > 0)
        : [];
      const outDiffRaw = String(parsed?.difficulty || "").toLowerCase();
      const outDifficulty: "easy" | "medium" | "hard" =
        outDiffRaw === "easy" || outDiffRaw === "hard" ? (outDiffRaw as any) : "medium";

      // Mark inspirations as used
      freshInspirations.forEach((insp) => {
        if (insp.doc?.pineconeId) usedPineconeIds.add(String(insp.doc.pineconeId));
      });

      seenContentHashes.add(contentHash);
      seenTexts.add(normalize(text));

      return {
        text,
        options,
        correctIndex,
        subject,
        chapter: outChapter,
        topics: outTopics,
        tags: outTags,
        difficulty: outDifficulty,
        source: {
          permutation: permutation.id,
          curatedPineconeIds: freshInspirations.map((insp) => String(insp.doc?.pineconeId || "")),
        },
      };
    };

    // ============================================================
    // MAIN ITERATION LOOP
    // ============================================================
    let iteration = 0;
    let permutationIndex = 0;
    const usedPermutationIds = new Set<string>();

    while (iteration < maxIterations && generated.length < totalRequested) {
      iteration++;
      console.log(`[generateQuestionPaperv1_5] Iteration ${iteration}/${maxIterations}, generated: ${generated.length}/${totalRequested}`);

      // Calculate how many more questions we need per difficulty
      const remainingCounts: Record<"easy" | "medium" | "hard", number> = {
        easy: Math.max(0, targetCounts.easy - generated.filter((g) => g.difficulty === "easy").length),
        medium: Math.max(0, targetCounts.medium - generated.filter((g) => g.difficulty === "medium").length),
        hard: Math.max(0, targetCounts.hard - generated.filter((g) => g.difficulty === "hard").length),
      };

      // For this iteration, process multiple permutations (one per remaining question slot)
      const questionsThisIteration = Math.min(
        totalRequested - generated.length,
        Math.max(5, Math.ceil((totalRequested - generated.length) / (maxIterations - iteration + 1)))
      );

      for (let q = 0; q < questionsThisIteration && generated.length < totalRequested; q++) {
        // Determine which difficulty we need
        let targetDiff: "easy" | "medium" | "hard" | null = null;
        for (const diff of difficultiesOrder) {
          if (remainingCounts[diff] > 0) {
            targetDiff = diff;
            break;
          }
        }
        if (!targetDiff) break;

        // Find a permutation for this difficulty that hasn't been fully used
        let selectedPermutation: FilterPermutation | null = null;
        const diffPermutations = allPermutations.filter((p) => p.difficulty === targetDiff);

        // Try to find unused permutation first
        for (const perm of diffPermutations) {
          if (!usedPermutationIds.has(perm.id)) {
            selectedPermutation = perm;
            usedPermutationIds.add(perm.id);
            break;
          }
        }

        // If all permutations used, cycle through them again
        if (!selectedPermutation && diffPermutations.length > 0) {
          const idx = permutationIndex % diffPermutations.length;
          selectedPermutation = diffPermutations[idx] ?? null;
          permutationIndex++;
        }

        if (!selectedPermutation) {
          // Fallback: use broad search
          selectedPermutation = {
            id: `${targetDiff}-fallback-${iteration}-${q}`,
            topics: inputTopics.slice(0, 2),
            tags: inputTags.slice(0, 2),
            difficulty: targetDiff,
            description: `${targetDiff} fallback search`,
          };
        }

        // Retrieve questions for this permutation
        const retrieval = await retrieveForPermutation(selectedPermutation);
        const avoidTexts = generated.map((g) => g.text);

        // Generate question with up to 3 retries
        let question: GeneratedItem | null = null;
        for (let attempt = 0; attempt < 3 && !question; attempt++) {
          question = await generateQuestion(
            targetDiff,
            selectedPermutation,
            retrieval.matches,
            avoidTexts
          );
        }

        if (question) {
          generated.push(question);
          remainingCounts[targetDiff]--;
          console.log(`[generateQuestionPaperv1_5] Generated question ${generated.length}/${totalRequested} (${targetDiff}) using permutation: ${selectedPermutation.id}`);
        }
      }
    }

    // Build summary stats
    const permutationsUsed = [...new Set(generated.map((g) => g.source.permutation))];

    res.status(200).json({
      success: true,
      data: generated,
      meta: {
        requested: { easy: easyCount, medium: mediumCount, hard: hardCount, total: totalRequested },
        generated: {
          total: generated.length,
          byDifficulty: {
            easy: generated.filter((g) => g.difficulty === "easy").length,
            medium: generated.filter((g) => g.difficulty === "medium").length,
            hard: generated.filter((g) => g.difficulty === "hard").length,
          },
        },
        iterations: iteration,
        permutationsAvailable: allPermutations.length,
        permutationsUsed: permutationsUsed.length,
        topicsDiscovered: allTopics.length,
        tagsDiscovered: allTags.length,
      },
    });
  } catch (error) {
    console.error("Error generating question paper v1.5:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * generateQuestionPaperv2 - Advanced question paper generation with:
 * 1. LLM-powered keyword generation for diverse vector search
 * 2. Multi-keyword retrieval with high top-k for better coverage
 * 3. Per-question LLM generation with unique contexts
 * 4. Holistic paper evaluation with feedback loop
 * 5. Iterative refinement for diversity and quality
 */
export const generateQuestionPaperv2 = async (req: CustomRequest, res: Response) => {
  try {
    const body = (req.body || {}) as {
      subject?: string;
      chapter?: string | null;
      overallDifficulty?: "easy" | "medium" | "hard" | null;
      easyCount?: number | string | null;
      mediumCount?: number | string | null;
      hardCount?: number | string | null;
      tags?: string[];
      topics?: string[];
      description?: string | null;
      maxIterations?: number | string | null;
    };

    const subject = String(body?.subject || "").trim();
    if (!subject) {
      res.status(400).json({ success: false, message: "subject is required" });
      return;
    }

    const chapter = body?.chapter ? String(body.chapter).trim() : null;
    const overallDifficulty = body?.overallDifficulty ? String(body.overallDifficulty).toLowerCase() as any : null;
    const tags = Array.isArray(body?.tags) ? body.tags.map((t) => String(t)) : [];
    const topics = Array.isArray(body?.topics) ? body.topics.map((t) => String(t)) : [];
    const description = body?.description ? String(body.description) : "";
    const easyCount = Math.max(parseInt(String(body?.easyCount ?? "0"), 10) || 0, 0);
    const mediumCount = Math.max(parseInt(String(body?.mediumCount ?? "0"), 10) || 0, 0);
    const hardCount = Math.max(parseInt(String(body?.hardCount ?? "0"), 10) || 0, 0);
    const maxIterations = Math.min(Math.max(parseInt(String(body?.maxIterations ?? "2"), 10) || 2, 1), 5);

    const targetCounts: Record<"easy" | "medium" | "hard", number> = {
      easy: easyCount,
      medium: mediumCount,
      hard: hardCount,
    };
    const totalRequested = easyCount + mediumCount + hardCount;
    if (totalRequested <= 0) {
      res.status(400).json({ success: false, message: "At least one of easy/medium/hard counts must be > 0" });
      return;
    }

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      res.status(500).json({ success: false, message: "OPENROUTER_API_KEY not configured" });
      return;
    }

    const headers = {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
      "X-Title": process.env.OPENROUTER_APP_NAME || "ReportCardApp",
    };

    const modelCandidates = [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-2.0-flash",
    ];

    const normalize = (s: string) =>
      String(s || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const computeHash = (subjectVal: string, textVal: string, optionVals: string[]) => {
      const base = [
        normalize(subjectVal),
        normalize(textVal),
        ...optionVals.map((o) => normalize(o)),
      ].join("||");
      return createHash("sha256").update(base).digest("hex");
    };

    // Helper to call LLM with retry across models
    const callLLM = async (systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> => {
      for (const model of modelCandidates) {
        const payload = {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: 2000,
        };
        try {
          const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, { headers });
          const content = String(resp?.data?.choices?.[0]?.message?.content ?? "").trim();
          if (content) return content;
        } catch (err) {
          continue;
        }
      }
      return "";
    };

    type GeneratedItem = {
      text: string;
      options: string[];
      correctIndex: number;
      subject: string;
      chapter?: string | null;
      topics?: string[];
      tags?: string[];
      difficulty: "easy" | "medium" | "hard";
      source: {
        keyword: string;
        curatedPineconeIds: string[];
      };
    };

    type EvaluationResult = {
      overallScore: number;
      coverageScore: number;
      diversityScore: number;
      difficultyBalanceScore: number;
      suggestions: string[];
      weakAreas: string[];
      missingTopics: string[];
    };

    // Build the generation schedule
    const difficultiesOrder: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];
    const schedule: Array<{ difficulty: "easy" | "medium" | "hard"; index: number }> = [];
    for (const d of difficultiesOrder) {
      for (let i = 0; i < targetCounts[d]; i++) {
        schedule.push({ difficulty: d, index: schedule.length });
      }
    }

    let generated: GeneratedItem[] = [];
    const seenContentHashes = new Set<string>();
    const seenTexts = new Set<string>();
    const usedPineconeIds = new Set<string>();
    let lastEvaluation: EvaluationResult | null = null;

    // ============================================================
    // PHASE 1: Generate diverse keywords for vector search
    // ============================================================
    const generateKeywords = async (
      evaluationFeedback: EvaluationResult | null,
      existingKeywords: string[],
      generatedQuestions: GeneratedItem[]
    ): Promise<string[]> => {
      const keywordSystemPrompt =
        "You are an expert educational content specialist for Indian competitive exams. " +
        "Generate diverse, specific search keywords/phrases that can be used to find relevant questions in a vector database. " +
        "Return ONLY a JSON array of strings. No prose.";

      const contextParts = [
        `Subject: ${subject}`,
        chapter ? `Chapter: ${chapter}` : "",
        topics.length ? `Focus topics: ${topics.join(", ")}` : "",
        tags.length ? `Relevant tags: ${tags.join(", ")}` : "",
        description ? `Paper description: ${description}` : "",
        `Total questions needed: ${totalRequested} (Easy: ${easyCount}, Medium: ${mediumCount}, Hard: ${hardCount})`,
      ].filter(Boolean);

      let feedbackContext = "";
      if (evaluationFeedback) {
        feedbackContext = [
          "\n--- Evaluation Feedback from Previous Iteration ---",
          `Overall Score: ${evaluationFeedback.overallScore}/10`,
          `Diversity Score: ${evaluationFeedback.diversityScore}/10`,
          `Coverage Score: ${evaluationFeedback.coverageScore}/10`,
          evaluationFeedback.weakAreas.length ? `Weak Areas: ${evaluationFeedback.weakAreas.join(", ")}` : "",
          evaluationFeedback.missingTopics.length ? `Missing Topics: ${evaluationFeedback.missingTopics.join(", ")}` : "",
          evaluationFeedback.suggestions.length ? `Suggestions: ${evaluationFeedback.suggestions.join("; ")}` : "",
        ].filter(Boolean).join("\n");
      }

      const existingKeywordsContext = existingKeywords.length
        ? `\nAlready used keywords (generate DIFFERENT ones): ${existingKeywords.join(", ")}`
        : "";

      const generatedQuestionsContext = generatedQuestions.length
        ? `\nAlready generated ${generatedQuestions.length} questions covering: ${[...new Set(generatedQuestions.flatMap(q => q.topics || []))].slice(0, 10).join(", ")}`
        : "";

      const keywordUserPrompt = [
        "Generate 8-12 diverse, specific search keywords/phrases for finding exam questions.",
        "",
        contextParts.join("\n"),
        feedbackContext,
        existingKeywordsContext,
        generatedQuestionsContext,
        "",
        "Requirements:",
        "- Each keyword should target a different concept, formula, application, or subtopic",
        "- Include a mix of: theoretical concepts, numerical problems, application-based, conceptual",
        "- For each difficulty level, think about what distinguishes easy/medium/hard questions",
        "- Keywords should be specific enough to retrieve focused results",
        "- Avoid generic terms; be precise about the concept or problem type",
        "",
        "Output: JSON array of keyword strings only",
        'Example: ["Projectile motion range formula", "Energy conservation spring problems", "Friction inclined plane numerical", ...]',
      ].join("\n");

      const content = await callLLM(keywordSystemPrompt, keywordUserPrompt, 0.8);
      if (!content) return [];

      try {
        const parsed = JSON.parse(extractJsonArray(content));
        if (Array.isArray(parsed)) {
          return parsed.map((k: any) => String(k).trim()).filter((k: string) => k.length > 0);
        }
      } catch {
        // Try to extract array from text
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            const arr = JSON.parse(match[0]);
            if (Array.isArray(arr)) {
              return arr.map((k: any) => String(k).trim()).filter((k: string) => k.length > 0);
            }
          } catch {}
        }
      }
      return [];
    };

    // ============================================================
    // PHASE 2: Multi-keyword vector retrieval with caching
    // ============================================================
    type RetrievalCache = Map<string, {
      embedding: number[];
      matches: Array<{ id: string; score: number; doc: any }>;
    }>;

    const retrieveForKeywords = async (
      keywords: string[],
      cache: RetrievalCache,
      difficulty?: "easy" | "medium" | "hard"
    ): Promise<RetrievalCache> => {
      for (const keyword of keywords) {
        const cacheKey = `${keyword}::${difficulty || "all"}`;
        if (cache.has(cacheKey)) continue;

        // Build embedding query that incorporates the keyword + context
        const embeddingText = [
          `Subject: ${subject}`,
          chapter ? `Chapter: ${chapter}` : "",
          `Search query: ${keyword}`,
          difficulty ? `Difficulty: ${difficulty}` : "",
          "Type: multiple-choice question for competitive exam",
        ].filter(Boolean).join("\n");

        const embedding = await getEmbeddingForText(embeddingText);

        // Build Pinecone filter
        const pineconeFilter: Record<string, unknown> = { subject };
        if (chapter) pineconeFilter.chapter = chapter;
        if (difficulty) pineconeFilter.difficulty = difficulty;

        // High top-k for better coverage
        const matches = await querySimilarInPinecone({
          values: embedding,
          topK: 50, // High retrieval count
          filter: pineconeFilter,
          includeMetadata: true,
        });

        const ids = matches.map((m) => m.id).filter(Boolean);
        const docs = ids.length
          ? await Question.find({ pineconeId: { $in: ids } })
              .select("text options correctIndex subject chapter topics tags difficulty pineconeId")
              .lean()
          : [];

        const idToDoc = new Map<string, any>();
        for (const doc of docs) {
          idToDoc.set(String(doc.pineconeId), doc);
        }

        const enrichedMatches = matches
          .map((m) => ({
            id: m.id,
            score: m.score,
            doc: idToDoc.get(m.id),
          }))
          .filter((m) => m.doc && m.doc.text && Array.isArray(m.doc.options) && m.doc.options.length > 0);

        cache.set(cacheKey, { embedding, matches: enrichedMatches });
      }

      return cache;
    };

    // ============================================================
    // PHASE 3: Generate single question with keyword-specific context
    // ============================================================
    const generateQuestion = async (
      difficulty: "easy" | "medium" | "hard",
      keyword: string,
      inspirations: any[],
      avoidTexts: string[],
      evaluationFeedback: EvaluationResult | null
    ): Promise<GeneratedItem | null> => {
      // Filter out already used inspirations
      const freshInspirations = inspirations
        .filter((insp) => !usedPineconeIds.has(String(insp.doc?.pineconeId || "")))
        .slice(0, 8);

      const curatedForPrompt = freshInspirations.map((insp: any, i: number) => ({
        idx: i + 1,
        text: insp.doc.text,
        options: insp.doc.options,
        correctIndex: typeof insp.doc.correctIndex === "number" ? insp.doc.correctIndex : undefined,
        chapter: insp.doc.chapter || null,
        topics: insp.doc.topics || [],
        difficulty: insp.doc.difficulty || difficulty,
        relevanceScore: insp.score,
      }));

      let feedbackGuidance = "";
      if (evaluationFeedback) {
        const guidanceParts = [];
        if (evaluationFeedback.missingTopics.length) {
          guidanceParts.push(`Try to cover one of these missing topics: ${evaluationFeedback.missingTopics.join(", ")}`);
        }
        if (evaluationFeedback.weakAreas.length) {
          guidanceParts.push(`Strengthen these areas: ${evaluationFeedback.weakAreas.join(", ")}`);
        }
        if (evaluationFeedback.suggestions.length) {
          guidanceParts.push(`Reviewer suggestions: ${evaluationFeedback.suggestions.slice(0, 2).join("; ")}`);
        }
        if (guidanceParts.length) {
          feedbackGuidance = `\n\n--- Evaluation Guidance ---\n${guidanceParts.join("\n")}`;
        }
      }

      const systemPrompt =
        "You are an expert exam question setter for Indian competitive exams (JEE, NEET, etc.). " +
        "Generate ONE high-quality, original, exam-worthy multiple-choice question (MCQ). " +
        "The question must be unique, well-crafted, and appropriate for the specified difficulty. " +
        "Strictly respond with a single JSON object only; no prose.";

      const userPrompt = [
        `=== Question Generation Context ===`,
        `Keyword/Concept Focus: ${keyword}`,
        ``,
        `Constraints:`,
        `- Subject: ${subject}`,
        chapter ? `- Chapter: ${chapter}` : `- Chapter: (any within subject)`,
        `- Difficulty: ${difficulty}${overallDifficulty ? ` (paper overall: ${overallDifficulty})` : ""}`,
        tags.length ? `- Tags (include when natural): ${tags.join(", ")}` : "",
        topics.length ? `- Topics focus: ${topics.join(", ")}` : "",
        description ? `- Paper notes: ${description}` : "",
        feedbackGuidance,
        "",
        "=== Retrieved Inspiration Questions (DO NOT COPY - use only as style/concept reference) ===",
        JSON.stringify(curatedForPrompt, null, 2),
        "",
        avoidTexts.length > 0
          ? `=== Already Generated Questions (AVOID similar content) ===\n${avoidTexts.slice(-10).map((t, i) => `${i + 1}. ${t.slice(0, 150)}...`).join("\n")}`
          : "",
        "",
        "=== Output JSON Schema ===",
        JSON.stringify({
          text: "string (question stem)",
          options: ["4-5 options as strings"],
          correctIndex: "0-based index of correct option",
          chapter: "string | null",
          topics: ["relevant topic strings"],
          tags: ["relevant tag strings"],
          difficulty: "easy | medium | hard",
        }, null, 2),
        "",
        "=== Generation Rules ===",
        "1. Create a NOVEL question inspired by the concept/keyword, not a copy of inspirations",
        "2. Ensure the question tests genuine understanding, not just memorization",
        "3. Options must have exactly one correct answer with plausible distractors",
        "4. Difficulty should match: easy=direct application, medium=multi-step, hard=complex reasoning",
        "5. Avoid any overlap with the 'Already Generated Questions' list",
      ].filter(Boolean).join("\n");

      const content = await callLLM(systemPrompt, userPrompt, 0.75);
      if (!content) return null;

      let parsed: any = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        try {
          parsed = JSON.parse(extractJsonObject(content));
        } catch {
          return null;
        }
      }

      const text = String(parsed?.text || "").trim();
      const options: string[] = Array.isArray(parsed?.options)
        ? parsed.options.map((o: any) => String(o)).filter((s: string) => s.length > 0)
        : [];
      const ciRaw = parsed?.correctIndex;
      const correctIndex = typeof ciRaw === "number" && ciRaw >= 0 && ciRaw < options.length ? ciRaw : -1;

      if (!text || options.length < 4 || correctIndex < 0) {
        return null;
      }

      const contentHash = computeHash(subject, text, options);
      if (seenContentHashes.has(contentHash) || seenTexts.has(normalize(text))) {
        return null;
      }

      const outChapter = parsed?.chapter === null || parsed?.chapter === undefined || String(parsed?.chapter).trim() === ""
        ? null
        : String(parsed.chapter);
      const outTopics: string[] = Array.isArray(parsed?.topics)
        ? parsed.topics.map((t: any) => String(t)).filter((s: string) => s.length > 0)
        : [];
      const outTags: string[] = Array.isArray(parsed?.tags)
        ? parsed.tags.map((t: any) => String(t)).filter((s: string) => s.length > 0)
        : [];
      const outDiffRaw = String(parsed?.difficulty || "").toLowerCase();
      const outDifficulty: "easy" | "medium" | "hard" =
        outDiffRaw === "easy" || outDiffRaw === "hard" ? (outDiffRaw as any) : "medium";

      // Mark inspirations as used
      freshInspirations.forEach((insp) => {
        if (insp.doc?.pineconeId) usedPineconeIds.add(String(insp.doc.pineconeId));
      });

      seenContentHashes.add(contentHash);
      seenTexts.add(normalize(text));

      return {
        text,
        options,
        correctIndex,
        subject,
        chapter: outChapter,
        topics: outTopics,
        tags: outTags,
        difficulty: outDifficulty,
        source: {
          keyword,
          curatedPineconeIds: freshInspirations.map((insp) => String(insp.doc?.pineconeId || "")),
        },
      };
    };

    // ============================================================
    // PHASE 4: Evaluate entire paper
    // ============================================================
    const evaluatePaper = async (questions: GeneratedItem[]): Promise<EvaluationResult> => {
      const evalSystemPrompt =
        "You are an expert exam paper reviewer for Indian competitive exams. " +
        "Evaluate the given question paper for quality, coverage, diversity, and difficulty balance. " +
        "Return ONLY a JSON object with your evaluation. No prose.";

      const questionsForEval = questions.map((q, i) => ({
        index: i + 1,
        text: q.text.slice(0, 200) + (q.text.length > 200 ? "..." : ""),
        difficulty: q.difficulty,
        topics: q.topics,
        chapter: q.chapter,
      }));

      const evalUserPrompt = [
        "=== Question Paper to Evaluate ===",
        `Subject: ${subject}`,
        chapter ? `Chapter: ${chapter}` : "",
        `Target Distribution: Easy(${easyCount}), Medium(${mediumCount}), Hard(${hardCount})`,
        topics.length ? `Expected Topics: ${topics.join(", ")}` : "",
        "",
        "Questions:",
        JSON.stringify(questionsForEval, null, 2),
        "",
        "=== Evaluation Schema ===",
        JSON.stringify({
          overallScore: "1-10 overall quality score",
          coverageScore: "1-10 topic/concept coverage",
          diversityScore: "1-10 question diversity (concepts, styles, problem types)",
          difficultyBalanceScore: "1-10 appropriate difficulty distribution",
          suggestions: ["array of improvement suggestions"],
          weakAreas: ["array of weak areas in the paper"],
          missingTopics: ["array of important topics not covered"],
        }, null, 2),
        "",
        "Evaluate critically. Identify gaps and suggest specific improvements.",
      ].filter(Boolean).join("\n");

      const content = await callLLM(evalSystemPrompt, evalUserPrompt, 0.5);

      const defaultEval: EvaluationResult = {
        overallScore: 7,
        coverageScore: 7,
        diversityScore: 7,
        difficultyBalanceScore: 7,
        suggestions: [],
        weakAreas: [],
        missingTopics: [],
      };

      if (!content) return defaultEval;

      try {
        const parsed = JSON.parse(extractJsonObject(content));
        return {
          overallScore: typeof parsed.overallScore === "number" ? parsed.overallScore : 7,
          coverageScore: typeof parsed.coverageScore === "number" ? parsed.coverageScore : 7,
          diversityScore: typeof parsed.diversityScore === "number" ? parsed.diversityScore : 7,
          difficultyBalanceScore: typeof parsed.difficultyBalanceScore === "number" ? parsed.difficultyBalanceScore : 7,
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s: any) => String(s)) : [],
          weakAreas: Array.isArray(parsed.weakAreas) ? parsed.weakAreas.map((s: any) => String(s)) : [],
          missingTopics: Array.isArray(parsed.missingTopics) ? parsed.missingTopics.map((s: any) => String(s)) : [],
        };
      } catch {
        return defaultEval;
      }
    };

    // ============================================================
    // MAIN ITERATION LOOP
    // ============================================================
    const retrievalCache: RetrievalCache = new Map();
    const allUsedKeywords: string[] = [];
    let iteration = 0;

    while (iteration < maxIterations && generated.length < totalRequested) {
      iteration++;
      console.log(`[generateQuestionPaperv2] Iteration ${iteration}/${maxIterations}, generated: ${generated.length}/${totalRequested}`);

      // Phase 1: Generate keywords with feedback
      const newKeywords = await generateKeywords(lastEvaluation, allUsedKeywords, generated);
      if (newKeywords.length === 0) {
        console.log("[generateQuestionPaperv2] No new keywords generated, breaking");
        break;
      }
      allUsedKeywords.push(...newKeywords);

      // Phase 2: Retrieve for all keywords (per difficulty)
      for (const diff of difficultiesOrder) {
        if (targetCounts[diff] > 0) {
          await retrieveForKeywords(newKeywords, retrievalCache, diff);
        }
      }

      // Phase 3: Generate questions for remaining slots
      const remainingSchedule = schedule.filter((s) => {
        const countForDiff = generated.filter((g) => g.difficulty === s.difficulty).length;
        return countForDiff < targetCounts[s.difficulty];
      });

      for (let i = 0; i < remainingSchedule.length && generated.length < totalRequested; i++) {
        const slot = remainingSchedule[i];
        if (!slot) continue;
        const { difficulty } = slot;

        // Round-robin through keywords for diversity
        const keywordIndex = (generated.length + i) % newKeywords.length;
        const keyword = newKeywords[keywordIndex];
        if (!keyword) continue;
        
        const cacheKey = `${keyword}::${difficulty}`;

        const cached = retrievalCache.get(cacheKey);
        if (!cached || cached.matches.length === 0) {
          // Fallback: try without difficulty filter
          const fallbackKey = `${keyword}::all`;
          if (!retrievalCache.has(fallbackKey)) {
            await retrieveForKeywords([keyword], retrievalCache);
          }
        }

        const finalCached = retrievalCache.get(cacheKey) || retrievalCache.get(`${keyword}::all`);
        const inspirations = finalCached?.matches || [];

        const avoidTexts = generated.map((g) => g.text);

        // Try to generate with up to 2 retries
        let question: GeneratedItem | null = null;
        for (let attempt = 0; attempt < 3 && !question; attempt++) {
          question = await generateQuestion(
            difficulty,
            keyword,
            inspirations,
            avoidTexts,
            lastEvaluation
          );
        }

        if (question) {
          generated.push(question);
        }
      }

      // Phase 4: Evaluate if we have questions
      if (generated.length > 0) {
        lastEvaluation = await evaluatePaper(generated);
        console.log(`[generateQuestionPaperv2] Evaluation: overall=${lastEvaluation.overallScore}, diversity=${lastEvaluation.diversityScore}`);

        // If evaluation is good enough and we have all questions, break early
        if (
          generated.length >= totalRequested &&
          lastEvaluation.overallScore >= 7 &&
          lastEvaluation.diversityScore >= 6
        ) {
          break;
        }
      }
    }

    // Final response
    res.status(200).json({
      success: true,
      data: generated,
      meta: {
        requested: { easy: easyCount, medium: mediumCount, hard: hardCount, total: totalRequested },
        generated: {
          total: generated.length,
          byDifficulty: {
            easy: generated.filter((g) => g.difficulty === "easy").length,
            medium: generated.filter((g) => g.difficulty === "medium").length,
            hard: generated.filter((g) => g.difficulty === "hard").length,
          },
        },
        iterations: iteration,
        keywordsUsed: allUsedKeywords,
        evaluation: lastEvaluation,
      },
    });
  } catch (error) {
    console.error("Error generating question paper v2:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================================================
// Question Paper CRUD Operations (for history/editor feature)
// ============================================================

export const createQuestionPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const {
      title,
      description,
      questionType,
      subject,
      chapter,
      overallDifficulty,
      tags,
      topics,
      modelVersion,
      requestedCounts,
      questions,
      generationMeta,
      status,
    } = req.body || {};

    if (!title || !subject || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({
        success: false,
        message: "title, subject, and at least one question are required",
      });
      return;
    }

    const paperQuestionType = questionType === "subjective" ? "subjective" : "objective";
    const paper = await QuestionPaper.create({
      title: String(title).trim(),
      description: description ? String(description).trim() : undefined,
      questionType: paperQuestionType,
      subject: String(subject).trim(),
      chapter: chapter ? String(chapter).trim() : undefined,
      overallDifficulty: overallDifficulty || undefined,
      tags: Array.isArray(tags) ? tags.map((t: any) => String(t)) : [],
      topics: Array.isArray(topics) ? topics.map((t: any) => String(t)) : [],
      modelVersion: modelVersion || undefined,
      requestedCounts: requestedCounts || { easy: 0, medium: 0, hard: 0 },
      questions: questions.map((q: any) => ({
        text: String(q.text || "").trim(),
        options: Array.isArray(q.options) ? q.options.map((o: any) => String(o)) : [],
        correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : undefined,
        image: q.image || undefined,
        questionType: q.questionType === "subjective" ? "subjective" : paperQuestionType,
        subject: String(q.subject || subject).trim(),
        chapter: q.chapter || undefined,
        difficulty: q.difficulty || undefined,
        topics: Array.isArray(q.topics) ? q.topics : [],
        tags: Array.isArray(q.tags) ? q.tags : [],
        source: q.source || undefined,
      })),
      generationMeta: generationMeta || undefined,
      status: status || "draft",
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: {
        _id: paper._id,
        title: paper.title,
        subject: paper.subject,
        questionsCount: paper.questions.length,
        status: paper.status,
        createdAt: paper.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating question paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Extract questions from PDF and create a question paper (streaming)
export const uploadPdfToQuestionPaper = async (req: CustomRequest, res: Response) => {
  // Set up SSE headers for streaming progress
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  };

  try {
    const { fileUrl, fileName, title, subject, startPage, numPages } = (req.body || {}) as {
      fileUrl?: string;
      fileName?: string;
      title?: string;
      subject?: string;
      startPage?: string | number;
      numPages?: string | number;
    };

    if (!fileUrl || typeof fileUrl !== "string") {
      sendEvent("error", { message: "fileUrl is required" });
      res.end();
      return;
    }

    if (!subject || typeof subject !== "string") {
      sendEvent("error", { message: "subject is required" });
      res.end();
      return;
    }

    const currentUser = req.user;
    if (!currentUser?._id) {
      sendEvent("error", { message: "Unauthorized" });
      res.end();
      return;
    }

    const userId = String(currentUser._id);
    const role = String(currentUser.role || "");
    
    const startPageNum = Math.max(parseInt(String(startPage ?? "1"), 10) || 1, 1);
    const numPagesNum = Math.max(parseInt(String(numPages ?? "100"), 10) || 100, 1);

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      sendEvent("error", { message: "OPENROUTER_API_KEY not configured" });
      res.end();
      return;
    }

    sendEvent("status", { message: "Downloading PDF...", progress: 5 });

    // Download the PDF from R2 and load via pdfjs
    const pdfResp = await axios.get<ArrayBuffer>(fileUrl, { responseType: "arraybuffer" });
    const pdfData = new Uint8Array(pdfResp.data as any);
    const loadingTask = getDocument({ data: pdfData, disableFontFace: true, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const start = Math.min(startPageNum, totalPages);
    const end = Math.min(start + numPagesNum - 1, totalPages);
    const pagesToProcess = end - start + 1;

    sendEvent("status", { message: `Processing ${pagesToProcess} pages...`, progress: 10, totalPages: pagesToProcess });

    type ExtractedQuestion = {
      question: string;
      questionType: "objective" | "subjective";
      options: string[];
      correctOption?: string;
      image?: string | null;
    };

    const extractedQuestions: ExtractedQuestion[] = [];
    const seenQuestions = new Set<string>();
    let previousPageDataUrl: string | null = null;
    let previousPageExtraction: any[] = [];

    for (let pageNum = start; pageNum <= end; pageNum++) {
      const pageProgress = 10 + Math.floor(((pageNum - start) / pagesToProcess) * 80);
      sendEvent("status", { message: `Processing page ${pageNum - start + 1} of ${pagesToProcess}...`, progress: pageProgress, currentPage: pageNum - start + 1 });

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      // @ts-ignore
      const context = canvas.getContext("2d");

      await page.render({ canvasContext: context, viewport }).promise;
      const pngBuffer = canvas.toBuffer("image/png");
      const base64Image = pngBuffer.toString("base64");
      const dataUrl = `data:image/png;base64,${base64Image}`;

      // Extract text layer from PDF
      const textContent = await page.getTextContent();
      const textItems = textContent.items as Array<{ str: string; transform?: number[] }>;

      const sortedItems = textItems
        .filter((item) => item.str && item.str.trim())
        .map((item) => ({
          str: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
        }))
        .sort((a, b) => {
          const yDiff = b.y - a.y;
          if (Math.abs(yDiff) > 5) return yDiff;
          return a.x - b.x;
        });

      let extractedText = "";
      let lastY: number | null = null;
      for (const item of sortedItems) {
        if (lastY !== null && Math.abs(item.y - lastY) > 5) {
          extractedText += "\n";
        } else if (extractedText && !extractedText.endsWith(" ") && !extractedText.endsWith("\n")) {
          extractedText += " ";
        }
        extractedText += item.str;
        lastY = item.y;
      }

      const hasSelectableText = extractedText.trim().length > 50;

      // Build AI prompt
      const baseSystemPrompt =
        "You are an expert at extracting questions from educational documents. " +
        "CRITICAL MATH FORMATTING: Convert ALL mathematical expressions to proper LaTeX format wrapped in $ delimiters. " +
        "Examples: 'x 2' → '$x^2$', 'T 1' → '$T_1$', fractions like 'x/y' → '$\\frac{x}{y}$'. " +
        "Replace garbled Unicode symbols (≡, ∈, ⊆, →) with LaTeX equivalents. " +
        "Greek letters: α→$\\alpha$, β→$\\beta$, θ→$\\theta$. " +
        "Use the IMAGE to understand actual mathematical content when text is garbled. " +
        "Focus only on printed/typed content; ignore handwritten notes.";

      const extractedTextBlock = hasSelectableText
        ? `\n\n--- EXTRACTED TEXT FROM PDF (reference only, may have garbled math symbols) ---\n${extractedText}\n--- END EXTRACTED TEXT ---\n`
        : "\n\n--- No selectable text found in PDF, using OCR from image ---\n";

      const isFirstPage = pageNum === start;
      const instruction = isFirstPage
        ? "Extract ALL questions (both objective MCQ and subjective open-ended) from this page. " +
          "IMPORTANT: Use the IMAGE as the primary source for mathematical content. Convert all math to LaTeX format. " +
          extractedTextBlock +
          "Respond with a JSON array using this exact schema: " +
          "[{ \"question\": string, \"questionType\": \"objective\" | \"subjective\", \"options\": string[], \"correctOption\"?: string, \"hasDiagram\": boolean, " +
          "\"diagramBox\"?: { \"x\": number, \"y\": number, \"width\": number, \"height\": number } }]. " +
          "For subjective questions (essay, short-answer, numerical without options), set questionType to 'subjective' and options to empty array []. " +
          "For objective questions (MCQ with options), set questionType to 'objective' and include all options. " +
          "Do not include any text outside the JSON. If no questions found, return []. " +
          "When a diagram is present, provide a precise `diagramBox` around the diagram only."
        : "Continue extracting questions from this page. Check if the first content continues a question from the previous page. " +
          "Convert all math to LaTeX format. " +
          extractedTextBlock +
          "Return JSON array with same schema. If content continues from previous page, include the full merged question.";

      const messages: any[] = [{ role: "system", content: baseSystemPrompt }];

      // Include previous page for context
      if (previousPageDataUrl && previousPageExtraction.length > 0) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: "Previous page for context (last question may continue):" },
            { type: "image_url", image_url: { url: previousPageDataUrl } },
          ],
        });
        messages.push({
          role: "assistant",
          content: JSON.stringify(previousPageExtraction),
        });
      }

      messages.push({
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      });

      // Call AI for extraction
      const aiResp = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "google/gemini-2.0-flash-001",
          messages,
          temperature: 0.1,
          max_tokens: 8000,
        },
        {
          headers: {
            Authorization: `Bearer ${openrouterApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const content = aiResp.data?.choices?.[0]?.message?.content || "";
      let extracted: any[] = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error("Failed to parse AI response:", parseErr);
      }

      // Process extracted questions
      for (const item of extracted) {
        let diagramUrl: string | null = null;
        if (item?.hasDiagram && item?.diagramBox && typeof item.diagramBox === "object") {
          const rel = item.diagramBox || {};
          const cw = canvas.width;
          const ch = canvas.height;
          const rx = Math.max(0, Math.min(1, Number(rel.x)));
          const ry = Math.max(0, Math.min(1, Number(rel.y)));
          const rw = Math.max(0, Math.min(1, Number(rel.width)));
          const rh = Math.max(0, Math.min(1, Number(rel.height)));
          let sx = Math.floor(rx * cw);
          let sy = Math.floor(ry * ch);
          let sw = Math.floor(rw * cw);
          let sh = Math.floor(rh * ch);
          const pad = 8;
          sx = Math.max(0, sx - pad);
          sy = Math.max(0, sy - pad);
          sw = Math.min(cw - sx, sw + 2 * pad);
          sh = Math.min(ch - sy, sh + 2 * pad);
          if (sw > 5 && sh > 5) {
            const crop = createCanvas(sw, sh);
            // @ts-ignore
            const cropCtx = crop.getContext("2d");
            // @ts-ignore
            cropCtx.drawImage(canvas as any, sx, sy, sw, sh, 0, 0, sw, sh);
            const cropBuffer = crop.toBuffer("image/png");
            try {
              const uploaded = await uploadBufferToR2(cropBuffer, "image/png", `diagram_page_${pageNum}.png`, role, userId, true);
              diagramUrl = uploaded.publicUrl;
            } catch (e) {
              console.error("Failed to upload diagram image to R2", e);
            }
          }
        }

        const questionText = String(item?.question || "").trim();
        const options: string[] = Array.isArray(item?.options) ? item.options.map((o: any) => String(o)) : [];
        const questionType: "objective" | "subjective" = 
          item?.questionType === "subjective" || (options.length === 0) ? "subjective" : "objective";

        const isValidQuestion = questionText && 
          ((questionType === "objective" && options.length > 0) || questionType === "subjective");

        if (isValidQuestion && !seenQuestions.has(questionText)) {
          seenQuestions.add(questionText);

          let correctIndex: number | undefined;
          if (questionType === "objective" && item?.correctOption) {
            const correctText = String(item.correctOption);
            const foundIdx = options.findIndex((o) => o.trim() === correctText.trim());
            if (foundIdx >= 0) correctIndex = foundIdx;
          }

          extractedQuestions.push({
            question: questionText,
            questionType,
            options,
            correctOption: item?.correctOption,
            image: diagramUrl,
          });

          sendEvent("question_extracted", { 
            index: extractedQuestions.length, 
            question: questionText.substring(0, 100) + (questionText.length > 100 ? "..." : ""),
            questionType,
            hasImage: !!diagramUrl
          });
        }
      }

      sendEvent("page_complete", { page: pageNum - start + 1, totalPages: pagesToProcess, questionsFound: extractedQuestions.length });

      previousPageDataUrl = dataUrl;
      previousPageExtraction = extracted;
    }

    if (extractedQuestions.length === 0) {
      sendEvent("error", { message: "No questions could be extracted from the PDF" });
      res.end();
      return;
    }

    sendEvent("status", { message: "Creating question paper...", progress: 95 });

    // Create the question paper with extracted questions
    const paperTitle = title || fileName?.replace(/\.pdf$/i, '') || `${subject} Paper - ${new Date().toLocaleDateString()}`;
    
    // Determine paper type based on extracted questions
    const hasObjective = extractedQuestions.some(q => q.questionType === "objective");
    const paperType = hasObjective ? "objective" : "subjective";

    const paper = await QuestionPaper.create({
      title: String(paperTitle).trim(),
      subject: String(subject).trim(),
      paperType,
      questions: extractedQuestions.map((q, idx) => ({
        text: q.question,
        options: q.options,
        correctIndex: q.correctOption ? q.options.findIndex((o) => o.trim() === String(q.correctOption).trim()) : undefined,
        image: q.image || undefined,
        questionType: q.questionType,
        subject: subject,
        difficulty: "medium", // Default
        topics: [],
        tags: [],
      })),
      status: "draft",
      createdBy: currentUser._id,
    });

    sendEvent("complete", {
      success: true,
      paperId: paper._id,
      title: paper.title,
      subject: paper.subject,
      questionsCount: extractedQuestions.length,
      message: `Successfully extracted ${extractedQuestions.length} questions and created paper`,
    });
    res.end();

  } catch (error) {
    console.error("Error extracting PDF to question paper:", error);
    sendEvent("error", { message: "Processing failed", details: error instanceof Error ? error.message : "Unknown error" });
    res.end();
  }
};

export const listQuestionPapers = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { page = "1", limit = "20", subject, status, search } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(parseInt(page || "1", 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit || "20", 10) || 20, 1), 100);

    const query: Record<string, unknown> = { createdBy: userId };

    if (subject && String(subject).trim()) {
      query.subject = String(subject).trim();
    }
    if (status && ["draft", "finalized", "archived"].includes(status)) {
      query.status = status;
    }
    if (search && String(search).trim()) {
      query.title = { $regex: String(search).trim(), $options: "i" };
    }

    const [items, total] = await Promise.all([
      QuestionPaper.find(query)
        .sort({ updatedAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select("title description questionType subject chapter modelVersion status createdAt updatedAt")
        .lean()
        .then((papers) =>
          papers.map((p: any) => ({
            ...p,
            questionsCount: p.questions?.length || 0,
          }))
        ),
      QuestionPaper.countDocuments(query),
    ]);

    // Fetch question counts in a separate query since we're using select
    const papersWithCounts = await Promise.all(
      items.map(async (item: any) => {
        const paper = await QuestionPaper.findById(item._id).select("questions").lean();
        return {
          ...item,
          questionsCount: paper?.questions?.length || 0,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: papersWithCounts,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error listing question papers:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getQuestionPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { paperId } = req.params;
    if (!paperId) {
      res.status(400).json({ success: false, message: "paperId is required" });
      return;
    }

    const paper = await QuestionPaper.findOne({ _id: paperId, createdBy: userId }).lean();

    if (!paper) {
      res.status(404).json({ success: false, message: "Paper not found" });
      return;
    }

    res.status(200).json({ success: true, data: paper });
  } catch (error) {
    console.error("Error getting question paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateQuestionPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { paperId } = req.params;
    if (!paperId) {
      res.status(400).json({ success: false, message: "paperId is required" });
      return;
    }

    const {
      title,
      description,
      subject,
      chapter,
      overallDifficulty,
      tags,
      topics,
      status,
      questions,
    } = req.body || {};

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };

    if (title !== undefined) updateFields.title = String(title).trim();
    if (description !== undefined) updateFields.description = description ? String(description).trim() : null;
    if (subject !== undefined) updateFields.subject = String(subject).trim();
    if (chapter !== undefined) updateFields.chapter = chapter ? String(chapter).trim() : null;
    if (overallDifficulty !== undefined) updateFields.overallDifficulty = overallDifficulty || null;
    if (tags !== undefined) updateFields.tags = Array.isArray(tags) ? tags.map((t: any) => String(t)) : [];
    if (topics !== undefined) updateFields.topics = Array.isArray(topics) ? topics.map((t: any) => String(t)) : [];
    if (status !== undefined && ["draft", "finalized", "archived"].includes(status)) {
      updateFields.status = status;
    }

    if (questions !== undefined && Array.isArray(questions)) {
      updateFields.questions = questions.map((q: any) => ({
        _id: q._id || undefined,
        text: String(q.text || "").trim(),
        options: Array.isArray(q.options) ? q.options.map((o: any) => String(o)) : [],
        correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : undefined,
        image: q.image || undefined,
        subject: String(q.subject || subject || "").trim(),
        chapter: q.chapter || undefined,
        difficulty: q.difficulty || undefined,
        topics: Array.isArray(q.topics) ? q.topics : [],
        tags: Array.isArray(q.tags) ? q.tags : [],
        source: q.source || undefined,
      }));
    }

    const paper = await QuestionPaper.findOneAndUpdate(
      { _id: paperId, createdBy: userId },
      { $set: updateFields },
      { new: true }
    ).lean();

    if (!paper) {
      res.status(404).json({ success: false, message: "Paper not found" });
      return;
    }

    res.status(200).json({ success: true, data: paper });
  } catch (error) {
    console.error("Error updating question paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateQuestionInPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { paperId, questionId } = req.params;
    if (!paperId || !questionId) {
      res.status(400).json({ success: false, message: "paperId and questionId are required" });
      return;
    }

    const { text, options, correctIndex, image, chapter, difficulty, topics, tags } = req.body || {};

    const paper = await QuestionPaper.findOne({ _id: paperId, createdBy: userId });

    if (!paper) {
      res.status(404).json({ success: false, message: "Paper not found" });
      return;
    }

    const questionIndex = paper.questions.findIndex((q: any) => String(q._id) === questionId);
    if (questionIndex === -1) {
      res.status(404).json({ success: false, message: "Question not found in paper" });
      return;
    }

    // Update question fields
    const question = paper.questions[questionIndex];
    if (!question) {
      res.status(404).json({ success: false, message: "Question not found at index" });
      return;
    }
    if (text !== undefined) question.text = String(text).trim();
    if (options !== undefined && Array.isArray(options)) {
      question.options = options.map((o: any) => String(o));
    }
    if (correctIndex !== undefined) {
      question.correctIndex = typeof correctIndex === "number" ? correctIndex : undefined;
    }
    if (image !== undefined) question.image = image || undefined;
    if (chapter !== undefined) question.chapter = chapter || undefined;
    if (difficulty !== undefined) question.difficulty = difficulty || undefined;
    if (topics !== undefined) question.topics = Array.isArray(topics) ? topics : [];
    if (tags !== undefined) question.tags = Array.isArray(tags) ? tags : [];

    paper.updatedAt = new Date();
    await paper.save();

    res.status(200).json({
      success: true,
      data: paper.questions[questionIndex],
    });
  } catch (error) {
    console.error("Error updating question in paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const deleteQuestionFromPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { paperId, questionId } = req.params;
    if (!paperId || !questionId) {
      res.status(400).json({ success: false, message: "paperId and questionId are required" });
      return;
    }

    const paper = await QuestionPaper.findOneAndUpdate(
      { _id: paperId, createdBy: userId },
      {
        $pull: { questions: { _id: questionId } },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    );

    if (!paper) {
      res.status(404).json({ success: false, message: "Paper not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Question removed from paper",
      questionsCount: paper.questions.length,
    });
  } catch (error) {
    console.error("Error deleting question from paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const addQuestionToPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { paperId } = req.params;
    if (!paperId) {
      res.status(400).json({ success: false, message: "paperId is required" });
      return;
    }

    const { text, options, correctIndex, image, subject, chapter, difficulty, topics, tags } = req.body || {};

    if (!text || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ success: false, message: "text and at least 2 options are required" });
      return;
    }

    const paper = await QuestionPaper.findOne({ _id: paperId, createdBy: userId });

    if (!paper) {
      res.status(404).json({ success: false, message: "Paper not found" });
      return;
    }

    const newQuestion = {
      text: String(text).trim(),
      options: options.map((o: any) => String(o)),
      correctIndex: typeof correctIndex === "number" ? correctIndex : undefined,
      image: image || undefined,
      subject: subject || paper.subject,
      chapter: chapter || paper.chapter || undefined,
      difficulty: difficulty || undefined,
      topics: Array.isArray(topics) ? topics : [],
      tags: Array.isArray(tags) ? tags : [],
    };

    paper.questions.push(newQuestion as any);
    paper.updatedAt = new Date();
    await paper.save();

    const addedQuestion = paper.questions[paper.questions.length - 1];

    res.status(201).json({
      success: true,
      data: addedQuestion,
      questionsCount: paper.questions.length,
    });
  } catch (error) {
    console.error("Error adding question to paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const deleteQuestionPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { paperId } = req.params;
    if (!paperId) {
      res.status(400).json({ success: false, message: "paperId is required" });
      return;
    }

    const result = await QuestionPaper.findOneAndDelete({ _id: paperId, createdBy: userId });

    if (!result) {
      res.status(404).json({ success: false, message: "Paper not found" });
      return;
    }

    res.status(200).json({ success: true, message: "Paper deleted successfully" });
  } catch (error) {
    console.error("Error deleting question paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const duplicateQuestionPaper = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { paperId } = req.params;
    if (!paperId) {
      res.status(400).json({ success: false, message: "paperId is required" });
      return;
    }

    const original = await QuestionPaper.findOne({ _id: paperId, createdBy: userId }).lean();

    if (!original) {
      res.status(404).json({ success: false, message: "Paper not found" });
      return;
    }

    const duplicate = await QuestionPaper.create({
      ...original,
      _id: undefined,
      title: `${original.title} (Copy)`,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userId,
      questions: original.questions.map((q: any) => ({ ...q, _id: undefined })),
    });

    res.status(201).json({
      success: true,
      data: {
        _id: duplicate._id,
        title: duplicate.title,
        subject: duplicate.subject,
        questionsCount: duplicate.questions.length,
        status: duplicate.status,
        createdAt: duplicate.createdAt,
      },
    });
  } catch (error) {
    console.error("Error duplicating question paper:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================================================
// Question Database Browsing (Questions from curated DB)
// ============================================================

/**
 * List questions with pagination, filtering, and text search
 */
export const browseQuestions = async (req: CustomRequest, res: Response) => {
  try {
    const {
      page = "1",
      limit = "20",
      search,
      subject,
      chapter,
      difficulty,
      questionType,
      tags,
      topics,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(parseInt(String(page || "1"), 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit || "20"), 10) || 20, 1), 100);

    // Build query
    const query: Record<string, unknown> = {};

    // Text search (searches in text field)
    if (search && String(search).trim().length > 0) {
      const s = String(search).trim();
      query.$or = [
        { text: { $regex: s, $options: "i" } },
        { description: { $regex: s, $options: "i" } },
      ];
    }

    // Filter by subject
    if (subject && String(subject).trim().length > 0) {
      query.subject = String(subject).trim();
    }

    // Filter by chapter
    if (chapter && String(chapter).trim().length > 0) {
      query.chapter = String(chapter).trim();
    }

    // Filter by difficulty
    if (difficulty && ["easy", "medium", "hard"].includes(String(difficulty).toLowerCase())) {
      query.difficulty = String(difficulty).toLowerCase();
    }

    // Filter by question type
    if (questionType && ["objective", "subjective"].includes(String(questionType).toLowerCase())) {
      query.questionType = String(questionType).toLowerCase();
    }

    // Filter by tags (comma-separated)
    if (tags && String(tags).trim().length > 0) {
      const tagList = String(tags).split(",").map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        query.tags = { $in: tagList };
      }
    }

    // Filter by topics (comma-separated)
    if (topics && String(topics).trim().length > 0) {
      const topicList = String(topics).split(",").map((t) => t.trim()).filter(Boolean);
      if (topicList.length > 0) {
        query.topics = { $in: topicList };
      }
    }

    // Build sort
    const validSortFields = ["createdAt", "updatedAt", "subject", "difficulty", "chapter"];
    const sortField = validSortFields.includes(String(sortBy)) ? String(sortBy) : "createdAt";
    const sortDir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir };

    const [items, total] = await Promise.all([
      Question.find(query)
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select("text options correctIndex image questionType subject chapter difficulty topics tags description pineconeId createdAt updatedAt"),
      Question.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error browsing questions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Get a single question by ID
 */
export const getQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    if (!questionId) {
      res.status(400).json({ success: false, message: "questionId is required" });
      return;
    }

    const question = await Question.findById(questionId).lean();

    if (!question) {
      res.status(404).json({ success: false, message: "Question not found" });
      return;
    }

    res.status(200).json({ success: true, data: question });
  } catch (error) {
    console.error("Error getting question:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Update a question in the database
 */
export const updateQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    if (!questionId) {
      res.status(400).json({ success: false, message: "questionId is required" });
      return;
    }

    const {
      text,
      options,
      correctIndex,
      image,
      questionType,
      chapter,
      difficulty,
      topics,
      tags,
      description,
    } = req.body || {};

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (text !== undefined) updates.text = String(text).trim();
    if (Array.isArray(options)) updates.options = options.map((o) => String(o || ""));
    if (correctIndex !== undefined) updates.correctIndex = typeof correctIndex === "number" ? correctIndex : null;
    if (image !== undefined) updates.image = image ? String(image) : null;
    if (questionType !== undefined && ["objective", "subjective"].includes(questionType)) {
      updates.questionType = questionType;
    }
    if (chapter !== undefined) updates.chapter = chapter ? String(chapter).trim() : null;
    if (difficulty !== undefined && ["easy", "medium", "hard", null].includes(difficulty)) {
      updates.difficulty = difficulty;
    }
    if (Array.isArray(topics)) updates.topics = topics.map((t) => String(t || "").trim()).filter(Boolean);
    if (Array.isArray(tags)) updates.tags = tags.map((t) => String(t || "").trim()).filter(Boolean);
    if (description !== undefined) updates.description = description ? String(description) : null;

    const question = await Question.findByIdAndUpdate(questionId, updates, { new: true }).lean();

    if (!question) {
      res.status(404).json({ success: false, message: "Question not found" });
      return;
    }

    res.status(200).json({ success: true, data: question });
  } catch (error) {
    console.error("Error updating question:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Delete a question from the database
 */
export const deleteQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    if (!questionId) {
      res.status(400).json({ success: false, message: "questionId is required" });
      return;
    }

    const result = await Question.findByIdAndDelete(questionId);

    if (!result) {
      res.status(404).json({ success: false, message: "Question not found" });
      return;
    }

    res.status(200).json({ success: true, message: "Question deleted successfully" });
  } catch (error) {
    console.error("Error deleting question:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Similarity search using Pinecone vector embeddings
 * Finds questions similar to a given query text or question ID
 */
export const searchSimilarQuestions = async (req: CustomRequest, res: Response) => {
  try {
    const {
      query,
      questionId,
      topK = "10",
      subject,
      difficulty,
      excludeIds,
    } = req.body || {};

    const topKNum = Math.min(Math.max(parseInt(String(topK || "10"), 10) || 10, 1), 50);

    // Must provide either query text or questionId to search from
    if (!query && !questionId) {
      res.status(400).json({ 
        success: false, 
        message: "Either 'query' (text) or 'questionId' is required" 
      });
      return;
    }

    let embedding: number[];

    if (questionId) {
      // Get embedding from existing question's pinecone record
      const question = await Question.findById(questionId).lean();
      if (!question) {
        res.status(404).json({ success: false, message: "Question not found" });
        return;
      }
      // Generate embedding from the question text
      const textToEmbed = `${question.text}\n${(question.options || []).join("\n")}`;
      embedding = await getEmbeddingForText(textToEmbed);
    } else {
      // Generate embedding from query text
      embedding = await getEmbeddingForText(String(query));
    }

    // Build Pinecone filter
    const filter: Record<string, unknown> = {};
    if (subject && String(subject).trim().length > 0) {
      filter.subject = String(subject).trim();
    }
    if (difficulty && ["easy", "medium", "hard"].includes(String(difficulty).toLowerCase())) {
      filter.difficulty = String(difficulty).toLowerCase();
    }

    // Query Pinecone
    const pineconeMatches = await querySimilarInPinecone({
      values: embedding,
      topK: topKNum + (excludeIds?.length || 0) + (questionId ? 1 : 0), // Get extra to account for excludes
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      includeMetadata: true,
    });

    // Get the pinecone IDs, excluding the source question and any explicitly excluded IDs
    const excludeSet = new Set<string>([
      ...(Array.isArray(excludeIds) ? excludeIds : []),
      ...(questionId ? [questionId] : []),
    ]);

    const pineconeIds = pineconeMatches
      .filter((m) => !excludeSet.has(m.id))
      .slice(0, topKNum)
      .map((m) => m.id);

    // Fetch full question data from MongoDB
    const questions = await Question.find({ pineconeId: { $in: pineconeIds } }).lean();

    // Create a map for quick lookup and preserve score order
    const questionMap = new Map(questions.map((q: any) => [q.pineconeId, q]));
    const scoreMap = new Map(pineconeMatches.map((m) => [m.id, m.score]));

    // Build result with similarity scores, preserving order
    const results = pineconeIds
      .map((pineconeId) => {
        const question = questionMap.get(pineconeId);
        if (!question) return null;
        return {
          ...question,
          similarityScore: scoreMap.get(pineconeId) || 0,
        };
      })
      .filter(Boolean);

    res.status(200).json({
      success: true,
      data: results,
      meta: {
        topK: topKNum,
        returned: results.length,
        query: questionId ? `Similar to question ${questionId}` : String(query).substring(0, 100),
      },
    });
  } catch (error) {
    console.error("Error searching similar questions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Get question database statistics
 */
export const getQuestionStats = async (req: CustomRequest, res: Response) => {
  try {
    // Aggregate stats
    const [
      totalCount,
      subjectCounts,
      difficultyCounts,
      typeCounts,
      recentQuestions,
      topTags,
      topTopics,
    ] = await Promise.all([
      // Total question count
      Question.countDocuments(),
      
      // Count by subject
      Question.aggregate([
        { $group: { _id: "$subject", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      
      // Count by difficulty
      Question.aggregate([
        { $group: { _id: "$difficulty", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      
      // Count by question type
      Question.aggregate([
        { $group: { _id: "$questionType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      
      // Recent questions (last 7 days count)
      Question.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      
      // Top tags
      Question.aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      
      // Top topics
      Question.aggregate([
        { $unwind: "$topics" },
        { $group: { _id: "$topics", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
    ]);

    // Get unique chapters per subject
    const chaptersBySubject = await Question.aggregate([
      { $match: { chapter: { $ne: null, $exists: true } } },
      { $group: { _id: { subject: "$subject", chapter: "$chapter" }, count: { $sum: 1 } } },
      { $group: { 
        _id: "$_id.subject", 
        chapters: { $push: { name: "$_id.chapter", count: "$count" } } 
      }},
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        recentCount: recentQuestions,
        bySubject: subjectCounts.map((s: any) => ({ subject: s._id, count: s.count })),
        byDifficulty: difficultyCounts.map((d: any) => ({ difficulty: d._id || "unset", count: d.count })),
        byType: typeCounts.map((t: any) => ({ type: t._id || "objective", count: t.count })),
        topTags: topTags.map((t: any) => ({ tag: t._id, count: t.count })),
        topTopics: topTopics.map((t: any) => ({ topic: t._id, count: t.count })),
        chaptersBySubject: chaptersBySubject.map((s: any) => ({
          subject: s._id,
          chapters: s.chapters.sort((a: any, b: any) => b.count - a.count),
        })),
      },
    });
  } catch (error) {
    console.error("Error getting question stats:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Get available filter options (subjects, chapters, tags, etc.)
 */
export const getFilterOptions = async (req: CustomRequest, res: Response) => {
  try {
    const [subjects, chapters, tags, topics] = await Promise.all([
      // Unique subjects
      Question.distinct("subject"),
      
      // Unique chapters (with their subjects)
      Question.aggregate([
        { $match: { chapter: { $ne: null, $exists: true } } },
        { $group: { _id: { subject: "$subject", chapter: "$chapter" } } },
        { $group: { _id: "$_id.subject", chapters: { $push: "$_id.chapter" } } },
        { $sort: { _id: 1 } },
      ]),
      
      // Unique tags
      Question.aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags" } },
        { $sort: { _id: 1 } },
      ]),
      
      // Unique topics
      Question.aggregate([
        { $unwind: "$topics" },
        { $group: { _id: "$topics" } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        subjects: subjects.filter(Boolean).sort(),
        chaptersBySubject: chapters.reduce((acc: Record<string, string[]>, item: any) => {
          acc[item._id] = (item.chapters || []).filter(Boolean).sort();
          return acc;
        }, {}),
        tags: tags.map((t: any) => t._id).filter(Boolean),
        topics: topics.map((t: any) => t._id).filter(Boolean),
        difficulties: ["easy", "medium", "hard"],
        questionTypes: ["objective", "subjective"],
      },
    });
  } catch (error) {
    console.error("Error getting filter options:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


