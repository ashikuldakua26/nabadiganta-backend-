const test = require("node:test");
const assert = require("node:assert/strict");
const { buildUserListQuery } = require("../helpers/userManagement");

test("buildUserListQuery defaults to regular users when no role is requested", () => {
  const query = buildUserListQuery({});

  assert.deepEqual(query.role, "user");
});

test("buildUserListQuery honors explicit role filters", () => {
  const query = buildUserListQuery({ role: "staff" });

  assert.equal(query.role, "staff");
});

test("buildUserListQuery can include staff and regular users when requested", () => {
  const query = buildUserListQuery({ includeStaff: "true" });

  assert.deepEqual(query.role, { $nin: ["admin", "branch_manager", "superadmin"] });
});
