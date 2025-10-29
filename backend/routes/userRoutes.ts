import { Router } from "express";
import { getUser, onboarding,verifyOtp } from "../controllers/userControllers";
import { isAuthenticated } from "../middlewares/auth";

const userRouter = Router();

userRouter.post("/onboarding",onboarding);
userRouter.post("/verify-otp", verifyOtp);
userRouter.get("/user", isAuthenticated, getUser);

export default userRouter;