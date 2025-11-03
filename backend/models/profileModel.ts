import mongoose from "mongoose";

const userProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  grade: { type: String, required: true },
  school: { type: String, required: true },
  city: { type: String, required: false },
  state: { type: String, required: false },
  country: { type: String, required: false },
  pincode: { type: String, required: false },
  address: { type: String, required: false },
  profilePicture: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const teacherProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isApproved: { type: Boolean, default: false },
  subject: { type: String, required: true },
  experience: { type: Number, required: true },
  school: { type: String, required: true },
  bio: { type: String, required: true },
  profilePicture: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const UserProfile = mongoose.model('UserProfile', userProfileSchema);
const TeacherProfile = mongoose.model('TeacherProfile', teacherProfileSchema);

export { UserProfile, TeacherProfile };