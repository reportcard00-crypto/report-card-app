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

// ============================================================
// Analytics Endpoints
// ============================================================

// Teacher Analytics - Overview Dashboard
export const getTeacherAnalytics = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;

    // Get all classrooms for this teacher
    let classroomFilter: any = {};
    if (user.role === ROLES.TEACHER) {
      classroomFilter = { teacher: user._id };
    } else if (req.query.teacherId) {
      classroomFilter = { teacher: req.query.teacherId };
    }

    const classrooms = await Classroom.find(classroomFilter)
      .populate("teacher", "name phone")
      .lean();
    const classroomIds = classrooms.map((c: any) => c._id);

    if (classroomIds.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          classTrend: [],
          latestTestSnapshot: null,
          weakChapters: [],
          studentSegmentation: { topPerformers: [], atRiskStudents: [] },
          insights: [],
          classrooms: [],
        },
      });
      return;
    }

    // Get test sessions for these classrooms
    const testSessions = await TestSession.find({
      classroom: { $in: classroomIds },
      status: { $in: ["completed", "active"] },
    })
      .populate("questionPaper", "title subject chapter questions")
      .populate("classroom", "name students")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Class trend - avg score over last 5 tests
    const classTrend: { testName: string; date: string; avgScore: number; participation: number }[] = [];
    const recentTests = testSessions.slice(0, 5);
    
    for (const session of recentTests) {
      const results = await TestResult.find({
        testSession: session._id,
        status: { $in: ["submitted", "timed_out"] },
      }).lean();
      
      const totalStudents = (session.classroom as any)?.students?.length || 0;
      const avgScore = results.length > 0
        ? Math.round(results.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / results.length)
        : 0;
      
      classTrend.push({
        testName: session.title,
        date: new Date(session.createdAt).toLocaleDateString(),
        avgScore,
        participation: totalStudents > 0 ? Math.round((results.length / totalStudents) * 100) : 0,
      });
    }

    // Latest test snapshot
    let latestTestSnapshot = null;
    if (testSessions.length > 0) {
      const latestSession = testSessions[0];
      const latestResults = await TestResult.find({
        testSession: latestSession._id,
        status: { $in: ["submitted", "timed_out"] },
      }).lean();
      
      const totalStudents = (latestSession.classroom as any)?.students?.length || 0;
      const avgScore = latestResults.length > 0
        ? Math.round(latestResults.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / latestResults.length)
        : 0;
      
      latestTestSnapshot = {
        testName: latestSession.title,
        subject: (latestSession.questionPaper as any)?.subject,
        avgScore,
        participationRate: totalStudents > 0 ? Math.round((latestResults.length / totalStudents) * 100) : 0,
        totalStudents,
        participated: latestResults.length,
        date: latestSession.createdAt,
      };
    }

    // Weak chapters analysis - aggregate performance by chapter
    const chapterPerformance: Record<string, { totalScore: number; count: number; subject: string }> = {};
    
    for (const session of testSessions) {
      const paper = session.questionPaper as any;
      if (!paper?.questions) continue;
      
      const results = await TestResult.find({
        testSession: session._id,
        status: { $in: ["submitted", "timed_out"] },
      }).lean();
      
      for (const result of results) {
        for (const answer of (result.answers || [])) {
          const question = paper.questions.find((q: any) => String(q._id) === String(answer.questionId));
          if (question?.chapter) {
            if (!chapterPerformance[question.chapter]) {
              chapterPerformance[question.chapter] = { totalScore: 0, count: 0, subject: question.subject };
            }
            chapterPerformance[question.chapter].count++;
            if (answer.isCorrect) {
              chapterPerformance[question.chapter].totalScore++;
            }
          }
        }
      }
    }
    
    const weakChapters = Object.entries(chapterPerformance)
      .map(([chapter, data]) => ({
        chapter,
        subject: data.subject,
        accuracy: data.count > 0 ? Math.round((data.totalScore / data.count) * 100) : 0,
        totalAttempts: data.count,
      }))
      .filter(c => c.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Student segmentation - top performers and at-risk students
    const studentPerformance: Record<string, { scores: number[]; name: string; phone: string }> = {};
    
    for (const session of testSessions.slice(0, 5)) {
      const results = await TestResult.find({
        testSession: session._id,
        status: { $in: ["submitted", "timed_out"] },
      })
        .populate("student", "name phone")
        .lean();
      
      for (const result of results) {
        const student = result.student as any;
        const studentId = String(student._id);
        if (!studentPerformance[studentId]) {
          studentPerformance[studentId] = {
            scores: [],
            name: student.name || "Unknown",
            phone: student.phone || "",
          };
        }
        studentPerformance[studentId].scores.push(result.score || 0);
      }
    }
    
    const studentsWithAvg = Object.entries(studentPerformance)
      .map(([id, data]) => {
        const avgScore = data.scores.length > 0
          ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
          : 0;
        const trend = data.scores.length >= 2
          ? data.scores[0] - data.scores[data.scores.length - 1]
          : 0;
        return {
          _id: id,
          name: data.name,
          phone: data.phone,
          avgScore,
          testsTaken: data.scores.length,
          trend,
          recentScores: data.scores.slice(0, 3),
        };
      });
    
    const topPerformers = studentsWithAvg
      .filter(s => s.avgScore >= 70)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);
    
    const atRiskStudents = studentsWithAvg
      .filter(s => s.avgScore < 50 || s.trend < -10)
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 5);

    // Generate insights
    const insights: string[] = [];
    
    if (weakChapters.length > 0) {
      insights.push(`Chapter "${weakChapters[0].chapter}" consistently has low accuracy (${weakChapters[0].accuracy}%)`);
    }
    
    if (classTrend.length >= 2) {
      const latestParticipation = classTrend[0]?.participation || 0;
      const prevParticipation = classTrend[1]?.participation || 0;
      if (latestParticipation < prevParticipation - 10) {
        insights.push(`Participation dropped by ${prevParticipation - latestParticipation}% in the last test`);
      }
    }
    
    if (atRiskStudents.length > 0) {
      insights.push(`${atRiskStudents.length} students are at-risk with declining performance`);
    }
    
    // Check for numerical vs conceptual performance
    const numericalChapters = Object.entries(chapterPerformance)
      .filter(([chapter]) => chapter.toLowerCase().includes("numerical") || chapter.toLowerCase().includes("problem"))
      .map(([chapter, data]) => ({
        chapter,
        accuracy: data.count > 0 ? Math.round((data.totalScore / data.count) * 100) : 0,
      }));
    
    if (numericalChapters.length > 0 && numericalChapters.some(c => c.accuracy < 50)) {
      insights.push("Numericals underperforming across the class");
    }

    res.status(200).json({
      success: true,
      data: {
        classTrend: classTrend.reverse(),
        latestTestSnapshot,
        weakChapters,
        studentSegmentation: { topPerformers, atRiskStudents },
        insights,
        classrooms: classrooms.map((c: any) => ({
          _id: c._id,
          name: c.name,
          studentsCount: c.students?.length || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting teacher analytics:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get Test Overview - detailed table view for a specific test or classroom
export const getTestOverview = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId, classroomId } = req.query;

    let testSessionFilter: any = {};
    
    if (testId) {
      testSessionFilter._id = testId;
    } else if (classroomId) {
      testSessionFilter.classroom = classroomId;
      testSessionFilter.status = { $in: ["completed", "active"] };
    } else {
      // Get teacher's classrooms
      let classroomFilter: any = {};
      if (user.role === ROLES.TEACHER) {
        classroomFilter = { teacher: user._id };
      }
      
      const classrooms = await Classroom.find(classroomFilter).select("_id");
      testSessionFilter.classroom = { $in: classrooms.map(c => c._id) };
      testSessionFilter.status = { $in: ["completed", "active"] };
    }

    const testSessions = await TestSession.find(testSessionFilter)
      .populate("questionPaper", "title subject chapter questions")
      .populate("classroom", "name students")
      .sort({ createdAt: -1 })
      .limit(1)
      .lean();

    if (testSessions.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          testSession: null,
          students: [],
        },
      });
      return;
    }

    const session = testSessions[0];
    const paper = session.questionPaper as any;

    // Get all results for this test
    const results = await TestResult.find({ testSession: session._id })
      .populate("student", "name phone")
      .sort({ score: -1 })
      .lean();

    // Calculate per-student chapter weaknesses
    const students = results.map((result: any) => {
      const chapterAccuracy: Record<string, { correct: number; total: number }> = {};
      
      for (const answer of (result.answers || [])) {
        const question = paper?.questions?.find((q: any) => String(q._id) === String(answer.questionId));
        if (question?.chapter) {
          if (!chapterAccuracy[question.chapter]) {
            chapterAccuracy[question.chapter] = { correct: 0, total: 0 };
          }
          chapterAccuracy[question.chapter].total++;
          if (answer.isCorrect) {
            chapterAccuracy[question.chapter].correct++;
          }
        }
      }
      
      const weakChapters = Object.entries(chapterAccuracy)
        .filter(([_, data]) => data.total > 0 && (data.correct / data.total) < 0.5)
        .map(([chapter]) => chapter);

      return {
        _id: result.student?._id,
        name: result.student?.name || "Unknown",
        phone: result.student?.phone || "",
        score: result.score,
        accuracy: result.totalQuestions > 0
          ? Math.round((result.correctAnswers / result.totalQuestions) * 100)
          : 0,
        weakChapters,
        timeUsed: result.totalTimeTaken,
        status: result.status,
        correctAnswers: result.correctAnswers,
        wrongAnswers: result.wrongAnswers,
        attemptedQuestions: result.attemptedQuestions,
        totalQuestions: result.totalQuestions,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        testSession: {
          _id: session._id,
          title: session.title,
          subject: paper?.subject,
          chapter: paper?.chapter,
          status: session.status,
          startedAt: session.startedAt,
          totalStudents: (session.classroom as any)?.students?.length || 0,
          participated: results.length,
        },
        students,
      },
    });
  } catch (error) {
    console.error("Error getting test overview:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================================================
// Student Analytics Endpoints
// ============================================================

// Get student dashboard analytics - overall performance, strengths, weaknesses, insights
export const getStudentDashboard = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const studentId = user._id;

    // Get all test results for this student (last 10 tests)
    const testResults = await TestResult.find({
      student: studentId,
      status: { $in: ["submitted", "timed_out"] },
    })
      .sort({ submittedAt: -1 })
      .limit(10)
      .lean();

    // Get test sessions with question paper details
    const testSessionIds = testResults.map((r: any) => r.testSession);
    const testSessions = await TestSession.find({ _id: { $in: testSessionIds } })
      .populate("questionPaper", "title subject chapter questions")
      .populate("classroom", "name")
      .lean();

    const sessionMap = new Map(testSessions.map((s: any) => [String(s._id), s]));

    // Calculate KPIs
    const last5Results = testResults.slice(0, 5);
    const avgScore = last5Results.length > 0
      ? Math.round(last5Results.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / last5Results.length)
      : 0;

    const totalAttempted = last5Results.reduce((sum: number, r: any) => sum + (r.attemptedQuestions || 0), 0);
    const totalQuestions = last5Results.reduce((sum: number, r: any) => sum + (r.totalQuestions || 0), 0);
    const accuracyPercent = totalAttempted > 0
      ? Math.round((last5Results.reduce((sum: number, r: any) => sum + (r.correctAnswers || 0), 0) / totalAttempted) * 100)
      : 0;

    // Get classrooms for this student to count assigned vs attempted tests
    const classrooms = await Classroom.find({ students: studentId }).select("_id");
    const classroomIds = classrooms.map((c: any) => c._id);
    const assignedTestsCount = await TestSession.countDocuments({
      classroom: { $in: classroomIds },
      status: { $in: ["active", "completed"] },
    });

    // Performance trend (last 5 tests)
    const performanceTrend = last5Results.map((result: any) => {
      const session = sessionMap.get(String(result.testSession));
      return {
        testId: result.testSession,
        testName: session?.title || "Unknown Test",
        subject: (session?.questionPaper as any)?.subject || "Unknown",
        score: result.score || 0,
        accuracy: result.attemptedQuestions > 0 
          ? Math.round((result.correctAnswers / result.attemptedQuestions) * 100) 
          : 0,
        date: result.submittedAt,
      };
    }).reverse(); // Oldest to newest for chart

    // Chapter-wise performance analysis
    const chapterPerformance: Record<string, { 
      subject: string; 
      correct: number; 
      total: number; 
      recentTrend: number[];
    }> = {};

    // Analyze each test result's answers by chapter
    for (const result of testResults) {
      const session = sessionMap.get(String(result.testSession));
      const paper = session?.questionPaper as any;
      if (!paper?.questions) continue;

      for (const answer of (result.answers || [])) {
        const question = paper.questions.find((q: any) => String(q._id) === String(answer.questionId));
        if (question?.chapter) {
          const chapterKey = `${question.subject}::${question.chapter}`;
          if (!chapterPerformance[chapterKey]) {
            chapterPerformance[chapterKey] = {
              subject: question.subject,
              correct: 0,
              total: 0,
              recentTrend: [],
            };
          }
          chapterPerformance[chapterKey].total++;
          if (answer.isCorrect) {
            chapterPerformance[chapterKey].correct++;
          }
        }
      }
    }

    // Calculate strengths and weaknesses
    const chapterStats = Object.entries(chapterPerformance)
      .map(([key, data]) => {
        const [subject, chapter] = key.split("::");
        return {
          subject,
          chapter,
          accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
          totalAttempted: data.total,
          correctCount: data.correct,
        };
      })
      .filter(c => c.totalAttempted >= 2); // Only include chapters with at least 2 questions

    const strengths = chapterStats
      .filter(c => c.accuracy >= 70)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5);

    const weaknesses = chapterStats
      .filter(c => c.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Generate insights based on recent performance
    const insights: { type: "improvement" | "warning" | "info"; message: string }[] = [];

    // Check for improving chapters (compare first half vs second half of results)
    if (testResults.length >= 4) {
      const recentChapterPerf: Record<string, number[]> = {};
      
      testResults.forEach((result: any, idx: number) => {
        const session = sessionMap.get(String(result.testSession));
        const paper = session?.questionPaper as any;
        if (!paper?.questions) return;

        for (const answer of (result.answers || [])) {
          const question = paper.questions.find((q: any) => String(q._id) === String(answer.questionId));
          if (question?.chapter) {
            const key = `${question.subject}::${question.chapter}`;
            if (!recentChapterPerf[key]) {
              recentChapterPerf[key] = [];
            }
            recentChapterPerf[key].push(answer.isCorrect ? 1 : 0);
          }
        }
      });

      // Find improving or declining chapters
      Object.entries(recentChapterPerf).forEach(([key, scores]) => {
        if (scores.length >= 4) {
          const firstHalf = scores.slice(Math.floor(scores.length / 2));
          const secondHalf = scores.slice(0, Math.floor(scores.length / 2));
          const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          const [subject, chapter] = key.split("::");

          if (secondAvg - firstAvg > 0.2) {
            insights.push({
              type: "improvement",
              message: `Your accuracy in ${chapter} has improved over recent tests`,
            });
          } else if (firstAvg - secondAvg > 0.2) {
            insights.push({
              type: "warning",
              message: `${chapter} needs attention - accuracy has declined recently`,
            });
          }
        }
      });
    }

    // Add weak chapter insight
    if (weaknesses.length > 0) {
      insights.push({
        type: "warning",
        message: `${weaknesses[0].chapter} remains a weak area (${weaknesses[0].accuracy}% accuracy)`,
      });
    }

    // Check score trend
    if (performanceTrend.length >= 3) {
      const recentScores = performanceTrend.slice(-3);
      const isImproving = recentScores.every((s, i) => i === 0 || s.score >= recentScores[i - 1].score);
      const isDeclining = recentScores.every((s, i) => i === 0 || s.score <= recentScores[i - 1].score);

      if (isImproving && recentScores[recentScores.length - 1].score > recentScores[0].score) {
        insights.push({
          type: "improvement",
          message: "Great progress! Your scores have been consistently improving",
        });
      } else if (isDeclining && recentScores[recentScores.length - 1].score < recentScores[0].score) {
        insights.push({
          type: "warning",
          message: "Your recent scores are declining - consider revising weak areas",
        });
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];

    // Recommend revision of weak chapters
    if (weaknesses.length > 0) {
      const weakChapters = weaknesses.slice(0, 2).map(w => w.chapter);
      recommendations.push(`Revise chapters: ${weakChapters.join(", ")}`);
    }

    // Check for low attempted questions
    const recentAttemptRate = last5Results.length > 0
      ? Math.round((totalAttempted / totalQuestions) * 100)
      : 100;
    if (recentAttemptRate < 80) {
      recommendations.push("Try to attempt more questions - even educated guesses can help");
    }

    // Subject-specific recommendations
    const subjectPerformance: Record<string, { correct: number; total: number }> = {};
    chapterStats.forEach(c => {
      if (!subjectPerformance[c.subject]) {
        subjectPerformance[c.subject] = { correct: 0, total: 0 };
      }
      subjectPerformance[c.subject].correct += c.correctCount;
      subjectPerformance[c.subject].total += c.totalAttempted;
    });

    Object.entries(subjectPerformance).forEach(([subject, data]) => {
      const acc = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      if (acc < 50) {
        recommendations.push(`Focus on ${subject} - consider practicing more problems`);
      }
    });

    // Get recent test history
    const recentTests = testResults.slice(0, 5).map((result: any) => {
      const session = sessionMap.get(String(result.testSession));
      return {
        _id: result.testSession,
        testName: session?.title || "Unknown Test",
        subject: (session?.questionPaper as any)?.subject || "Unknown",
        classroom: (session?.classroom as any)?.name || "Unknown",
        score: result.score,
        correctAnswers: result.correctAnswers,
        totalQuestions: result.totalQuestions,
        attemptedQuestions: result.attemptedQuestions,
        timeTaken: result.totalTimeTaken,
        submittedAt: result.submittedAt,
        status: result.status,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          avgScore,
          accuracyPercent,
          testsAttempted: testResults.length,
          testsAssigned: assignedTestsCount,
        },
        performanceTrend,
        strengths,
        weaknesses,
        insights: insights.slice(0, 5), // Limit to 5 insights
        recommendations: recommendations.slice(0, 4), // Limit to 4 recommendations
        recentTests,
      },
    });
  } catch (error) {
    console.error("Error getting student dashboard:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get detailed test result with chapter breakdown and analysis
export const getStudentTestDetail = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { testId } = req.params;

    // Get student's result
    const result = await TestResult.findOne({
      testSession: testId,
      student: user._id,
    }).lean();

    if (!result) {
      res.status(404).json({ success: false, message: "Result not found" });
      return;
    }

    // Get test session with question paper
    const testSession = await TestSession.findById(testId)
      .populate("questionPaper")
      .populate("classroom", "name")
      .lean();

    if (!testSession) {
      res.status(404).json({ success: false, message: "Test not found" });
      return;
    }

    const paper = testSession.questionPaper as any;
    const questions = paper?.questions || [];

    // Calculate scorecard
    const skipped = result.totalQuestions - result.attemptedQuestions;
    const scorecard = {
      score: result.score,
      correctAnswers: result.correctAnswers,
      wrongAnswers: result.wrongAnswers,
      skipped,
      totalQuestions: result.totalQuestions,
      attemptedQuestions: result.attemptedQuestions,
      accuracy: result.attemptedQuestions > 0
        ? Math.round((result.correctAnswers / result.attemptedQuestions) * 100)
        : 0,
      timeTaken: result.totalTimeTaken,
      avgTimePerQuestion: result.totalQuestions > 0
        ? Math.round(result.totalTimeTaken / result.totalQuestions)
        : 0,
    };

    // Chapter-wise breakdown
    const chapterBreakdown: Record<string, {
      chapter: string;
      subject: string;
      correct: number;
      wrong: number;
      skipped: number;
      total: number;
      accuracy: number;
    }> = {};

    // Question type breakdown
    const questionTypeBreakdown: Record<string, {
      type: string;
      correct: number;
      wrong: number;
      skipped: number;
      total: number;
      accuracy: number;
    }> = {
      objective: { type: "MCQ", correct: 0, wrong: 0, skipped: 0, total: 0, accuracy: 0 },
      subjective: { type: "Subjective", correct: 0, wrong: 0, skipped: 0, total: 0, accuracy: 0 },
    };

    // Difficulty breakdown
    const difficultyBreakdown: Record<string, {
      difficulty: string;
      correct: number;
      wrong: number;
      skipped: number;
      total: number;
      accuracy: number;
    }> = {
      easy: { difficulty: "Easy", correct: 0, wrong: 0, skipped: 0, total: 0, accuracy: 0 },
      medium: { difficulty: "Medium", correct: 0, wrong: 0, skipped: 0, total: 0, accuracy: 0 },
      hard: { difficulty: "Hard", correct: 0, wrong: 0, skipped: 0, total: 0, accuracy: 0 },
    };

    // Mistake patterns
    const mistakePatterns: {
      chapter: string;
      count: number;
      questions: { text: string; correctAnswer: string; yourAnswer: string }[];
    }[] = [];

    const chapterMistakes: Record<string, { count: number; questions: any[] }> = {};

    // Analyze each question
    for (const question of questions) {
      const answer = result.answers.find((a: any) => String(a.questionId) === String(question._id));
      const isAttempted = answer?.selectedIndex !== null && answer?.selectedIndex !== undefined;
      const isCorrect = answer?.isCorrect || false;

      // Chapter breakdown
      const chapterKey = question.chapter || "Uncategorized";
      if (!chapterBreakdown[chapterKey]) {
        chapterBreakdown[chapterKey] = {
          chapter: chapterKey,
          subject: question.subject || paper.subject,
          correct: 0,
          wrong: 0,
          skipped: 0,
          total: 0,
          accuracy: 0,
        };
      }
      chapterBreakdown[chapterKey].total++;
      if (!isAttempted) {
        chapterBreakdown[chapterKey].skipped++;
      } else if (isCorrect) {
        chapterBreakdown[chapterKey].correct++;
      } else {
        chapterBreakdown[chapterKey].wrong++;

        // Track mistake for pattern analysis
        if (!chapterMistakes[chapterKey]) {
          chapterMistakes[chapterKey] = { count: 0, questions: [] };
        }
        chapterMistakes[chapterKey].count++;
        if (chapterMistakes[chapterKey].questions.length < 2) {
          chapterMistakes[chapterKey].questions.push({
            text: question.text?.substring(0, 100) + (question.text?.length > 100 ? "..." : ""),
            correctAnswer: question.options?.[question.correctIndex] || "N/A",
            yourAnswer: question.options?.[answer?.selectedIndex] || "N/A",
          });
        }
      }

      // Question type breakdown
      const qType = question.questionType || "objective";
      if (questionTypeBreakdown[qType]) {
        questionTypeBreakdown[qType].total++;
        if (!isAttempted) {
          questionTypeBreakdown[qType].skipped++;
        } else if (isCorrect) {
          questionTypeBreakdown[qType].correct++;
        } else {
          questionTypeBreakdown[qType].wrong++;
        }
      }

      // Difficulty breakdown
      const difficulty = question.difficulty || "medium";
      if (difficultyBreakdown[difficulty]) {
        difficultyBreakdown[difficulty].total++;
        if (!isAttempted) {
          difficultyBreakdown[difficulty].skipped++;
        } else if (isCorrect) {
          difficultyBreakdown[difficulty].correct++;
        } else {
          difficultyBreakdown[difficulty].wrong++;
        }
      }
    }

    // Calculate accuracies for breakdowns
    Object.values(chapterBreakdown).forEach(ch => {
      const attempted = ch.correct + ch.wrong;
      ch.accuracy = attempted > 0 ? Math.round((ch.correct / attempted) * 100) : 0;
    });

    Object.values(questionTypeBreakdown).forEach(qt => {
      const attempted = qt.correct + qt.wrong;
      qt.accuracy = attempted > 0 ? Math.round((qt.correct / attempted) * 100) : 0;
    });

    Object.values(difficultyBreakdown).forEach(d => {
      const attempted = d.correct + d.wrong;
      d.accuracy = attempted > 0 ? Math.round((d.correct / attempted) * 100) : 0;
    });

    // Build mistake patterns array
    Object.entries(chapterMistakes)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 3)
      .forEach(([chapter, data]) => {
        mistakePatterns.push({
          chapter,
          count: data.count,
          questions: data.questions,
        });
      });

    // Generate test-specific recommendations
    const recommendations: string[] = [];

    const sortedChapters = Object.values(chapterBreakdown).sort((a, b) => a.accuracy - b.accuracy);
    if (sortedChapters.length > 0 && sortedChapters[0].accuracy < 50) {
      recommendations.push(`Focus on ${sortedChapters[0].chapter} - needs significant improvement`);
    }

    if (scorecard.skipped > 2) {
      recommendations.push(`You skipped ${scorecard.skipped} questions - try to attempt all questions next time`);
    }

    const hardAccuracy = difficultyBreakdown.hard?.accuracy || 0;
    const easyAccuracy = difficultyBreakdown.easy?.accuracy || 0;
    if (hardAccuracy < 30 && difficultyBreakdown.hard?.total > 0) {
      recommendations.push("Practice more challenging problems to improve on hard questions");
    }
    if (easyAccuracy < 70 && difficultyBreakdown.easy?.total > 0) {
      recommendations.push("Review fundamentals - easy questions need more attention");
    }

    // Questions with answers for review
    const questionsWithAnswers = questions.map((q: any) => {
      const studentAnswer = result.answers.find((a: any) => String(a.questionId) === String(q._id));
      return {
        _id: q._id,
        text: q.text,
        options: q.options,
        image: q.image,
        chapter: q.chapter,
        difficulty: q.difficulty,
        questionType: q.questionType || "objective",
        correctIndex: q.correctIndex,
        selectedIndex: studentAnswer?.selectedIndex ?? null,
        isCorrect: studentAnswer?.isCorrect || false,
        timeTaken: studentAnswer?.timeTaken || 0,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        testInfo: {
          _id: testSession._id,
          title: testSession.title,
          subject: paper?.subject,
          chapter: paper?.chapter,
          classroom: (testSession.classroom as any)?.name,
          submittedAt: result.submittedAt,
          status: result.status,
        },
        scorecard,
        chapterBreakdown: Object.values(chapterBreakdown),
        questionTypeBreakdown: Object.values(questionTypeBreakdown).filter(qt => qt.total > 0),
        difficultyBreakdown: Object.values(difficultyBreakdown).filter(d => d.total > 0),
        mistakePatterns,
        recommendations,
        questions: questionsWithAnswers,
      },
    });
  } catch (error) {
    console.error("Error getting student test detail:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Admin Analytics - School-wide Dashboard
export const getAdminAnalytics = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    
    if (user.role !== ROLES.ADMIN) {
      res.status(403).json({ success: false, message: "Admin access required" });
      return;
    }

    // Get all classrooms
    const classrooms = await Classroom.find()
      .populate("teacher", "name phone")
      .lean();

    // Get all completed test sessions
    const testSessions = await TestSession.find({
      status: { $in: ["completed", "active"] },
    })
      .populate("questionPaper", "title subject chapter")
      .populate("classroom", "name students teacher")
      .populate("createdBy", "name phone")
      .sort({ createdAt: -1 })
      .lean();

    // Subject-wise analytics
    const subjectStats: Record<string, {
      scores: number[];
      participationRates: number[];
      testCount: number;
    }> = {};

    for (const session of testSessions) {
      const paper = session.questionPaper as any;
      const subject = paper?.subject || "Unknown";
      
      if (!subjectStats[subject]) {
        subjectStats[subject] = { scores: [], participationRates: [], testCount: 0 };
      }
      
      const results = await TestResult.find({
        testSession: session._id,
        status: { $in: ["submitted", "timed_out"] },
      }).lean();
      
      const totalStudents = (session.classroom as any)?.students?.length || 0;
      
      if (results.length > 0) {
        const avgScore = Math.round(results.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / results.length);
        subjectStats[subject].scores.push(avgScore);
        subjectStats[subject].participationRates.push(
          totalStudents > 0 ? Math.round((results.length / totalStudents) * 100) : 0
        );
        subjectStats[subject].testCount++;
      }
    }

    const subjectTiles = Object.entries(subjectStats).map(([subject, stats]) => {
      const recentScores = stats.scores.slice(0, 5);
      const avgScore = recentScores.length > 0
        ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
        : 0;
      const participation = stats.participationRates.length > 0
        ? Math.round(stats.participationRates.reduce((a, b) => a + b, 0) / stats.participationRates.length)
        : 0;
      
      // Calculate trend (comparing first half to second half of recent scores)
      let trend: "improving" | "declining" | "stable" = "stable";
      if (recentScores.length >= 4) {
        const firstHalf = recentScores.slice(0, Math.floor(recentScores.length / 2));
        const secondHalf = recentScores.slice(Math.floor(recentScores.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        if (secondAvg - firstAvg > 5) trend = "improving";
        else if (firstAvg - secondAvg > 5) trend = "declining";
      }
      
      return {
        subject,
        avgScore,
        participation,
        trend,
        testCount: stats.testCount,
        recentScores,
      };
    });

    // Teacher overview
    const teacherStats: Record<string, {
      name: string;
      phone: string;
      testsCount: number;
      scores: number[];
      lastTestDate: Date | null;
    }> = {};

    for (const session of testSessions) {
      const classroom = session.classroom as any;
      const teacherId = String(classroom?.teacher?._id || classroom?.teacher || session.createdBy);
      const teacherInfo = classroom?.teacher || session.createdBy;
      
      if (!teacherStats[teacherId]) {
        teacherStats[teacherId] = {
          name: (teacherInfo as any)?.name || "Unknown",
          phone: (teacherInfo as any)?.phone || "",
          testsCount: 0,
          scores: [],
          lastTestDate: null,
        };
      }
      
      teacherStats[teacherId].testsCount++;
      
      if (!teacherStats[teacherId].lastTestDate || new Date(session.createdAt) > teacherStats[teacherId].lastTestDate!) {
        teacherStats[teacherId].lastTestDate = new Date(session.createdAt);
      }
      
      const results = await TestResult.find({
        testSession: session._id,
        status: { $in: ["submitted", "timed_out"] },
      }).lean();
      
      if (results.length > 0) {
        const avgScore = Math.round(results.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / results.length);
        teacherStats[teacherId].scores.push(avgScore);
      }
    }

    const teacherOverview = Object.entries(teacherStats).map(([teacherId, stats]) => {
      const avgScore = stats.scores.length > 0
        ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
        : 0;
      
      // Calculate improvement trend
      let trend: "improving" | "declining" | "stable" = "stable";
      if (stats.scores.length >= 4) {
        const firstHalf = stats.scores.slice(Math.floor(stats.scores.length / 2));
        const secondHalf = stats.scores.slice(0, Math.floor(stats.scores.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        if (secondAvg - firstAvg > 5) trend = "improving";
        else if (firstAvg - secondAvg > 5) trend = "declining";
      }
      
      return {
        _id: teacherId,
        name: stats.name,
        phone: stats.phone,
        testsCount: stats.testsCount,
        avgScore,
        trend,
        lastTestDate: stats.lastTestDate,
      };
    }).sort((a, b) => b.testsCount - a.testsCount);

    // Generate admin insights
    const insights: string[] = [];
    
    // Subject insights
    const improvingSubjects = subjectTiles.filter(s => s.trend === "improving");
    const decliningSubjects = subjectTiles.filter(s => s.trend === "declining");
    
    if (improvingSubjects.length > 0 && decliningSubjects.length > 0) {
      insights.push(`${improvingSubjects[0].subject} improving, ${decliningSubjects[0].subject} needs attention`);
    } else if (improvingSubjects.length > 0) {
      insights.push(`${improvingSubjects[0].subject} showing consistent improvement`);
    } else if (decliningSubjects.length > 0) {
      insights.push(`${decliningSubjects[0].subject} performance declining - needs intervention`);
    }
    
    // Teacher insights
    const activeTeachers = teacherOverview.filter(t => {
      if (!t.lastTestDate) return false;
      const daysSinceLastTest = (Date.now() - new Date(t.lastTestDate).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLastTest < 14;
    });
    
    const inactiveTeachers = teacherOverview.filter(t => {
      if (!t.lastTestDate) return true;
      const daysSinceLastTest = (Date.now() - new Date(t.lastTestDate).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLastTest >= 14;
    });
    
    if (activeTeachers.length > 0 && inactiveTeachers.length > 0) {
      insights.push(`${activeTeachers.length} teachers active, ${inactiveTeachers.length} teachers inactive (>2 weeks)`);
    }
    
    // Participation insight
    const lowParticipationSubjects = subjectTiles.filter(s => s.participation < 70);
    if (lowParticipationSubjects.length > 0) {
      insights.push(`Participation risk in ${lowParticipationSubjects.map(s => s.subject).join(", ")}`);
    }

    // Overall stats
    const totalTests = testSessions.length;
    const totalStudents = new Set(
      classrooms.flatMap((c: any) => (c.students || []).map((s: any) => String(s)))
    ).size;
    const totalTeachers = Object.keys(teacherStats).length;

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalTests,
          totalStudents,
          totalTeachers,
          totalClassrooms: classrooms.length,
        },
        subjectTiles,
        teacherOverview,
        insights,
      },
    });
  } catch (error) {
    console.error("Error getting admin analytics:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
