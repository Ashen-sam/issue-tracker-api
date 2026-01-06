import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import User from "../models/User";

export const register = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return; 
  }

  const { name, email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      res.status(400).json({ msg: "User already exists" });
      return;
    }

    user = new User({ name, email, password });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    const payload = {
      user: { id: user.id },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user!.id,
            name: user!.name,
            email: user!.email,
          },
        });
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    const payload = {
      user: { id: user.id },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        });
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ msg: "User not authenticated" });
      return;
    }

    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    // Extract token from Authorization header (middleware already validated it exists)
    const authHeader = req.header("Authorization");
    let token = "";

    if (authHeader) {
      token = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : authHeader;
    }

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    if (!req.user?.id) {
      res.status(401).json({ msg: "User not authenticated" });
      return;
    }

    const { name, email } = req.body;

    // Find the current user
    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    // Check if email is being changed and if it's already taken by another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.id !== req.user.id) {
        res.status(400).json({ msg: "Email already exists" });
        return;
      }
      user.email = email;
    }

    // Update name if provided
    if (name) {
      user.name = name;
    }

    await user.save();

    // Extract token from Authorization header
    const authHeader = req.header("Authorization");
    let token = "";

    if (authHeader) {
      token = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : authHeader;
    }

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ msg: "User not authenticated" });
      return;
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    // Delete the user
    await user.deleteOne();

    res.json({ msg: "User account deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};
