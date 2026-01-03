// routes/auth.routes.js
import express from "express";
import { registerController, loginController } from "../controllers/auth.controller.js";

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post("/register", registerController);

/**
 * @route   POST /api/auth/login
 * @desc    Login user & get token
 * @access  Public
 */
router.post("/login", loginController);

export default router;