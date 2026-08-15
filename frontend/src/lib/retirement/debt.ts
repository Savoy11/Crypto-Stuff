// Loan amortization and credit-card payoff — the spreadsheet's "Debt
// Calculators" tab, as pure functions.
//
// The sheet builds these from Excel's PMT/IPMT/PPMT/CUMIPMT/CUMPRINC. Those are
// closed-form and reproduced directly here rather than simulated month by
// month, so a 30-year mortgage costs the same as a 5-year car loan to compute.
//
// ⚠ One cell in the source sheet is NOT ported: `Debt Calculators!P11`, the
// House row's "Remaining Payment Balance", contains a #REF! — its precedent was
// deleted at some point and the formula was never repaired. The correct
// definition (total to be paid, less principal and interest already paid) is
// implemented here instead of carrying the error across.

export interface LoanInputs {
  principal: number
  /** Nominal annual rate as a percentage (6.275 = 6.275%). */
  annualRatePct: number
  termYears: number
  /** Payments already made. */
  monthsPaid: number
  /** Cash paid up front, reducing the financed amount. */
  downPayment: number
}

export interface LoanSchedule {
  financed: number
  monthlyPayment: number
  totalPaid: number
  totalInterest: number
  principalPaid: number
  interestPaid: number
  remainingPrincipal: number
  remainingInterest: number
  remainingPayments: number
  /** Split of the NEXT payment. */
  nextInterest: number
  nextPrincipal: number
  paidOff: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Level payment for a fully-amortizing loan (Excel PMT, sign-positive). */
export function monthlyPayment(financed: number, annualRatePct: number, termYears: number): number {
  const n = Math.round(termYears * 12)
  if (n <= 0 || financed <= 0) return 0
  const r = annualRatePct / 100 / 12
  if (r === 0) return financed / n
  return (financed * r) / (1 - Math.pow(1 + r, -n))
}

/** Outstanding principal after `monthsPaid` payments (Excel FV of the schedule). */
export function remainingPrincipal(
  financed: number,
  annualRatePct: number,
  termYears: number,
  monthsPaid: number,
): number {
  const n = Math.round(termYears * 12)
  const m = Math.min(Math.max(0, Math.round(monthsPaid)), n)
  if (n <= 0 || financed <= 0) return 0
  const r = annualRatePct / 100 / 12
  if (r === 0) return financed * (1 - m / n)
  const pmt = monthlyPayment(financed, annualRatePct, termYears)
  const growth = Math.pow(1 + r, m)
  const outstanding = financed * growth - pmt * ((growth - 1) / r)
  // Snap sub-cent residue to zero. The closed form leaves ~1e-12 at the end of
  // a term, which is harmless arithmetically but would let a fully repaid loan
  // report a non-zero balance to any caller comparing against 0.
  return outstanding < 0.005 ? 0 : outstanding
}

export function amortize(inputs: LoanInputs): LoanSchedule {
  const financed = Math.max(0, inputs.principal - inputs.downPayment)
  const n = Math.round(inputs.termYears * 12)
  const m = Math.min(Math.max(0, Math.round(inputs.monthsPaid)), n)
  const pmt = monthlyPayment(financed, inputs.annualRatePct, inputs.termYears)

  const totalPaid = pmt * n
  const totalInterest = Math.max(0, totalPaid - financed)

  const outstanding = remainingPrincipal(financed, inputs.annualRatePct, inputs.termYears, m)
  const principalPaid = Math.max(0, financed - outstanding)
  const interestPaid = Math.max(0, pmt * m - principalPaid)

  const r = inputs.annualRatePct / 100 / 12
  const nextInterest = outstanding > 0 ? outstanding * r : 0
  const nextPrincipal = outstanding > 0 ? Math.min(pmt - nextInterest, outstanding) : 0

  return {
    financed: round2(financed),
    monthlyPayment: round2(pmt),
    totalPaid: round2(totalPaid),
    totalInterest: round2(totalInterest),
    principalPaid: round2(principalPaid),
    interestPaid: round2(interestPaid),
    remainingPrincipal: round2(outstanding),
    // The repaired P11: what is left to hand over in total, principal and
    // interest together, over the remaining payments.
    remainingInterest: round2(Math.max(0, totalInterest - interestPaid)),
    remainingPayments: Math.max(0, n - m),
    nextInterest: round2(nextInterest),
    nextPrincipal: round2(nextPrincipal),
    paidOff: outstanding <= 0.005,
  }
}

export interface CardInputs {
  balance: number
  /** Nominal annual purchase APR, as a percentage. */
  aprPct: number
  creditLimit: number
  monthlyPayment: number
}

export interface CardPayoff {
  /** Interest accrued over one 30-day cycle at the current balance. */
  monthlyInterest: number
  utilizationPct: number | null
  /** Months to clear the balance, or null when the payment never will. */
  monthsToPayOff: number | null
  totalInterestToPayOff: number | null
  /** True when the payment does not even cover a cycle's interest. */
  neverPaysOff: boolean
}

export function cardPayoff(inputs: CardInputs): CardPayoff {
  const r = inputs.aprPct / 100 / 12
  const monthlyInterest = round2(inputs.balance * r)
  const utilizationPct = inputs.creditLimit > 0
    ? round2((inputs.balance / inputs.creditLimit) * 100)
    : null

  if (inputs.balance <= 0) {
    return { monthlyInterest: 0, utilizationPct, monthsToPayOff: 0, totalInterestToPayOff: 0, neverPaysOff: false }
  }

  // A payment at or below one cycle's interest never reduces the balance. The
  // spreadsheet's `balance / payment` division returns a confident finite month
  // count in exactly this case — the most consequential number on the tab, and
  // wrong precisely when the user most needs to be told.
  if (inputs.monthlyPayment <= monthlyInterest) {
    return { monthlyInterest, utilizationPct, monthsToPayOff: null, totalInterestToPayOff: null, neverPaysOff: true }
  }

  const months = r === 0
    ? Math.ceil(inputs.balance / inputs.monthlyPayment)
    : Math.ceil(-Math.log(1 - (inputs.balance * r) / inputs.monthlyPayment) / Math.log(1 + r))

  return {
    monthlyInterest,
    utilizationPct,
    monthsToPayOff: months,
    totalInterestToPayOff: round2(Math.max(0, inputs.monthlyPayment * months - inputs.balance)),
    neverPaysOff: false,
  }
}
