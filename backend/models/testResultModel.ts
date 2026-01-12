import mongoose from "mongoose";

// Schema for individual answer within a test result
const answerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  selectedIndex: { type: Number, default: null }, // null means not answered
  isCorrect: { type: Boolean, default: false },
  timeTaken: { type: Number, default: 0 }, // seconds spent on this question
}, { _id: false });

// Schema for a student's test result
const testResultSchema = new mongoose.Schema({
  // The test session this result belongs to
  testSession: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "TestSession", 
    required: true 
  },
  
  // The student who took the test
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  
  // Student's answers
  answers: [answerSchema],
  
  // Scoring
  totalQuestions: { type: Number, required: true },
  attemptedQuestions: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  wrongAnswers: { type: Number, default: 0 },
  score: { type: Number, default: 0 }, // Percentage
  
  // Test status for this student
  status: {
    type: String,
    enum: ["not_started", "in_progress", "submitted", "timed_out"],
    default: "not_started",
  },
  
  // Timing
  startedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  totalTimeTaken: { type: Number, default: 0 }, // seconds
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Ensure one result per student per test session
testResultSchema.index({ testSession: 1, student: 1 }, { unique: true });
testResultSchema.index({ student: 1, status: 1 });
testResultSchema.index({ testSession: 1, status: 1 });

testResultSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

const TestResult = mongoose.model("TestResult", testResultSchema);

export default TestResult;

