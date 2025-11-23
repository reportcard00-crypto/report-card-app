import type { Request, Response } from "express";
import User from "../models/userModel";
import ROLES from "../types/roles";
import axios from "axios";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist";
import type { CustomRequest } from "../types";
import { uploadBufferToR2 } from "../utils/fileupload";

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

      // Build prompt for OpenRouter (multimodal)
      const model = "google/gemini-3-pro-preview";
      const baseSystemPrompt =
        "You are an expert at parsing printed, scanned exam pages. Extract all multiple-choice questions. " +
        "Return ONLY strict JSON (no prose). For each question, include: " +
        "`question` (string, the stem), `options` (array of strings in order), and, if clearly present, `correctOption` (string matching one of the options). " +
        "If a diagram is associated with a question, set `hasDiagram` to true and also include `diagramBox` " +
        "as an object with normalized coordinates relative to the image dimensions: " +
        "{ x: number, y: number, width: number, height: number } with 0 <= values <= 1. " +
        "The box should tightly enclose only the figure/diagram related to that question (exclude text as much as possible). " +
        "Focus only on printed/typed content; ignore handwritten notes.";

      const firstPageInstruction =
        "Extract questions from this page image and respond with a JSON array using this exact schema: " +
        "[{ \"question\": string, \"options\": string[], \"correctOption\"?: string, \"hasDiagram\": boolean, " +
        "\"diagramBox\"?: { \"x\": number, \"y\": number, \"width\": number, \"height\": number } }]. " +
        "Do not include any text outside the JSON. If no questions found, return []. " +
        "When a diagram is present, provide a precise `diagramBox` around the diagram only.";

      const continuationInstruction =
        "The next page may contain the continuation of a question that started on the previous page. " +
        "You are given: (1) the previous page image, (2) the JSON extracted from the previous page, and (3) the current page image. " +
        "Using these, return ONLY the questions that are NEW on the current page or that CONTINUE from the previous page but were incomplete there. " +
        "Do NOT duplicate any question that is already fully captured in the previous JSON. " +
        "Output must be a JSON array with the same exact schema as before. " +
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
                      JSON.stringify(previousPageExtraction || [], null, 2),
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
        const q: ExtractedQuestion = {
          question: String(item?.question || "").trim(),
          options: Array.isArray(item?.options) ? item.options.map((o: any) => String(o)) : [],
          correctOption: item?.correctOption ? String(item.correctOption) : undefined,
          image: item?.hasDiagram ? diagramUrl : null,
          page: pageNum,
        };
        if (q.question && q.options.length > 0 && !seenQuestions.has(q.question)) {
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


