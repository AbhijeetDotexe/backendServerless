// services/function.service.js
import { ServerlessFunction, ExecutionLog } from "../models/ServerlessFunction.js";
import { User } from "../models/User.js";
import { v4 as uuidv4 } from 'uuid';

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

// Search functions
export const searchFunctions = async (userId, query, tags = []) => {
  const searchQuery = {
    createdBy: userId,
    isActive: true,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } }
    ]
  };

  if (tags.length > 0) {
    searchQuery.tags = { $in: tags.split(',') };
  }

  const functions = await ServerlessFunction.find(searchQuery)
    .select('name description tags isPublic executionCount successRate uuid')
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  return functions;
};

// Get public functions
export const getPublicFunctions = async (userId = null, options = {}) => {
  const {
    page = 1,
    limit = 20
  } = options;

  const query = {
    isPublic: true,
    isActive: true
  };

  const skip = (page - 1) * limit;

  const [functions, total] = await Promise.all([
    ServerlessFunction.find(query)
      .select('-code')
      .populate('createdBy', 'username')
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