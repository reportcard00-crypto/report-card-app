import express from "express";
import dotenv from "dotenv";
import connectDatabse from "./config/db";
import userRouter from "./routes/userRoutes";
import adminRouter from "./routes/adminRoutes";
import cors from "cors";
import { Path2D as CanvasPath2D, DOMMatrix as CanvasDOMMatrix, Image as CanvasImage, ImageData as CanvasImageData } from "@napi-rs/canvas";
import fileRoutes from "./routes/fileRoutes";

// Ensure pdfjs-dist has required canvas-like globals in Node
// @ts-ignore
if (!(globalThis as any).Path2D) (globalThis as any).Path2D = CanvasPath2D as unknown as Path2D;
// @ts-ignore
if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = CanvasDOMMatrix as unknown as DOMMatrix;
// @ts-ignore
if (!(globalThis as any).Image) (globalThis as any).Image = CanvasImage as unknown as typeof Image;
// @ts-ignore
if (!(globalThis as any).ImageData) (globalThis as any).ImageData = CanvasImageData as unknown as typeof ImageData;
const app = express();

dotenv.config();

connectDatabse();

app.use(express.json({ limit: "25mb" }));
app.use(cors({
  origin: "*",
  credentials: true,
}));
app.get("/", (req, res) => {
  res.send("Hello World");
});
app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/file", fileRoutes);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});