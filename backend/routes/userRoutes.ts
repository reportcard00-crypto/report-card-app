import { Router } from "express";
import { getUser, onboarding,verifyOtp, getProfileStatus, completeUserProfile } from "../controllers/userControllers";
import { isAuthenticated } from "../middlewares/auth";

const userRouter = Router();

userRouter.post("/onboarding",onboarding);
userRouter.post("/verify-otp", verifyOtp);
userRouter.get("/user", isAuthenticated, getUser);
userRouter.get("/profile-status", isAuthenticated, getProfileStatus);
userRouter.post("/complete-profile", isAuthenticated, completeUserProfile);

export default userRouter;