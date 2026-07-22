/**
 * Vercel Serverless Entry Point
 * ─────────────────────────────
 * Vercel runs this file as a serverless function. Each invocation may
 * be on a cold or warm instance. We keep the mongoose connection alive
 * across warm invocations using module-level caching.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const app      = require("../app");

// ─── Lazy / cached MongoDB connection ────────────────────────────────────────
let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS:          45000,
    maxPoolSize:              5,   // keep pool small for serverless
    minPoolSize:              1,
    bufferCommands:           false,
  });

  isConnected = true;
  console.log("✅ MongoDB connected:", mongoose.connection.host);
}

// ─── Vercel handler ───────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    return res.status(503).json({
      success: false,
      error: {
        message: "Database connection failed. Please try again.",
        code: "DB_CONNECTION_ERROR",
      },
    });
  }

  // Delegate to the Express app
  return app(req, res);
};
