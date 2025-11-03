import type { Request, Response } from "express";
import User from "../models/userModel";
import ROLES from "../types/roles";

export const listUsers = async (req: Request, res: Response) => {
  try {
    const { search, role, page = "1", limit = "20" } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(parseInt(String(page || "1"), 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit || "20"), 10) || 20, 1), 100);

    const query: Record<string, unknown> = {};

    if (search && String(search).trim().length > 0) {
      const s = String(search).trim();
      query.$or = [
        { name: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } },
      ];
    }

    if (role && Object.values(ROLES).includes(role as any)) {
      query.role = role;
    }

    const [items, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select("name phone role isPhoneVerified createdAt"),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const { role } = (req.body || {}) as { role?: string };

    if (!role || !Object.values(ROLES).includes(role as any)) {
      res.status(400).json({ success: false, message: "Invalid role" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role, updatedAt: new Date() },
      { new: true }
    ).select("name phone role isPhoneVerified");

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


