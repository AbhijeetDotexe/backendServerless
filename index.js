// index.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./db.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();

// Middleware
// app.use(cors({
//   origin: process.env.FRONTEND_URL || "http://localhost:5173",
//   credentials: true
// }));
app.use(cors("*"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Connect to Database
connectDB();

// Import Routes
import authRoutes from "./routes/auth.routes.js";
import functionRoutes from "./routes/function.routes.js";
import executionRoutes from "./routes/execution.routes.js";

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/functions", functionRoutes);
app.use("/api/execute", executionRoutes);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Documentation
app.get("/api", (req, res) => {
  res.json({
    message: "Serverless Functions API",
    version: "1.0.0",
    endpoints: {
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login"
      },
      functions: {
        create: "POST /api/functions",
        getAll: "GET /api/functions",
        getOne: "GET /api/functions/:uuid",
        update: "PUT /api/functions/:uuid",
        delete: "DELETE /api/functions/:uuid",
        stats: "GET /api/functions/stats"
      },
      execution: {
        execute: "POST /api/execute/:uuid",
        logs: "GET /api/execute/:uuid/logs",
        direct: "POST /api/execute/direct"
      }
    }
  });
});

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
});