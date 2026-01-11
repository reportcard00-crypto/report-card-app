import mongoose from "mongoose";

// Schema for individual questions within a paper
const paperQuestionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: { type: [String], default: [] },
  correctIndex: { type: Number, required: false },
  image: { type: String, required: false },
  subject: { type: String, required: true },
  chapter: { type: String, required: false },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], required: false },
  topics: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  // Source info for tracking which curated questions were used as inspiration
  source: {
    keyword: { type: String, required: false },
    curatedPineconeIds: { type: [String], default: [] },
    permutation: { type: String, required: false },
  },
}, { _id: true });

const questionPaperSchema = new mongoose.Schema({
  // Paper metadata
  title: { type: String, required: true },
  description: { type: String, required: false },
  
  // Generation parameters (for reference)
  subject: { type: String, required: true },
  chapter: { type: String, required: false },
  overallDifficulty: { type: String, enum: ["easy", "medium", "hard"], required: false },
  tags: { type: [String], default: [] },
  topics: { type: [String], default: [] },
  modelVersion: { type: String, required: false }, // v1, v1.5, v2
  
  // Requested question counts
  requestedCounts: {
    easy: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    hard: { type: Number, default: 0 },
  },
  
  // The questions in this paper
  questions: [paperQuestionSchema],
  
  // Status
  status: { 
    type: String, 
    enum: ["draft", "finalized", "archived"], 
    default: "draft" 
  },
  
  // Generation metadata (from AI evaluation)
  generationMeta: {
    iterations: { type: Number, required: false },
    keywordsUsed: { type: [String], default: [] },
    evaluation: {
      overallScore: { type: Number, required: false },
      coverageScore: { type: Number, required: false },
      diversityScore: { type: Number, required: false },
      difficultyBalanceScore: { type: Number, required: false },
      suggestions: { type: [String], default: [] },
      weakAreas: { type: [String], default: [] },
      missingTopics: { type: [String], default: [] },
    },
  },
  
  // Ownership and timestamps
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes for efficient querying
questionPaperSchema.index({ createdBy: 1, createdAt: -1 });
questionPaperSchema.index({ subject: 1, createdAt: -1 });
questionPaperSchema.index({ status: 1 });

const QuestionPaper = mongoose.model("QuestionPaper", questionPaperSchema);

export default QuestionPaper;

