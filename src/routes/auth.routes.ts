import { Router } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  getCurrentUser,
  updateUser,
  deleteUser,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
const router = Router();

router.post(
  "/register",
  [
    body("name", "Name is required").notEmpty(),
    body("email", "Please include a valid email").isEmail(),
    body("password", "Password must be at least 6 characters").isLength({
      min: 6,
    }),
  ],
  register
);

router.post(
  "/login",
  [
    body("email", "Please include a valid email").isEmail(),
    body("password", "Password is required").exists(),
  ],
  login
);

router.get("/me", authMiddleware, getCurrentUser);

router.put(
  "/me",
  [
    authMiddleware,
    body("name", "Name is required").optional().notEmpty(),
    body("email", "Please include a valid email").optional().isEmail(),
  ],
  updateUser
);

router.delete("/me", authMiddleware, deleteUser);

export default router;
