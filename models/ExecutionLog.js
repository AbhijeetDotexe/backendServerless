// models/ExecutionLog.js
import mongoose from "mongoose";

const executionLogSchema = new mongoose.Schema(
  {
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
    userUuid:{
      type:String,
      required:true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
executionLogSchema.index({ functionUuid: 1 });
executionLogSchema.index({ invokedBy: 1 });
executionLogSchema.index({ status: 1 });
executionLogSchema.index({ createdAt: -1 });

export const ExecutionLog = mongoose.model("ExecutionLog", executionLogSchema);