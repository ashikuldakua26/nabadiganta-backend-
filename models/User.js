const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { USER_ROLES } = require("../helpers/constants");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    pin: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      required: true,
      default: USER_ROLES.USER,
      index: true,
    },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    area: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    nidNumber: { type: String, trim: true, default: "", index: true },
    dateOfBirth: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    fatherName: { type: String, trim: true, default: "" },
    kycStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      index: true,
    },
    kycNote: { type: String, trim: true, default: "" },
    kycVerifiedAt: { type: Date, default: null },
    kycUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastLoginAt: { type: Date, default: null },
    lastLogoutAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function preSave() {
  if (!this.isModified("pin")) return;
  this.pin = await bcrypt.hash(this.pin, 10);
});

userSchema.methods.comparePin = function comparePin(inputPin) {
  return bcrypt.compare(inputPin, this.pin);
};

module.exports = mongoose.model("User", userSchema);
