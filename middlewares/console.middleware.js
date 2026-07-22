/**
 * Request logger middleware — lightweight for production/Vercel.
 * Only logs method + path + status. Never logs body or headers
 * (avoids leaking credentials and wasting compute time).
 */
module.exports = {
  checkRequests: (req, res, next) => {
    if (process.env.NODE_ENV !== "production") {
      const start = Date.now();
      res.on("finish", () => {
        console.log(`[${req.method}] ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
      });
    }
    next();
  },
};
