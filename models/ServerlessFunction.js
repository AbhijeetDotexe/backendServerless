// models/ServerlessFunction.js
import mongoose from "mongoose";
import { v4 as uuidv4 } from 'uuid';

// Serverless Function Schema
const serverlessFunctionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  uuid: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4()
  },
  description: {
    type: String,
    default: ""
  },
  code: {
    type: String,
    required: true
  },
  language: {
    type: String,
    enum: ['javascript'],
    default: 'javascript'
  },
  runtime: {
    type: String,
    default: 'nodejs:20'
  },
  tags: [{
    type: String,
    trim: true
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: Number,
    default: 1
  },
  executionCount: {
    type: Number,
    default: 0
  },
  lastExecutedAt: {
    type: Date,
    default: null
  },
  averageExecutionTime: {
    type: Number,
    default: 0
  },
  successRate: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Execution Log Schema
const executionLogSchema = new mongoose.Schema({
  functionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServerlessFunction',
    required: false
  },
  functionUuid: {
    type: String,
    required: true
  },
  executionId: {
    type: String,
    required: true,
    unique: true
  },
  input: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  output: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'error', 'timeout'],
    default: 'success'
  },
  executionTime: {
    type: Number,
    required: true
  },
  invokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  errorDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  //   userUuid:{
  //   type: String,
  //   required: true
  // }
}, {
  timestamps: true
});

// Indexes
serverlessFunctionSchema.index({ uuid: 1 });
serverlessFunctionSchema.index({ createdBy: 1 });
serverlessFunctionSchema.index({ tags: 1 });
serverlessFunctionSchema.index({ isPublic: 1 });
serverlessFunctionSchema.index({ isActive: 1 });
serverlessFunctionSchema.index({ createdAt: -1 });

executionLogSchema.index({ functionUuid: 1 });
executionLogSchema.index({ invokedBy: 1 });
executionLogSchema.index({ status: 1 });
executionLogSchema.index({ createdAt: -1 });

// Export both models
export const ServerlessFunction = mongoose.model("ServerlessFunction", serverlessFunctionSchema);
export const ExecutionLog = mongoose.model("ExecutionLog", executionLogSchema);