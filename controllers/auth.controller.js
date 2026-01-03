// controllers/auth.controller.js
import { createUser, findUserByEmail } from "../services/user.service.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// REGISTER
export const registerController = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    
    // Basic validation
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ 
        success: false,
        error: "Username must be at least 3 characters" 
      });
    }
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        success: false,
        error: "Valid email is required" 
      });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: "Password must be at least 6 characters" 
      });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ 
        success: false,
        error: "User already exists" 
      });
    }

    const user = await createUser({ username, email, password });
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email,
        username: user.username 
      },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "7d" }
    );

    res.status(201).json({ 
      success: true,
      message: "User registered successfully",
      token,
      user: { 
        id: user.uuid,
        username: user.username, 
        email: user.email 
      } 
    });
  } catch (error) {
    next(error);
  }
};

// LOGIN
export const loginController = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: "Email and password are required" 
      });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid credentials" 
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid credentials" 
      });
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email,
        username: user.username 
      },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "7d" }
    );

    res.json({ 
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
};