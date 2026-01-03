// models/User.js
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const userSchema = new mongoose.Schema(
  {
    username: { 
      type: String, 
      required: true, 
      unique: true,
      trim: true
    },
    email: { 
      type: String, 
      required: true, 
      unique: true,
      lowercase: true,
      trim: true
    },
    password: { 
      type: String, 
      required: true 
    },
    uuid: {
      type: String,
      default: uuidv4, // This automatically generates a UUID if one isn't provided
      unique: true
  }

  },
  { 
    timestamps: true 
  }
);

export const User = mongoose.model("User", userSchema);