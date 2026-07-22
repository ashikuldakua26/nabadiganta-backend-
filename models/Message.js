const mongoose = require("mongoose");
const { MESSAGE_TYPES } = require("../helpers/constants");

const messageSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: Object.values(MESSAGE_TYPES), required: true },
    body: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
