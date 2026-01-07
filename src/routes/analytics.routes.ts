import { Router } from "express";
import {
  getGeneralAnalytics,
  getUserAnalytics,
} from "../controllers/analytics.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// General analytics endpoint
router.get("/", authMiddleware, getGeneralAnalytics);

// User-specific analytics endpoint
router.get("/user/:userId", authMiddleware, getUserAnalytics);

export default router;

