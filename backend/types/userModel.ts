import type mongoose from "mongoose";
import type ROLES from "./roles";

export type UserModel = {
    _id: mongoose.Types.ObjectId;
    name?: string;
    phone: string;
    otp?: string;
    otpExpiry?: Date;
    isPhoneVerified: boolean;
    role?: typeof ROLES;
    userProfile?: mongoose.Types.ObjectId;
    teacherProfile?: mongoose.Types.ObjectId;
}