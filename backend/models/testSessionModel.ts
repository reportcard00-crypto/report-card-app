import mongoose from "mongoose";

// Schema for a test session - when a paper is assigned to a classroom
const testSessionSchema = new mongoose.Schema({
  // The question paper being used for this test
  questionPaper: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "QuestionPaper", 
    required: true 
  },
  
  // The classroom this test is assigned to
  classroom: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Classroom", 
    required: true 
  },
  
  // Title for quick reference
  title: { type: String, required: true },
  
  // Test timing
  timeLimitMinutes: { type: Number, required: true, min: 1 },
  
  // Test status
  status: {
    type: String,
    enum: ["assigned", "active", "completed", "cancelled"],
    default: "assigned",
  },
  
  // When the test was started (null until started)
  startedAt: { type: Date, default: null },
  
  // When the test ends (calculated from startedAt + timeLimitMinutes)
  endsAt: { type: Date, default: null },
  
  // Who created/assigned this test
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  
  // Track which students have completed
  completedStudents: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User" 
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes for efficient querying
testSessionSchema.index({ classroom: 1, status: 1 });
testSessionSchema.index({ createdBy: 1, createdAt: -1 });
testSessionSchema.index({ status: 1, endsAt: 1 });

testSessionSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

const TestSession = mongoose.model("TestSession", testSessionSchema);

export default TestSession;

