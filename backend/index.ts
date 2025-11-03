import express from "express";
import connectDatabse from "./config/db";
import userRouter from "./routes/userRoutes";
import adminRouter from "./routes/adminRoutes";
import cors from "cors";
const app = express();

connectDatabse();

app.use(express.json());
app.use(cors({
  origin: "*",
  credentials: true,
}));
app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});