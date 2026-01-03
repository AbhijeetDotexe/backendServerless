// routes/function.routes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  saveFunctionController,
  getFunctionsController,
  getFunctionController,
  updateFunctionController,
  deleteFunctionController,
  getStatsController,
  searchFunctionsController,
  getPublicFunctionsController,
  // getAllFunctions
} from "../controllers/function.controller.js";

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @route   POST /api/functions
 * @desc    Create a new serverless function
 * @access  Private
 */
router.post("/", saveFunctionController);

/**
 * @route   GET /api/functions
 * @desc    Get all user's functions
 * @access  Private
 */
router.get("/", getFunctionsController);

/**
 * @route   GET /api/functions/search
 * @desc    Search functions by name/tags
 * @access  Private
 */
router.get("/search", searchFunctionsController);

/**
 * @route   GET /api/functions/public
 * @desc    Get public functions
 * @access  Public (but need auth for user context)
 */
router.get("/public", protect, getPublicFunctionsController);

/**
 * @route   GET /api/functions/stats
 * @desc    Get function statistics
 * @access  Private
 */
router.get("/stats", getStatsController);

/**
 * @route   GET /api/functions/:uuid
 * @desc    Get function by UUID
 * @access  Private (or public if function is public)
 */
router.get("/:uuid", getFunctionController);


/**
 * @route   PUT /api/functions/:uuid
 * @desc    Update a function
 * @access  Private
 */
router.put("/:uuid", updateFunctionController);

/**
 * @route   DELETE /api/functions/:uuid
 * @desc    Delete a function (soft delete)
 * @access  Private
 */
router.delete("/:uuid", deleteFunctionController);

export default router;