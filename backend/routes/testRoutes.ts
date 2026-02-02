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
  getTeacherAnalytics,
  getTestOverview,
  getAdminAnalytics,
  getStudentDashboard,
  getStudentTestDetail,
} from "../controllers/testController";
import { isAuthenticated, isAdminOrTeacher, isAdmin } from "../middlewares/auth";

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
// Analytics Routes
// ============================================================

// Teacher analytics - overview dashboard (accessible by teachers and admins)
testRouter.get("/analytics/teacher", isAuthenticated, isAdminOrTeacher, getTeacherAnalytics);

// Test overview - detailed table view for a specific test
testRouter.get("/analytics/test-overview", isAuthenticated, isAdminOrTeacher, getTestOverview);

// Admin analytics - school-wide dashboard (admin only)
testRouter.get("/analytics/admin", isAuthenticated, isAdmin, getAdminAnalytics);

// ============================================================
// Student Routes
// ============================================================

// Get active tests for the current student (for polling)
testRouter.get("/active", isAuthenticated, getActiveTestsForStudent);

// Get student dashboard analytics (overall performance, strengths, weaknesses, insights)
testRouter.get("/student/dashboard", isAuthenticated, getStudentDashboard);

// Get detailed test result with chapter breakdown and analysis
testRouter.get("/student/:testId/detail", isAuthenticated, getStudentTestDetail);

// Start a test (student)
testRouter.post("/:testId/start", isAuthenticated, startTestForStudent);

// Submit test answers
testRouter.post("/:testId/submit", isAuthenticated, submitTest);

// Get student's result for a test
testRouter.get("/:testId/result", isAuthenticated, getStudentResult);

export default testRouter;

