import { Router } from "express";
import {
  assignPaperToClassroom,
  reassignTest,
  startTest,
  stopTest,
  listTestSessions,
  getTestResults,
  getTestStatus,
  getActiveTestsForStudent,
  startTestForStudent,
  submitTest,
  getStudentResult,
  deleteTestSession,
} from "../controllers/testController";
import { isAuthenticated, isAdminOrTeacher } from "../middlewares/auth";

const testRouter = Router();

// ============================================================
// Admin/Teacher Routes
// ============================================================

// Assign a paper to a classroom
testRouter.post("/assign", isAuthenticated, isAdminOrTeacher, assignPaperToClassroom);

// List all test sessions
testRouter.get("/sessions", isAuthenticated, isAdminOrTeacher, listTestSessions);

// Reassign test to different classroom
testRouter.put("/sessions/:testId/reassign", isAuthenticated, isAdminOrTeacher, reassignTest);

// Start a test (set time limit and activate)
testRouter.post("/sessions/:testId/start", isAuthenticated, isAdminOrTeacher, startTest);

// Stop a test early
testRouter.post("/sessions/:testId/stop", isAuthenticated, isAdminOrTeacher, stopTest);

// Get detailed results for a test
testRouter.get("/sessions/:testId/results", isAuthenticated, isAdminOrTeacher, getTestResults);

// Get real-time status of a test (for polling by admin/teacher)
testRouter.get("/sessions/:testId/status", isAuthenticated, isAdminOrTeacher, getTestStatus);

// Delete a test session
testRouter.delete("/sessions/:testId", isAuthenticated, isAdminOrTeacher, deleteTestSession);

// ============================================================
// Student Routes
// ============================================================

// Get active tests for the current student (for polling)
testRouter.get("/active", isAuthenticated, getActiveTestsForStudent);

// Start a test (student)
testRouter.post("/:testId/start", isAuthenticated, startTestForStudent);

// Submit test answers
testRouter.post("/:testId/submit", isAuthenticated, submitTest);

// Get student's result for a test
testRouter.get("/:testId/result", isAuthenticated, getStudentResult);

export default testRouter;

