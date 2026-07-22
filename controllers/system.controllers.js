const mongoose = require("mongoose");

class SystemController {
    healthCheck = (req, res) => {
        return res.json({
            status: "ok",
            uptimeSeconds: Math.floor(process.uptime()),
            serverTime: new Date().toISOString(),
            mongo: {
                readyState: mongoose.connection.readyState,
                state:
                    mongoose.connection.readyState === 1
                        ? "connected"
                        : mongoose.connection.readyState === 2
                            ? "connecting"
                            : mongoose.connection.readyState === 3
                                ? "disconnecting"
                                : "disconnected",
            },
        });
    };

    systemReady = (req, res) => {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ status: "not_ready", mongoReadyState: mongoose.connection.readyState });
        }

        return res.json({ status: "ready" });
    };

    systemInfo = (req, res) => {
        return res.json({
            status: "available",
            environment: process.env.NODE_ENV || "development",
            apiVersion: process.env.npm_package_version || "1.0.0",
            mongoReadyState: mongoose.connection.readyState,
            timestamp: new Date().toISOString(),
        });
    };
}

module.exports = {
    SystemController: new SystemController(),
};
