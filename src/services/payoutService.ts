/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * DUMMY PAYOUT SERVICE
 * Returns static data for UI testing and approval.
 */

export async function submitClaim(userId: string, incentiveId: string) {
  return { claim: { id: "dummy-claim", status: "approved" }, queued: false, position: 1 };
}

export async function processClaim(claimId: string, processorId: string) {
  return;
}

export async function advanceCycle() {
  return;
}

export async function submitPriorityRequest() {
  return { id: "dummy-priority", status: "pending" };
}

export async function getPayoutSummary() {
  return {
    pending_claims: 5,
    total_requested: 450000,
    pool_balance: 1250000,
    active_cycle: 4
  };
}
