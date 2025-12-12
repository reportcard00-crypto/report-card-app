import axios from "axios";
import { Pinecone } from "@pinecone-database/pinecone";

let pineconeClient: Pinecone | null = null;

function getPinecone(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY || "";
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY not configured");
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

export async function getEmbeddingForText(text: string): Promise<number[]> {
  const key = process.env.OPENROUTER_API_KEY || "";
  if (!key) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  const model = process.env.EMBEDDING_MODEL || "openai/text-embedding-3-large";
  const payload = {
    model,
    input: text,
  };
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost",
    "X-Title": process.env.OPENROUTER_APP_NAME || "ReportCardApp",
  };
  const resp = await axios.post("https://openrouter.ai/api/v1/embeddings", payload, { headers });
  const data = resp?.data;
  const values: number[] = data?.data?.[0]?.embedding || [];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Failed to generate embedding");
  }
  return values;
}

export async function upsertVectorsToPinecone(
  vectors: {
    id: string;
    values: number[];
    metadata?: Record<string, string | number | boolean | string[]>;
  }[]
): Promise<void> {
  const indexName = process.env.PINECONE_INDEX || "";
  if (!indexName) {
    throw new Error("PINECONE_INDEX not configured");
  }
  const client = getPinecone();
  const index = client.index(indexName);
  // Pinecone typings require RecordMetadata-compatible values
  await index.upsert(vectors as any);
}

export type PineconeMatch = {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export async function querySimilarInPinecone(params: {
  values: number[];
  topK: number;
  filter?: Record<string, unknown>;
  includeMetadata?: boolean;
}): Promise<PineconeMatch[]> {
  const indexName = process.env.PINECONE_INDEX || "";
  if (!indexName) {
    throw new Error("PINECONE_INDEX not configured");
  }
  const client = getPinecone();
  const index = client.index(indexName);
  const resp = await index.query({
    vector: params.values,
    topK: Math.max(1, Math.min(100, params.topK || 10)),
    includeValues: false,
    includeMetadata: Boolean(params.includeMetadata ?? true),
    filter: params.filter || undefined,
  });
  const matches = (resp?.matches || []).map((m: any) => ({
    id: String(m?.id || ""),
    score: typeof m?.score === "number" ? m.score : 0,
    metadata: m?.metadata || undefined,
  }));
  return matches;
}


