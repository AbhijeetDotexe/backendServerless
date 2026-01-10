// function.service.js
import { ServerlessFunction, ExecutionLog } from "./schema.js";
import { v4 as uuidv4 } from 'uuid';
import openwhisk from "openwhisk";
import dotenv from "dotenv";
dotenv.config();


const ow = openwhisk({
  apihost: process.env.WHISK_APIHOST,
  api_key: process.env.WHISK_AUTH ||
    "23bc46b1-71f6-4ed5-8c54-816aa4f8c502:123zO3xZCLrMN6v2BKK1dXYFpXlPkccOFqm12CdAsMgRU4VrNZ9lyGVCGuMDGIwP",
  namespace: process.env.OPENWHISK_NAMESPACE || 'guest'
});

// Save a new serverless function
export const saveFunction = async (functionData, userId) => {
  try {
    const {
      name,
      description = "",
      code,
      language = 'javascript',
      runtime = 'nodejs:20',
      tags = [],
      isPublic = false,
      metadata = {}
    } = functionData;

    // Basic validation
    if (!name || name.trim().length === 0) {
      throw new Error('Function name is required');
    }
    
    if (!code || code.trim().length === 0) {
      throw new Error('Function code cannot be empty');
    }

    // Check if function name already exists for this user
    const existingFunction = await ServerlessFunction.findOne({
      name,
      createdBy: userId
    });

    if (existingFunction) {
      throw new Error(`Function with name "${name}" already exists`);
    }

    const serverlessFunction = await ServerlessFunction.create({
      name,
      description,
      code,
      language,
      runtime,
      tags,
      isPublic,
      createdBy: userId,
      metadata
    });

    return {
      success: true,
      function: serverlessFunction
    };
  } catch (error) {
    console.error('Error saving function:', error);
    throw error;
  }
};

// Get all functions for a user
export const getUserFunctions = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    tags = [],
    isActive = true
  } = options;

  const query = {
    createdBy: userId,
    isActive
  };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  if (tags.length > 0) {
    query.tags = { $in: tags };
  }

  const skip = (page - 1) * limit;

  const [functions, total] = await Promise.all([
    ServerlessFunction.find(query)
      .select('-code')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ServerlessFunction.countDocuments(query)
  ]);

  return {
    functions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Get function by UUID
export const getFunctionByUuid = async (uuid, userId = null) => {
  const query = { uuid };
  
  if (userId) {
    query.$or = [
      { createdBy: userId },
      { isPublic: true }
    ];
  }

  const func = await ServerlessFunction.findOne(query).lean();
  
  if (!func) {
    throw new Error('Function not found or access denied');
  }

  return func;
};

// Update function
export const updateFunction = async (uuid, updateData, userId) => {
  const func = await ServerlessFunction.findOne({
    uuid,
    createdBy: userId
  });

  if (!func) {
    throw new Error('Function not found');
  }

  // Only allow updating specific fields
  if (updateData.name !== undefined) func.name = updateData.name;
  if (updateData.description !== undefined) func.description = updateData.description;
  if (updateData.code !== undefined) {
    func.code = updateData.code;
    func.version = func.version + 1;
  }
  if (updateData.tags !== undefined) func.tags = updateData.tags;
  if (updateData.isPublic !== undefined) func.isPublic = updateData.isPublic;
  if (updateData.isActive !== undefined) func.isActive = updateData.isActive;
  if (updateData.metadata !== undefined) func.metadata = updateData.metadata;

  await func.save();

  return {
    success: true,
    function: func
  };
};

// Delete function
export const deleteFunction = async (uuid, userId) => {
  const func = await ServerlessFunction.findOne({
    uuid,
    createdBy: userId
  });

  if (!func) {
    throw new Error('Function not found');
  }

  func.isActive = false;
  await func.save();

  return {
    success: true,
    message: 'Function deleted successfully'
  };
};

// Execute function by UUID
export const executeFunction = async (uuid, input = {}, userId = null) => {
  const startTime = Date.now();
  const executionId = uuidv4();

  try {
    // Get the function
    const func = await ServerlessFunction.findOne({ uuid });
    
    if (!func) {
      throw new Error('Function not found');
    }

    // Check if user has permission to execute
    if (userId && func.createdBy.toString() !== userId && !func.isPublic) {
      throw new Error('Access denied to execute this function');
    }

    if (!func.isActive) {
      throw new Error('Function is not active');
    }

    const namespace = process.env.OPENWHISK_NAMESPACE || 'guest';
    const packageName = process.env.OPENWHISK_PACKAGE || 'default';
    const actionName = `func-${uuid.replace(/-/g, '')}-${Date.now()}`;
    
    // ✅ Generate web action URL
    const apihost = process.env.WHISK_APIHOST;
    const cleanApiHost = apihost.replace(/(^\w+:|^)\/\//, '');
    const webActionUrl = `https://${cleanApiHost}/api/v1/web/${namespace}/${packageName}/${actionName}`;

    // Create the action
    const actionParams = {
      name: actionName,
      action: func.code,
      kind: func.runtime,
      web: true,
      annotations: {
        'web-export': true,
        'raw-http': false,
        'final': true
      }
    };

    // Create the action
    await ow.actions.create(actionParams);

    // Invoke the action with input
    const response = await ow.actions.invoke({
      actionName,
      blocking: true,
      result: true,
      params: input
    });

    const executionTime = Date.now() - startTime;

    // Parse the response
    let result = response;
    let status = 'success';
    let errorDetails = null;

    // Check for error in response
    if (response && response.error) {
      status = 'error';
      errorDetails = {
        message: response.error,
        type: 'RuntimeError'
      };
      result = { error: response.error };
    }

    // Update function statistics
    func.executionCount += 1;
    func.lastExecutedAt = new Date();
    
    func.averageExecutionTime = Math.round(
      (func.averageExecutionTime * (func.executionCount - 1) + executionTime) / func.executionCount
    );
    
    const totalExecutions = func.executionCount;
    const currentSuccessRate = func.successRate;
    const successRate = status === 'success' 
      ? Math.round(((currentSuccessRate * (totalExecutions - 1)) + 100) / totalExecutions)
      : Math.round((currentSuccessRate * (totalExecutions - 1)) / totalExecutions);
    
    func.successRate = Math.min(100, Math.max(0, successRate));
    
    await func.save();

    // Save execution log
    const executionLog = await ExecutionLog.create({
      functionId: func._id,
      functionUuid: func.uuid,
      executionId,
      input,
      output: result,
      status,
      executionTime,
      invokedBy: userId,
      errorDetails,
      metadata: {
        actionName,
        namespace,
        package: packageName,
        runtime: func.runtime,
        webActionUrl // Save URL in logs too
      }
    });

    // ✅ Return URL in response
    return {
      success: true,
      executionId,
      functionUuid: func.uuid,
      functionName: func.name,
      status,
      executionTime: `${executionTime}ms`,
      result,
      webActionUrl: `${webActionUrl}.json`,
      logId: executionLog._id
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Save error log if we have the function
    try {
      const func = await ServerlessFunction.findOne({ uuid });
      if (func) {
        await ExecutionLog.create({
          functionId: func._id,
          functionUuid: func.uuid,
          executionId,
          input,
          output: { error: error.message },
          status: 'error',
          executionTime,
          invokedBy: userId,
          errorDetails: {
            message: error.message,
            type: error.name || 'ExecutionError'
          },
          metadata: {
            error: error.message
          }
        });

        // Update function statistics for error
        func.executionCount += 1;
        func.lastExecutedAt = new Date();
        
        const totalExecutions = func.executionCount;
        const currentSuccessRate = func.successRate;
        const successRate = Math.round((currentSuccessRate * (totalExecutions - 1)) / totalExecutions);
        func.successRate = Math.max(0, successRate);
        
        await func.save();
      }
    } catch (logError) {
      console.error('Failed to save error log:', logError);
    }

    throw error;
  }
};

// Get execution logs for a function
export const getFunctionLogs = async (uuid, options = {}, userId = null) => {
  const {
    page = 1,
    limit = 20,
    status,
    startDate,
    endDate,
    sortBy = '-createdAt'
  } = options;

  const func = await ServerlessFunction.findOne({ uuid });
  
  if (!func) {
    throw new Error('Function not found');
  }

  if (userId && func.createdBy.toString() !== userId && !func.isPublic) {
    throw new Error('Access denied to view logs for this function');
  }

  const query = { functionUuid: uuid };

  if (status) query.status = status;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    ExecutionLog.find(query)
      .populate('invokedBy', 'username email')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    ExecutionLog.countDocuments(query)
  ]);

  return {
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    },
    function: {
      name: func.name,
      uuid: func.uuid,
      executionCount: func.executionCount,
      averageExecutionTime: func.averageExecutionTime,
      successRate: func.successRate
    }
  };
};

// Get function statistics
export const getFunctionStats = async (userId) => {
  const stats = await ServerlessFunction.aggregate([
    {
      $match: {
        createdBy: userId,
        isActive: true
      }
    },
    {
      $group: {
        _id: null,
        totalFunctions: { $sum: 1 },
        totalExecutions: { $sum: "$executionCount" },
        avgSuccessRate: { $avg: "$successRate" },
        avgExecutionTime: { $avg: "$averageExecutionTime" },
        publicFunctions: {
          $sum: { $cond: [{ $eq: ["$isPublic", true] }, 1, 0] }
        }
      }
    }
  ]);

  return stats[0] || {
    totalFunctions: 0,
    totalExecutions: 0,
    avgSuccessRate: 0,
    avgExecutionTime: 0,
    publicFunctions: 0
  };
};