function calculateLoanBalance(principalAmount, paidAmount = 0) {
  const parsedPrincipal = Number(principalAmount) || 0;
  const parsedPaidAmount = Number(paidAmount) || 0;
  const normalizedPaidAmount = Math.min(parsedPaidAmount, parsedPrincipal);
  const outstandingAmount = Math.max(0, parsedPrincipal - normalizedPaidAmount);

  return {
    principalAmount: parsedPrincipal,
    paidAmount: normalizedPaidAmount,
    outstandingAmount,
    isCompleted: outstandingAmount === 0 && parsedPrincipal > 0,
  };
}

function applyLoanPayment(currentLoan, paymentAmount) {
  const parsedPaymentAmount = Number(paymentAmount) || 0;
  const currentPaidAmount = Number(currentLoan?.paidAmount || 0);
  const principalAmount = Number(currentLoan?.amount || currentLoan?.principalAmount || 0);
  const remainingBalance = Math.max(0, principalAmount - currentPaidAmount);
  const appliedAmount = Math.min(parsedPaymentAmount, remainingBalance);
  const nextPaidAmount = currentPaidAmount + appliedAmount;
  const balance = calculateLoanBalance(principalAmount, nextPaidAmount);

  return {
    ...balance,
    paidAmount: nextPaidAmount,
    appliedAmount,
    remainingAmount: Math.max(0, parsedPaymentAmount - appliedAmount),
    status: balance.isCompleted ? "completed" : "active",
  };
}

module.exports = {
  calculateLoanBalance,
  applyLoanPayment,
};
