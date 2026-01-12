import type { Response } from "express";
import type { CustomRequest } from "../types/index";
import type { UserModel } from "../types/userModel";
import Classroom from "../models/classroomModel";
import User from "../models/userModel";
import ROLES from "../types/roles";

// Create a new classroom
export const createClassroom = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, message: "Classroom name is required" });
      return;
    }

    // Check if classroom with same name already exists for this teacher
    const existing = await Classroom.findOne({ name: name.trim(), teacher: user._id });
    if (existing) {
      res.status(400).json({ success: false, message: "You already have a classroom with this name" });
      return;
    }

    const classroom = new Classroom({
      name: name.trim(),
      description: description?.trim() || "",
      teacher: user._id,
      students: [],
    });

    await classroom.save();

    res.status(201).json({
      success: true,
      data: {
        _id: classroom._id,
        name: classroom.name,
        description: classroom.description,
        studentsCount: 0,
        createdAt: classroom.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating classroom:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// List classrooms for the current teacher (or all for admin)
export const listClassrooms = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const search = String(req.query.search || "").trim();

    // Build filter - teachers see only their classrooms, admins see all
    const filter: any = {};
    if (user.role === ROLES.TEACHER) {
      filter.teacher = user._id;
    } else if (req.query.teacherId) {
      filter.teacher = req.query.teacherId;
    }

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const [classrooms, total] = await Promise.all([
      Classroom.find(filter)
        .populate("teacher", "name phone")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Classroom.countDocuments(filter),
    ]);

    const data = classrooms.map((c: any) => ({
      _id: c._id,
      name: c.name,
      description: c.description,
      teacher: c.teacher,
      studentsCount: c.students?.length || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    res.status(200).json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error listing classrooms:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get a single classroom with all students
export const getClassroom = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId)
      .populate("teacher", "name phone")
      .populate("students", "name phone createdAt")
      .lean();

    if (!classroom) {
      res.status(404).json({ success: false, message: "Classroom not found" });
      return;
    }

    // Check access - teachers can only view their own classrooms
    if (user.role === ROLES.TEACHER && String(classroom.teacher._id) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    res.status(200).json({
      success: true,
      data: classroom,
    });
  } catch (error) {
    console.error("Error getting classroom:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Update classroom (name, description)
export const updateClassroom = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { classroomId } = req.params;
    const { name, description } = req.body;

    const classroom = await Classroom.findById(classroomId);

    if (!classroom) {
      res.status(404).json({ success: false, message: "Classroom not found" });
      return;
    }

    // Check access - teachers can only update their own classrooms
    if (user.role === ROLES.TEACHER && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    if (name && name.trim()) {
      // Check if another classroom with the same name exists for this teacher
      const existing = await Classroom.findOne({
        name: name.trim(),
        teacher: classroom.teacher,
        _id: { $ne: classroomId },
      });
      if (existing) {
        res.status(400).json({ success: false, message: "A classroom with this name already exists" });
        return;
      }
      classroom.name = name.trim();
    }

    if (description !== undefined) {
      classroom.description = description?.trim() || "";
    }

    await classroom.save();

    res.status(200).json({
      success: true,
      data: {
        _id: classroom._id,
        name: classroom.name,
        description: classroom.description,
        studentsCount: classroom.students.length,
        updatedAt: classroom.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating classroom:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Delete classroom
export const deleteClassroom = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId);

    if (!classroom) {
      res.status(404).json({ success: false, message: "Classroom not found" });
      return;
    }

    // Check access - teachers can only delete their own classrooms
    if (user.role === ROLES.TEACHER && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    await Classroom.deleteOne({ _id: classroomId });

    res.status(200).json({
      success: true,
      message: "Classroom deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting classroom:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Search users by name or phone (for adding to classroom)
export const searchUsers = async (req: CustomRequest, res: Response) => {
  try {
    const search = String(req.query.q || "").trim();
    const limit = Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50);

    if (!search || search.length < 2) {
      res.status(400).json({ success: false, message: "Search query must be at least 2 characters" });
      return;
    }

    // Search by name or phone
    const users = await User.find({
      isPhoneVerified: true,
      role: ROLES.USER, // Only search for users (students)
      $or: [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ],
    })
      .select("_id name phone createdAt")
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Add a student to classroom
export const addStudentToClassroom = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { classroomId } = req.params;
    const { userId, phone, name } = req.body;

    const classroom = await Classroom.findById(classroomId);

    if (!classroom) {
      res.status(404).json({ success: false, message: "Classroom not found" });
      return;
    }

    // Check access
    if (user.role === ROLES.TEACHER && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    let studentToAdd: any = null;

    // Find user by userId, phone, or name
    if (userId) {
      studentToAdd = await User.findById(userId);
    } else if (phone) {
      studentToAdd = await User.findOne({ phone: phone.trim() });
    } else if (name) {
      // Find first user matching name
      studentToAdd = await User.findOne({ name: { $regex: `^${name.trim()}$`, $options: "i" } });
    }

    if (!studentToAdd) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Check if user is already in classroom
    if (classroom.students.some((s: any) => String(s) === String(studentToAdd._id))) {
      res.status(400).json({ success: false, message: "User is already in this classroom" });
      return;
    }

    classroom.students.push(studentToAdd._id);
    await classroom.save();

    res.status(200).json({
      success: true,
      data: {
        _id: studentToAdd._id,
        name: studentToAdd.name,
        phone: studentToAdd.phone,
      },
      studentsCount: classroom.students.length,
      message: "Student added successfully",
    });
  } catch (error) {
    console.error("Error adding student to classroom:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Remove a student from classroom
export const removeStudentFromClassroom = async (req: CustomRequest, res: Response) => {
  try {
    const user = req.user as unknown as UserModel;
    const { classroomId, userId } = req.params;

    const classroom = await Classroom.findById(classroomId);

    if (!classroom) {
      res.status(404).json({ success: false, message: "Classroom not found" });
      return;
    }

    // Check access
    if (user.role === ROLES.TEACHER && String(classroom.teacher) !== String(user._id)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    const studentIndex = classroom.students.findIndex((s: any) => String(s) === userId);
    if (studentIndex === -1) {
      res.status(404).json({ success: false, message: "Student not found in classroom" });
      return;
    }

    classroom.students.splice(studentIndex, 1);
    await classroom.save();

    res.status(200).json({
      success: true,
      message: "Student removed successfully",
      studentsCount: classroom.students.length,
    });
  } catch (error) {
    console.error("Error removing student from classroom:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

