/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Validates a GSTIN number.
 * @param gstin The GSTIN string to validate
 * @returns true if valid, false otherwise
 */
export function validateGSTIN(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.toUpperCase());
}

/**
 * Extracts the PAN from a GSTIN.
 * A GSTIN is 15 digits, where characters 3 to 12 are the PAN.
 * @param gstin The GSTIN string
 * @returns The 10-character PAN or null if the GSTIN is invalid
 */
export function extractPANFromGSTIN(gstin: string): string | null {
  const cleanGstin = gstin.trim().toUpperCase();
  if (cleanGstin.length >= 12) {
    return cleanGstin.substring(2, 12);
  }
  return null;
}
