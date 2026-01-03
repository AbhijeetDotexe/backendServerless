// services/user.service.js
import { User } from "../models/User.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid"; // 1. Import the UUID generator

export const createUser = async ({ username, email, password }) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // 2. Generate the UUID and pass it to the create method
  return User.create({ 
    username, 
    email, 
    password: hashedPassword,
    uuid: uuidv4() 
  });
};

export const findUserByEmail = async (email) => {
  return User.findOne({ email });
};

export const findUserById = async (id) => {
  return User.findById(id).select('-password');
};