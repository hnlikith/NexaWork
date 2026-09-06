/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
export function calculateCompanyScore(
  revenueAchievement: number,
  collections: number,
  deliveryHealth: number
): number {
  return parseFloat(((revenueAchievement + collections + deliveryHealth) / 3).toFixed(2));
}

export function getCompanyMultiplier(companyScore: number): number {
  if (companyScore < 60) return 0.5;
  if (companyScore < 80) return 0.7;
  if (companyScore < 100) return 1.0;
  if (companyScore < 110) return 1.1;
  return 1.2;
}

export function getEmployeeMultiplier(employeeScore?: number | null): number {
  if (employeeScore == null) return 1.0;
  if (employeeScore < 60) return 0.5;
  if (employeeScore < 80) return 0.7;
  if (employeeScore < 90) return 0.8;
  if (employeeScore < 95) return 1.0;
  return 1.2;
}

export function calculateFinalIncentive(
  fixedAmount: number,
  variableAmount: number,
  employeeMultiplier: number,
  companyMultiplier: number
): number {
  return parseFloat((fixedAmount + variableAmount * employeeMultiplier * companyMultiplier).toFixed(2));
}
