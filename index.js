require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./api/server");

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb+srv://pwa_control:iucnr75i0ZYqv9xs@pwa0.6uuafq9.mongodb.net/nabadiganta')
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err.message);
    process.exit(1);
  });
