// Vercel serverless entry point
require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../app");

// Connect to MongoDB on cold start / warm
let cachedDb = null;

async function connectDb() {
  if (cachedDb) return cachedDb;
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI not set — skipping DB connection");
    return null;
  }
  cachedDb = mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 1,  // serverless-friendly pool
    serverSelectionTimeoutMS: 5000,
  });
  return cachedDb;
}

// For Vercel serverless: connect on first request
let connected = false;

const handler = async (req, res) => {
  if (!connected) {
    try {
      await connectDb();
      connected = true;
    } catch (e) {
      console.error("DB connection failed:", e.message);
    }
  }
  return app(req, res);
};

module.exports = handler;
