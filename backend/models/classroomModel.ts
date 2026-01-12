import mongoose from "mongoose";

const classroomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Ensure uniqueness of classroom name per teacher
classroomSchema.index({ name: 1, teacher: 1 }, { unique: true });

classroomSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Classroom = mongoose.model('Classroom', classroomSchema);

export default Classroom;

