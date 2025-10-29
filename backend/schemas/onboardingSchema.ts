import z from "zod";

export const onboardingSchema = z.object({
    phone: z.string().min(10, "Phone number must be at least 10 characters long"),
});
export const verifyOtpSchema = z.object({
    phone: z.string().min(10, "Phone number must be at least 10 characters long"),
    otp: z.string().length(4, "OTP must be exactly 4 characters long"),
});

export const completeProfileSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.email(),
    age: z.enum(["18-30", "30-50", "50+"], {
        message: "Please select a valid age group"
    }),
    gender: z.enum(["male", "female", "other"], {
        message: "Please select a valid gender"
    }),
});