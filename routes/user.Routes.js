const express = require("express");
const userController = require("../controllers/user.controller");
const { authenticate, authorize } = require("../middlewares/auth");
const { USER_ROLES } = require("../helpers/constants");

const router = express.Router();

router.use(authenticate);
router.use(
	authorize(
		USER_ROLES.USER,
		USER_ROLES.STAFF,
		USER_ROLES.BRANCH_MANAGER,
		USER_ROLES.ADMIN,
		USER_ROLES.SUPER_ADMIN
	)
);

router.get("/customers", userController.listCustomers);
router.get("/deposits", userController.myDeposits);
router.get("/loans", userController.myLoans);
router.post("/messages", userController.sendMessage);

module.exports = router;


