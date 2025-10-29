import express from "express";
import connectDatabse from "./config/db";
import userRouter from "./routes/userRoutes";

const app = express();

connectDatabse();

app.use(express.json());

app.use("/api/user", userRouter);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});