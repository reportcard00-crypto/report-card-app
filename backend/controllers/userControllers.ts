import type { Request, Response } from "express";
import { onboardingSchema, verifyOtpSchema } from "../schemas/onboardingSchema";
import { generateOTP, sendPhoneOtp } from "../utils/otp";
import { z } from "zod";
import User from "../models/userModel";
import type { CustomRequest } from "../types/index";
import { generateToken } from "../utils/token";
import { UserProfile, TeacherProfile } from "../models/profileModel";
import ROLES from "../types/roles";

export const onboarding = async (req: Request, res: Response) => {
  try {
    const { phone } = onboardingSchema.parse(req.body);
    const user = await User.findOne({ phone: phone });
    if (!user) {
      const newUser = await User.create({ phone: phone });
      const otp = generateOTP();
      await sendPhoneOtp(phone, otp);
      await newUser.updateOne({
        otp: otp,
        otpExpiry: new Date(Date.now() + 15 * 60 * 1000), // OTP valid for 15 minutes
      });
      res.status(201).json({
        success: true,
        message: "OTP sent successfully",
        userId: newUser._id.toString(),
      });
      return;
    }
    const otp = generateOTP();
    await sendPhoneOtp(phone, otp);
    const userId = user?._id.toString();
    if (!userId) {
      console.log("some problem with userId");
    }
    await user.updateOne({
      otp: otp,
      otpExpiry: new Date(Date.now() + 15 * 60 * 1000), // OTP valid for 15 minutes
    });
    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      userId: userId,
    });
  } catch (error) {
    console.error("Error during onboarding:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: "Invalid input data",
      });
    }
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { phone, otp } = verifyOtpSchema.parse(req.body);

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) {
      res.status(400).json({ success: false, message: "User not found" });
      return;
    }

    if (!user.otp) {
      res.status(400).json({ success: false, message: "Invalid OTP" });
      return;
    }

    if (user.otpExpiry && user.otpExpiry < new Date()) {
      res.status(400).json({ success: false, message: "OTP expired" });
      return;
    }

    // Verify submitted OTP matches stored OTP
    if (user.otp !== otp) {
      res.status(400).json({ success: false, message: "Incorrect OTP" });
      return;
    }

    user.otp = null;
    user.otpExpiry = null;
    user.isPhoneVerified = true;
    await user.save();

    const token = generateToken(user._id.toString());

    res.status(200).json({
      success: true,
      message: "OTP verified. Logged in successfully.",
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
      },
      token,
      role: user.role,
      isProfileComplete: true,
    });
    return;
  } catch (error) {
    console.error("Error during OTP verification:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export const getProfileStatus = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "User not found" });
      return;
    }

    const role = user.role;
    let hasProfile = false;
    let profileSummary: Record<string, unknown> | null = null;
    let profileType: "user" | "teacher" | null = null;

    if (role === ROLES.USER) {
      profileType = "user";
      if (user.userProfile) {
        const profile = await UserProfile.findById(user.userProfile);
        if (profile) {
          hasProfile = true;
          profileSummary = {
            name: profile.name,
            grade: profile.grade,
            school: profile.school,
          };
        }
      }
    } else if (role === ROLES.TEACHER) {
      profileType = "teacher";
      if (user.teacherProfile) {
        const profile = await TeacherProfile.findById(user.teacherProfile);
        if (profile) {
          hasProfile = true;
          profileSummary = {
            name: profile.name,
            subject: profile.subject,
            experience: profile.experience,
            isApproved: profile.isApproved,
          };
        }
      }
    }

    res.status(200).json({
      success: true,
      hasProfile,
      role,
      profileType,
      profileSummary,
    });
  } catch (error) {
    console.error("Error getting profile status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export const completeUserProfile = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "User not found" });
      return;
    }

    if (user.role !== ROLES.USER) {
      res.status(400).json({ success: false, message: "Only students can complete this profile" });
      return;
    }

    const {
      name,
      grade,
      school,
    } = req.body as Record<string, string>;

    const missing = [
      ["name", name],
      ["grade", grade],
      ["school", school],
    ].filter(([, v]) => !v || String(v).trim().length === 0).map(([k]) => k);

    if (missing.length > 0) {
      res.status(400).json({ success: false, message: `Missing fields: ${missing.join(", ")}` });
      return;
    }

    // Create or update the user profile
    let profileDoc;
    if (user.userProfile) {
      profileDoc = await UserProfile.findByIdAndUpdate(
        user.userProfile,
        { name, grade, school, updatedAt: new Date() },
        { new: true }
      );
    } else {
      profileDoc = await UserProfile.create({ name, grade, school });
      user.userProfile = profileDoc._id as any;
    }
    if (!profileDoc) {
      res.status(404).json({ success: false, message: "Profile not found" });
      return;
    }

    // sync basic name field on user
    user.name = name;
    await (user as any).save();

    res.status(200).json({
      success: true,
      message: "Profile saved successfully",
      profileSummary: {
        name: profileDoc.name,
        grade: profileDoc.grade,
        school: profileDoc.school,
      },
    });
  } catch (error) {
    console.error("Error completing profile:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export const getUser = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found",
      });
    }
    // Only send safe fields
    res.status(200).json({
      _id: user!._id,
      name: user!.name,
      phone: user!.phone,
      role: user!.role,
      isPhoneVerified: user!.isPhoneVerified,
    });
  }catch (error) {
    console.error("Error getting user profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}