const express = require("express");
const authController = require("../controllers/auth.controller");
const { authenticate, authorize } = require("../middlewares/auth");
const { USER_ROLES } = require("../helpers/constants");

const router = express.Router();

router.post("/login", authController.login);
router.post("/seed-defaults", authController.seedDefaults);
router.post("/seed-demo", authController.importDemoData);
router.get("/me", authenticate, authController.profile);
router.post("/change-pin", authenticate, authController.changePin);
// logout route removed: no `logout` handler implemented in controller
// router.post("/logout", authenticate, authController.logout);

module.exports = router;

