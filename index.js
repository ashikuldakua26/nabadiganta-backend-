require("dotenv").config();
const mongoose = require("mongoose");
const app      = require("./app");

const PORT       = process.env.PORT       || 5000;
const MONGO_URI  = process.env.MONGODB_URI;
const NODE_ENV   = process.env.NODE_ENV   || "development";

// ─── Validate required env vars ───────────────────────────────────────────────
if (!MONGO_URI) {
  console.error("❌  MONGODB_URI is not set in .env — server cannot start.");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  if (NODE_ENV === "production") {
    console.error("❌  JWT_SECRET is not set — refusing to start in production.");
    process.exit(1);
  }
  console.warn("⚠️   JWT_SECRET not set — using insecure default for development only.");
}

// ─── MongoDB connection ────────────────────────────────────────────────────────
mongoose.set("strictQuery", false);

async function startServer() {
  try {
    console.log("🔌  Connecting to MongoDB…");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log("✅  MongoDB connected:", mongoose.connection.host);

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀  Server running on port ${PORT}  [${NODE_ENV}]`);
      console.log(`📡  API base: http://0.0.0.0:${PORT}/api`);
    });

    // ── Graceful shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal) => {
      console.log(`\n⏳  ${signal} received — shutting down gracefully…`);
      server.close(async () => {
        try {
          await mongoose.connection.close();
          console.log("🔌  MongoDB connection closed.");
        } catch (_) {}
        console.log("👋  Bye!");
        process.exit(0);
      });

      // Force exit after 10 s
      setTimeout(() => {
        console.error("⏰  Graceful shutdown timed out — forcing exit.");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));

    // ── Unhandled promise rejection ──────────────────────────────────────────
    process.on("unhandledRejection", (reason) => {
      console.error("⚠️   Unhandled Promise Rejection:", reason);
    });

    process.on("uncaughtException", (err) => {
      console.error("💥  Uncaught Exception:", err);
      process.exit(1);
    });

  } catch (err) {
    console.error("❌  Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
}

startServer();
