import type { Response } from "express";
import type { CustomRequest } from "../types/index";
import type { UserModel } from "../types/userModel";
import TestSession from "../models/testSessionModel";
import TestResult from "../models/testResultModel";
import QuestionPaper from "../models/questionPaperModel";
import Classroom from "../models/classroomModel";
import ROLES from "../types/roles";

// ============================================================
// Admin/Teacher Endpoints
// ============================================================

// Assign a question paper to a classroom
export const assignPaperToClassroom = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { paperId, classroomId, title } = req.body;

    if (!paperId || !classroomId) {
      res.status(400).json({ success: false, message: "Paper ID and Classroom ID are required" });
      return;
    }

    // Verify paper exists
    const paper = await QuestionPaper.findById(paperId);
    if (!paper) {
      res.status(404).json({ success: false, message: "Question paper not found" });
      return;
    }

    // Verify classroom exists and user has access
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      res.status(404).json({ success: false, message: "Classroom not found" });
      return;
    }

    // Check access for teachers
    if (user.role === ROLES.TEACHER && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied to this classroom" });
      return;
    }

    // Create test session
    const testSession = new TestSession({
      questionPaper: paperId,
      classroom: classroomId,
      title: title || paper.title,
      timeLimitMinutes: 60, // Default, will be set when starting
      status: "assigned",
      createdBy: user._id,
    });

    await testSession.save();

    res.status(201).json({
      success: true,
      data: {
        _id: testSession._id,
        title: testSession.title,
        status: testSession.status,
        classroom: classroomId,
        paper: paperId,
        createdAt: testSession.createdAt,
      },
      message: "Test assigned successfully",
    });
  } catch (error) {
    console.error("Error assigning paper to classroom:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Reassign test to different classroom
export const reassignTest = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;
    const { classroomId } = req.body;

    if (!classroomId) {
      res.status(400).json({ success: false, message: "Classroom ID is required" });
      return;
    }

    const testSession = await TestSession.findById(testId);
    if (!testSession) {
      res.status(404).json({ success: false, message: "Test session not found" });
      return;
    }

    // Can only reassign if not started
    if (testSession.status !== "assigned") {
      res.status(400).json({ success: false, message: "Can only reassign tests that haven't started" });
      return;
    }

    // Verify new classroom exists and user has access
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      res.status(404).json({ success: false, message: "Classroom not found" });
      return;
    }

    if (user.role === ROLES.TEACHER && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied to this classroom" });
      return;
    }

    testSession.classroom = classroomId;
    await testSession.save();

    res.status(200).json({
      success: true,
      data: {
        _id: testSession._id,
        classroom: classroomId,
      },
      message: "Test reassigned successfully",
    });
  } catch (error) {
    console.error("Error reassigning test:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Start a test (sets time limit and activates)
export const startTest = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;
    const { timeLimitMinutes } = req.body;

    if (!timeLimitMinutes || timeLimitMinutes < 1) {
      res.status(400).json({ success: false, message: "Valid time limit is required (minimum 1 minute)" });
      return;
    }

    const testSession = await TestSession.findById(testId);
    if (!testSession) {
      res.status(404).json({ success: false, message: "Test session not found" });
      return;
    }

    // Check access
    const classroom = await Classroom.findById(testSession.classroom);
    if (user.role === ROLES.TEACHER && classroom && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    // Can only start if assigned
    if (testSession.status !== "assigned") {
      res.status(400).json({ success: false, message: `Cannot start test with status: ${testSession.status}` });
      return;
    }

    const now = new Date();
    testSession.timeLimitMinutes = timeLimitMinutes;
    testSession.status = "active";
    testSession.startedAt = now;
    testSession.endsAt = new Date(now.getTime() + timeLimitMinutes * 60 * 1000);

    await testSession.save();

    res.status(200).json({
      success: true,
      data: {
        _id: testSession._id,
        status: testSession.status,
        timeLimitMinutes: testSession.timeLimitMinutes,
        startedAt: testSession.startedAt,
        endsAt: testSession.endsAt,
      },
      message: "Test started successfully",
    });
  } catch (error) {
    console.error("Error starting test:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Stop/end a test early
export const stopTest = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;

    const testSession = await TestSession.findById(testId);
    if (!testSession) {
      res.status(404).json({ success: false, message: "Test session not found" });
      return;
    }

    // Check access
    const classroom = await Classroom.findById(testSession.classroom);
    if (user.role === ROLES.TEACHER && classroom && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    if (testSession.status === "completed" || testSession.status === "cancelled") {
      res.status(400).json({ success: false, message: "Test is already ended" });
      return;
    }

    testSession.status = "completed";
    testSession.endsAt = new Date();
    await testSession.save();

    // Mark all in-progress results as timed_out
    await TestResult.updateMany(
      { testSession: testId, status: "in_progress" },
      { status: "timed_out", submittedAt: new Date() }
    );

    res.status(200).json({
      success: true,
      message: "Test stopped successfully",
    });
  } catch (error) {
    console.error("Error stopping test:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// List test sessions (for admin/teacher)
export const listTestSessions = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const classroomId = req.query.classroomId as string | undefined;

    const filter: any = {};

    // Teachers see only tests for their classrooms
    if (user.role === ROLES.TEACHER) {
      const teacherClassrooms = await Classroom.find({ teacher: user._id }).select("_id");
      filter.classroom = { $in: teacherClassrooms.map(c => c._id) };
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (classroomId) {
      filter.classroom = classroomId;
    }

    const [sessions, total] = await Promise.all([
      TestSession.find(filter)
        .populate("questionPaper", "title subject questionsCount")
        .populate("classroom", "name studentsCount")
        .populate("createdBy", "name phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TestSession.countDocuments(filter),
    ]);

    // Get result counts for each session
    const sessionsWithCounts = await Promise.all(
      sessions.map(async (session: any) => {
        const [totalStudents, completedCount] = await Promise.all([
          Classroom.findById(session.classroom?._id || session.classroom).then((c: any) => c?.students?.length || 0),
          TestResult.countDocuments({ testSession: session._id, status: { $in: ["submitted", "timed_out"] } }),
        ]);
        return {
          ...session,
          totalStudents,
          completedCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: sessionsWithCounts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error listing test sessions:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get detailed results for a test session
export const getTestResults = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;

    const testSession = await TestSession.findById(testId)
      .populate("questionPaper")
      .populate("classroom", "name")
      .lean();

    if (!testSession) {
      res.status(404).json({ success: false, message: "Test session not found" });
      return;
    }

    // Check access for teachers
    const classroom = await Classroom.findById(testSession.classroom);
    if (user.role === ROLES.TEACHER && classroom && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    // Get all results for this test
    const results = await TestResult.find({ testSession: testId })
      .populate("student", "name phone")
      .sort({ score: -1 })
      .lean();

    // Calculate stats
    const stats = {
      totalStudents: classroom?.students?.length || 0,
      participated: results.length,
      completed: results.filter((r: any) => r.status === "submitted" || r.status === "timed_out").length,
      inProgress: results.filter((r: any) => r.status === "in_progress").length,
      averageScore: results.length > 0
        ? Math.round(results.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / results.length)
        : 0,
      highestScore: results.length > 0 ? Math.max(...results.map((r: any) => r.score || 0)) : 0,
      lowestScore: results.length > 0 ? Math.min(...results.map((r: any) => r.score || 0)) : 0,
    };

    res.status(200).json({
      success: true,
      data: {
        testSession,
        results,
        stats,
      },
    });
  } catch (error) {
    console.error("Error getting test results:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get real-time status of a test (for polling)
export const getTestStatus = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;

    const testSession = await TestSession.findById(testId).lean();
    if (!testSession) {
      res.status(404).json({ success: false, message: "Test session not found" });
      return;
    }

    // Check access for teachers
    const classroom = await Classroom.findById(testSession.classroom);
    if (user.role === ROLES.TEACHER && classroom && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    // Get result counts
    const [totalStudents, submittedCount, inProgressCount] = await Promise.all([
      Promise.resolve(classroom?.students?.length || 0),
      TestResult.countDocuments({ testSession: testId, status: { $in: ["submitted", "timed_out"] } }),
      TestResult.countDocuments({ testSession: testId, status: "in_progress" }),
    ]);

    // Get recent submissions
    const recentSubmissions = await TestResult.find({
      testSession: testId,
      status: { $in: ["submitted", "timed_out"] },
    })
      .populate("student", "name phone")
      .sort({ submittedAt: -1 })
      .limit(10)
      .select("student score attemptedQuestions correctAnswers submittedAt status")
      .lean();

    // Check if test should be auto-completed
    let status = testSession.status;
    if (status === "active" && testSession.endsAt && new Date() > new Date(testSession.endsAt)) {
      // Auto-complete the test
      await TestSession.updateOne({ _id: testId }, { status: "completed" });
      await TestResult.updateMany(
        { testSession: testId, status: "in_progress" },
        { status: "timed_out", submittedAt: new Date() }
      );
      status = "completed";
    }

    res.status(200).json({
      success: true,
      data: {
        _id: testSession._id,
        status,
        startedAt: testSession.startedAt,
        endsAt: testSession.endsAt,
        timeRemainingSeconds: testSession.endsAt 
          ? Math.max(0, Math.floor((new Date(testSession.endsAt).getTime() - Date.now()) / 1000))
          : null,
        totalStudents,
        submittedCount,
        inProgressCount,
        notStartedCount: totalStudents - submittedCount - inProgressCount,
        recentSubmissions,
      },
    });
  } catch (error) {
    console.error("Error getting test status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================================================
// Student Endpoints
// ============================================================

// Get active tests for student (for polling)
export const getActiveTestsForStudent = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;

    // Find all classrooms the student is in
    const classrooms = await Classroom.find({ students: user._id }).select("_id");
    const classroomIds = classrooms.map(c => c._id);

    if (classroomIds.length === 0) {
      res.status(200).json({
        success: true,
        data: [],
        message: "No active tests",
      });
      return;
    }

    // Find active tests for those classrooms
    const activeTests = await TestSession.find({
      classroom: { $in: classroomIds },
      status: "active",
      endsAt: { $gt: new Date() }, // Not expired
    })
      .populate("questionPaper", "title subject questionsCount")
      .populate("classroom", "name")
      .lean();

    // Check if student has already completed each test
    const testsWithStatus = await Promise.all(
      activeTests.map(async (test: any) => {
        const result = await TestResult.findOne({
          testSession: test._id,
          student: user._id,
        }).lean();

        return {
          _id: test._id,
          title: test.title,
          subject: test.questionPaper?.subject,
          questionsCount: test.questionPaper?.questionsCount || (test.questionPaper as any)?.questions?.length || 0,
          classroom: test.classroom?.name,
          timeLimitMinutes: test.timeLimitMinutes,
          startedAt: test.startedAt,
          endsAt: test.endsAt,
          timeRemainingSeconds: Math.max(0, Math.floor((new Date(test.endsAt).getTime() - Date.now()) / 1000)),
          studentStatus: result?.status || "not_started",
          canStart: !result || result.status === "not_started",
        };
      })
    );

    // Filter to only show tests student hasn't completed
    const availableTests = testsWithStatus.filter(t => t.canStart || t.studentStatus === "in_progress");

    res.status(200).json({
      success: true,
      data: availableTests,
    });
  } catch (error) {
    console.error("Error getting active tests for student:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Start test for student
export const startTestForStudent = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;

    const testSession = await TestSession.findById(testId)
      .populate("questionPaper")
      .lean();

    if (!testSession) {
      res.status(404).json({ success: false, message: "Test not found" });
      return;
    }

    // Check if test is active
    if (testSession.status !== "active") {
      res.status(400).json({ success: false, message: "Test is not active" });
      return;
    }

    // Check if test has expired
    if (testSession.endsAt && new Date() > new Date(testSession.endsAt)) {
      res.status(400).json({ success: false, message: "Test has expired" });
      return;
    }

    // Check if student is in the classroom
    const classroom = await Classroom.findById(testSession.classroom);
    if (!classroom || !classroom.students.some((s: any) => String(s) === String(user._id))) {
      res.status(403).json({ success: false, message: "You are not enrolled in this classroom" });
      return;
    }

    // Check if student already has a result
    let result = await TestResult.findOne({
      testSession: testId,
      student: user._id,
    });

    if (result && (result.status === "submitted" || result.status === "timed_out")) {
      res.status(400).json({ success: false, message: "You have already completed this test" });
      return;
    }

    const paper = testSession.questionPaper as any;
    const questions = paper?.questions || [];

    // Create or update result
    if (!result) {
      result = new TestResult({
        testSession: testId,
        student: user._id,
        totalQuestions: questions.length,
        status: "in_progress",
        startedAt: new Date(),
        answers: questions.map((q: any) => ({
          questionId: q._id,
          selectedIndex: null,
          isCorrect: false,
        })),
      });
      await result.save();
    } else if (result.status === "not_started") {
      result.status = "in_progress";
      result.startedAt = new Date();
      await result.save();
    }

    // Return questions without correct answers
    const questionsForStudent = questions.map((q: any, idx: number) => ({
      _id: q._id,
      index: idx,
      text: q.text,
      options: q.options,
      image: q.image,
    }));

    res.status(200).json({
      success: true,
      data: {
        testId: testSession._id,
        resultId: result._id,
        title: testSession.title,
        questions: questionsForStudent,
        totalQuestions: questions.length,
        timeRemainingSeconds: testSession.endsAt
          ? Math.max(0, Math.floor((new Date(testSession.endsAt).getTime() - Date.now()) / 1000))
          : testSession.timeLimitMinutes * 60,
        startedAt: result.startedAt,
      },
    });
  } catch (error) {
    console.error("Error starting test for student:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Submit test answers
export const submitTest = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers)) {
      res.status(400).json({ success: false, message: "Answers array is required" });
      return;
    }

    const testSession = await TestSession.findById(testId)
      .populate("questionPaper")
      .lean();

    if (!testSession) {
      res.status(404).json({ success: false, message: "Test not found" });
      return;
    }

    // Get student's result
    const result = await TestResult.findOne({
      testSession: testId,
      student: user._id,
    });

    if (!result) {
      res.status(400).json({ success: false, message: "You haven't started this test" });
      return;
    }

    if (result.status === "submitted" || result.status === "timed_out") {
      res.status(400).json({ success: false, message: "Test already submitted" });
      return;
    }

    const paper = testSession.questionPaper as any;
    const questions = paper?.questions || [];

    // Calculate score
    let correctCount = 0;
    let attemptedCount = 0;

    const processedAnswers = questions.map((q: any) => {
      const studentAnswer = answers.find((a: any) => String(a.questionId) === String(q._id));
      const selectedIndex = studentAnswer?.selectedIndex ?? null;
      const isCorrect = selectedIndex !== null && selectedIndex === q.correctIndex;

      if (selectedIndex !== null) {
        attemptedCount++;
        if (isCorrect) correctCount++;
      }

      return {
        questionId: q._id,
        selectedIndex,
        isCorrect,
        timeTaken: studentAnswer?.timeTaken || 0,
      };
    });

    const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

    result.answers = processedAnswers;
    result.attemptedQuestions = attemptedCount;
    result.correctAnswers = correctCount;
    result.wrongAnswers = attemptedCount - correctCount;
    result.score = score;
    result.status = "submitted";
    result.submittedAt = new Date();
    result.totalTimeTaken = result.startedAt
      ? Math.floor((Date.now() - new Date(result.startedAt).getTime()) / 1000)
      : 0;

    await result.save();

    // Mark student as completed in test session
    await TestSession.updateOne(
      { _id: testId },
      { $addToSet: { completedStudents: user._id } }
    );

    res.status(200).json({
      success: true,
      data: {
        score,
        correctAnswers: correctCount,
        wrongAnswers: attemptedCount - correctCount,
        totalQuestions: questions.length,
        attemptedQuestions: attemptedCount,
        timeTaken: result.totalTimeTaken,
      },
      message: "Test submitted successfully",
    });
  } catch (error) {
    console.error("Error submitting test:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get student's result for a test
export const getStudentResult = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;

    const result = await TestResult.findOne({
      testSession: testId,
      student: user._id,
    }).lean();

    if (!result) {
      res.status(404).json({ success: false, message: "Result not found" });
      return;
    }

    const testSession = await TestSession.findById(testId)
      .populate("questionPaper")
      .lean();

    const paper = testSession?.questionPaper as any;
    const questions = paper?.questions || [];

    // Include correct answers if test is completed
    const questionsWithAnswers = questions.map((q: any) => {
      const studentAnswer = result.answers.find((a: any) => String(a.questionId) === String(q._id));
      return {
        _id: q._id,
        text: q.text,
        options: q.options,
        image: q.image,
        correctIndex: q.correctIndex,
        selectedIndex: studentAnswer?.selectedIndex,
        isCorrect: studentAnswer?.isCorrect,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        testTitle: testSession?.title,
        score: result.score,
        correctAnswers: result.correctAnswers,
        wrongAnswers: result.wrongAnswers,
        totalQuestions: result.totalQuestions,
        attemptedQuestions: result.attemptedQuestions,
        timeTaken: result.totalTimeTaken,
        status: result.status,
        submittedAt: result.submittedAt,
        questions: questionsWithAnswers,
      },
    });
  } catch (error) {
    console.error("Error getting student result:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Delete/cancel a test session
export const deleteTestSession = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;

    const testSession = await TestSession.findById(testId);
    if (!testSession) {
      res.status(404).json({ success: false, message: "Test session not found" });
      return;
    }

    // Check access for teachers
    const classroom = await Classroom.findById(testSession.classroom);
    if (user.role === ROLES.TEACHER && classroom && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    // Delete associated results
    await TestResult.deleteMany({ testSession: testId });
    await TestSession.deleteOne({ _id: testId });

    res.status(200).json({
      success: true,
      message: "Test session deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting test session:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

