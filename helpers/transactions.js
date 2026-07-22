function buildBranchManagerTransaction(item = {}) {
  const transactionDate = item.at || item.collectedAt || item.appliedAt || item.paidAt || item.createdAt;

  return {
    id: item.id || item._id,
    _id: item._id,
    type: item.type,
    amount: Number(item.amount || 0),
    customer: item.customer,
    customerName: item.customerName || item.customer?.name || "Customer",
    branch: item.branch,
    branchName: item.branchName || item.branch?.name || "N/A",
    note: item.note || "",
    status: item.status || "",
    loan: item.loan || "",
    at: transactionDate,
  };
}

module.exports = {
  buildBranchManagerTransaction,
};
