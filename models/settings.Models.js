const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    siteLogo: { type: String, default: "" },
    siteTitle: { type: String, default: "নব্য দিগন্ত এন জিও।" },
    siteDescription: { type: String, default: "নব্য দিগন্ত এন জিও।" },
    supportContact: { type: String, default: "01349-828721" },
    officeAddress: {
      type: String,
      default:
        "Office: 35/A Dokkhin Kamalapur, Post Office Shantinagar, Thana Shahjahanpur",
    },  

    officeHours: { type: String, default: "Saturday to Thursday, 9 AM to 5 PM" },
    socialLinks: {
      facebook: { type: String, default: "" },
        twitter: { type: String, default: "" },
        instagram: { type: String, default: "" },
        linkedin: { type: String, default: "" },
        youtube: { type: String, default: "" },
    },

    kyc: {
        required: { type: Boolean, default: true },
        fields: {
            nid: { type: Boolean, default: true },
            passport: { type: Boolean, default: false },
            drivingLicense: { type: Boolean, default: false },
        },
    },

    permissions: {
        // Users 
        allowUserRegistration: { type: Boolean, default: true },
        allowUserLogin: { type: Boolean, default: true },
        allowUserKyc: { type: Boolean, default: true },
        allowUserTransactions: { type: Boolean, default: true },

        // Branches
        allowBranchCreation: { type: Boolean, default: true },
        allowBranchAdminCreation: { type: Boolean, default: true },
        allowBranchAdminLogin: { type: Boolean, default: true },

        // admin
        allowAdminCreation: { type: Boolean, default: true },
        allowAdminLogin: { type: Boolean, default: true },
        assignRoles: { type: Boolean, default: true },

        
    },
    

  },
  { timestamps: true }
);
module.exports = mongoose.model("Settings", settingsSchema);