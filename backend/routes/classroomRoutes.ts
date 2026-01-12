import { Router } from "express";
import {
  createClassroom,
  listClassrooms,
  getClassroom,
  updateClassroom,
  deleteClassroom,
  searchUsers,
  addStudentToClassroom,
  removeStudentFromClassroom,
} from "../controllers/classroomController";
import { isAuthenticated, isAdminOrTeacher } from "../middlewares/auth";

const classroomRouter = Router();

// Search users to add to classroom (must be before /:classroomId routes)
classroomRouter.get("/users/search", isAuthenticated, isAdminOrTeacher, searchUsers);

// CRUD operations
classroomRouter.post("/", isAuthenticated, isAdminOrTeacher, createClassroom);
classroomRouter.get("/", isAuthenticated, isAdminOrTeacher, listClassrooms);
classroomRouter.get("/:classroomId", isAuthenticated, isAdminOrTeacher, getClassroom);
classroomRouter.put("/:classroomId", isAuthenticated, isAdminOrTeacher, updateClassroom);
classroomRouter.delete("/:classroomId", isAuthenticated, isAdminOrTeacher, deleteClassroom);

// Student management
classroomRouter.post("/:classroomId/students", isAuthenticated, isAdminOrTeacher, addStudentToClassroom);
classroomRouter.delete("/:classroomId/students/:userId", isAuthenticated, isAdminOrTeacher, removeStudentFromClassroom);

export default classroomRouter;

