// controllers/function.controller.js
import {
  saveFunction,
  getUserFunctions,
  getFunctionByUuid,
  updateFunction,
  deleteFunction,
  getFunctionStats,
  searchFunctions,
  getPublicFunctions
} from "../services/function.service.js";

// Create a new function
export const saveFunctionController = async (req, res, next) => {
  try {
    const functionData = req.body;
    const userId = req.user.id;
    
    // Basic validation
    if (!functionData.name || functionData.name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Function name is required"
      });
    }
    
    if (!functionData.code || functionData.code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Function code cannot be empty"
      });
    }

    const result = await saveFunction(functionData, userId);
    
    res.status(201).json({
      success: true,
      message: 'Function saved successfully',
      data: result.function
    });
  } catch (error) {
    next(error);
  }
};

// Get all user functions
export const getFunctionsController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      isActive: req.query.isActive !== 'false'
    };

    const result = await getUserFunctions(userId, options);
    
    res.json({
      success: true,
      message: "Functions retrieved successfully",
      data: result.functions,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

// Search functions
export const searchFunctionsController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { q, tags } = req.query;
    
    const result = await searchFunctions(userId, q, tags);
    
    res.json({
      success: true,
      message: "Search results",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// Get public functions
export const getPublicFunctionsController = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };

    const result = await getPublicFunctions(userId, options);
    
    res.json({
      success: true,
      message: "Public functions retrieved",
      data: result.functions,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

// Get function by UUID
export const getFunctionController = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const userId = req.user.id;

    const func = await getFunctionByUuid(uuid, userId);
    
    res.json({
      success: true,
      message: "Function retrieved successfully",
      data: func
    });
  } catch (error) {
    next(error);
  }
};

// Update function
export const updateFunctionController = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const updateData = req.body;
    const userId = req.user.id;

    const result = await updateFunction(uuid, updateData, userId);
    
    res.json({
      success: true,
      message: 'Function updated successfully',
      data: result.function
    });
  } catch (error) {
    next(error);
  }
};

// Delete function
export const deleteFunctionController = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const userId = req.user.id;

    const result = await deleteFunction(uuid, userId);
    
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

// Get function statistics
export const getStatsController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const stats = await getFunctionStats(userId);
    
    res.json({
      success: true,
      message: "Statistics retrieved",
      data: stats
    });
  } catch (error) {
    next(error);
  }
};