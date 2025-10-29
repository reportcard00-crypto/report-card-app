import mongoose from "mongoose";
import ROLES from "../types/roles";

const userSchema = new mongoose.Schema({
  name: { type: String },
  phone: { type: String, required: true, unique: true },
  otp: { type: String },
  otpExpiry: { type: Date },
  isPhoneVerified: { type: Boolean, default: false, required: true },
  role: { type: String, enum: ROLES, default: ROLES.USER },
  userProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'UserProfile' },
  teacherProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'TeacherProfile' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

export default User;