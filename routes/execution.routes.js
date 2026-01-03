// routes/execution.routes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  executeFunctionController,
  getFunctionLogsController,
  directExecuteController,
  testWebActionController
} from "../controllers/execution.controller.js";

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @route   POST /api/execute/:uuid
 * @desc    Execute a function by UUID
 * @access  Private (or public if function is public)
 */
router.post("/:uuid", executeFunctionController);

/**
 * @route   GET /api/execute/:uuid/logs
 * @desc    Get execution logs for a function
 * @access  Private
 */
router.get("/:uuid/logs", getFunctionLogsController);

/**
 * @route   POST /api/execute/direct
 * @desc    Direct code execution (no saving)
 * @access  Private
 */
router.post("/direct", directExecuteController);

/**
 * @route   GET /api/execute/test/:actionName
 * @desc    Test a web action URL
 * @access  Private
 */
router.get("/test/:actionName", testWebActionController);

export default router;