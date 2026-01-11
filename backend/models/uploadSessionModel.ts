import mongoose from "mongoose";

const uploadSessionSchema = new mongoose.Schema({
  // File info
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  subject: { type: String, required: true },
  
  // Processing info
  startPage: { type: Number, default: 1 },
  numPages: { type: Number, default: 1 },
  totalQuestionsExtracted: { type: Number, default: 0 },
  
  // Status tracking
  status: { 
    type: String, 
    enum: ["processing", "completed", "failed"], 
    default: "processing" 
  },
  errorMessage: { type: String, required: false },
  
  // Questions extracted in this session
  questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  
  // Ownership and timestamps
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, required: false },
});

// Index for efficient querying by user
uploadSessionSchema.index({ createdBy: 1, createdAt: -1 });

const UploadSession = mongoose.model("UploadSession", uploadSessionSchema);

export default UploadSession;

