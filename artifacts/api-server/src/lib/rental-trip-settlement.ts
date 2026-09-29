export type TripSettlementInput = {
  baseTotal: number;
  baseCommission: number;
  baseOperatorShare: number;
  commissionBasisPoints: number;
  approvedExtras: Record<string, number>;
  processedRefund: number;
  approvedRefund: number;
};

export type TripSettlement = {
  baseTotal: number;
  baseCommission: number;
  baseOperatorShare: number;
  extras: Array<{ code: string; amount: number; commission: number; operatorShare: number }>;
  extraTotal: number;
  extraCommission: number;
  extraOperatorShare: number;
  processedRefund: number;
  processedRefundCommission: number;
  processedRefundOperatorShare: number;
  refund: number;
  refundCommission: number;
  refundOperatorShare: number;
  finalTotal: number;
  finalCommission: number;
  finalOperatorShare: number;
};

export function calculateTripSettlement(input: TripSettlementInput): TripSettlement {
  const {
    baseTotal, baseCommission, baseOperatorShare, commissionBasisPoints, approvedExtras, processedRefund, approvedRefund,
  } = input;
  const integerAmounts = [baseTotal, baseCommission, baseOperatorShare, processedRefund, approvedRefund, ...Object.values(approvedExtras)];
  if (integerAmounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    throw new Error("Trip settlement amounts must be nonnegative safe integers");
  }
  if (!Number.isInteger(commissionBasisPoints) || commissionBasisPoints < 0 || commissionBasisPoints > 10_000) {
    throw new Error("Saved commission basis points are invalid");
  }
  if (baseCommission + baseOperatorShare !== baseTotal) {
    throw new Error("Saved platform commission and operator share do not reconcile to the booking total");
  }

  const extras = Object.entries(approvedExtras).map(([code, amount]) => {
    const commission = Math.round(amount * commissionBasisPoints / 10_000);
    return { code, amount, commission, operatorShare: amount - commission };
  });
  const extraTotal = extras.reduce((sum, row) => sum + row.amount, 0);
  const extraCommission = extras.reduce((sum, row) => sum + row.commission, 0);
  const extraOperatorShare = extras.reduce((sum, row) => sum + row.operatorShare, 0);
  const processedRefundCommission = Math.round(processedRefund * commissionBasisPoints / 10_000);
  const processedRefundOperatorShare = processedRefund - processedRefundCommission;
  const refundCommission = Math.round(approvedRefund * commissionBasisPoints / 10_000);
  const refundOperatorShare = approvedRefund - refundCommission;
  const finalTotal = baseTotal + extraTotal - processedRefund - approvedRefund;
  const finalCommission = baseCommission + extraCommission - processedRefundCommission - refundCommission;
  const finalOperatorShare = baseOperatorShare + extraOperatorShare - processedRefundOperatorShare - refundOperatorShare;
  if (finalCommission + finalOperatorShare !== finalTotal) {
    throw new Error("Trip settlement allocations do not reconcile to the adjusted final total");
  }
  return {
    baseTotal, baseCommission, baseOperatorShare,
    extras, extraTotal, extraCommission, extraOperatorShare,
    processedRefund, processedRefundCommission, processedRefundOperatorShare,
    refund: approvedRefund, refundCommission, refundOperatorShare,
    finalTotal, finalCommission, finalOperatorShare,
  };
}