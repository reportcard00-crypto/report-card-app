import { Router } from "express";
import { getUser, onboarding,verifyOtp, getProfileStatus, completeUserProfile, completeTeacherProfile } from "../controllers/userControllers";
import { isAuthenticated } from "../middlewares/auth";

const userRouter = Router();

userRouter.post("/onboarding",onboarding);
userRouter.post("/verify-otp", verifyOtp);
userRouter.get("/user", isAuthenticated, getUser);
userRouter.get("/profile-status", isAuthenticated, getProfileStatus);
userRouter.post("/complete-profile", isAuthenticated, completeUserProfile);
userRouter.post("/complete-teacher-profile", isAuthenticated, completeTeacherProfile);

export default userRouter;