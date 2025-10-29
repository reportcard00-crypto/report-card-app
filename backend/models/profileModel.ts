import mongoose from "mongoose";

const userProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  grade: { type: String, required: true },
  school: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, required: true },
  pincode: { type: String, required: true },
  address: { type: String, required: true },
  profilePicture: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const teacherProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isApproved: { type: Boolean, default: false },
  subject: { type: String, required: true },
  experience: { type: Number, required: true },
  bio: { type: String, required: true },
  profilePicture: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const UserProfile = mongoose.model('UserProfile', userProfileSchema);
const TeacherProfile = mongoose.model('TeacherProfile', teacherProfileSchema);

export { UserProfile, TeacherProfile };