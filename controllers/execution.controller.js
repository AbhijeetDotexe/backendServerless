// controllers/execution.controller.js
import {
  executeFunction,
  getFunctionLogs,
  runCodeOnWhisk,
  testWebAction
} from "../services/execution.service.js";

// Execute function by UUID
export const executeFunctionController = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { input, keepAction = false } = req.body;
    const userId = req.user.id;

    const result = await executeFunction(uuid, input || {}, userId, keepAction);
    
    res.json({
      success: true,
      message: "Function executed successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// Get execution logs
export const getFunctionLogsController = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const userId = req.user.id;
    
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      sortBy: req.query.sortBy || '-createdAt'
    };

    const result = await getFunctionLogs(uuid, options, userId);
    
    res.json({
      success: true,
      message: "Logs retrieved successfully",
      data: result.logs,
      function: result.function,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

// Direct code execution
export const directExecuteController = async (req, res, next) => {
  try {
    const { code, input = {} } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ 
        success: false,
        error: "Missing 'code' in request body" 
      });
    }

    const tempUuid = require('crypto').randomUUID();
    const result = await runCodeOnWhisk(code, input, userId, tempUuid);
    
    res.json({ 
      success: true,
      message: "Code executed successfully",
      data: result 
    });
  } catch (error) {
    next(error);
  }
};

// Test web action
export const testWebActionController = async (req, res, next) => {
  try {
    const { actionName } = req.params;
    const { params = {} } = req.body;
    
    const result = await testWebAction(actionName, params);
    
    res.json({
      success: true,
      message: "Web action tested",
      data: result
    });
  } catch (error) {
    next(error);
  }
};