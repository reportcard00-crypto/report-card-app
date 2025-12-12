import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  // Core content
  text: { type: String, required: true },
  options: { type: [String], default: [] },
  correctIndex: { type: Number, required: false },
  image: { type: String, required: false },

  // Admin metadata
  subject: { type: String, required: true },
  chapter: { type: String, required: false },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], required: false },
  topics: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  description: { type: String, required: false },

  // Source info (optional)
  sourceFileUrl: { type: String, required: false },
  sourcePage: { type: Number, required: false },

  // Deterministic hash to prevent duplicates
  contentHash: { type: String, required: true, index: true, unique: true },

  // Vector store linkage
  pineconeId: { type: String, required: false, index: true },

  // Ownership and timestamps
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Question = mongoose.model("Question", questionSchema);

export default Question;


