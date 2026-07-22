const { USER_ROLES } = require("./constants");

function buildUserListQuery(params = {}) {
  const query = {};

  if (params.role) {
    query.role = params.role;
  } else if (params.includeStaff === "true" || params.includeStaff === true) {
    query.role = { $nin: [USER_ROLES.ADMIN, USER_ROLES.BRANCH_MANAGER, USER_ROLES.SUPER_ADMIN] };
  } else {
    query.role = USER_ROLES.USER;
  }

  if (params.branchId) {
    query.branch = params.branchId;
  }

  if (params.kycStatus) {
    query.kycStatus = params.kycStatus;
  }

  if (params.isActive !== undefined) {
    query.isActive = params.isActive === "true";
  }

  if (params.search) {
    const search = String(params.search).trim();
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
        { area: new RegExp(search, "i") },
        { address: new RegExp(search, "i") },
        { nidNumber: new RegExp(search, "i") },
        { fatherName: new RegExp(search, "i") },
      ];
    }
  }

  return query;
}

module.exports = {
  buildUserListQuery,
};
