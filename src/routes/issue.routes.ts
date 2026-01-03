import { Router } from "express";
import { body } from "express-validator";
import {
  getAllIssues,
  getIssueById,
  createIssue,
  updateIssue,
  deleteIssue,
} from "../controllers/issue.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authMiddleware, getAllIssues);
router.get("/:id", authMiddleware, getIssueById);

router.post(
  "/",
  [
    authMiddleware,
    body("title", "Title is required").notEmpty(),
    body("description", "Description is required").notEmpty(),
    body("priority").optional().isIn(["Low", "Medium", "High", "Critical"]),
    body("severity").optional().isIn(["Minor", "Major", "Critical"]),
  ],
  createIssue
);

router.put("/:id", authMiddleware, updateIssue);
router.delete("/:id", authMiddleware, deleteIssue);

export default router;
