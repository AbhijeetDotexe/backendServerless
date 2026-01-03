// middleware/authMiddleware.js
import jwt from "jsonwebtoken";

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Not authorized to access this route"
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123");
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token"
      });
    }
  } catch (error) {
    next(error);
  }
};