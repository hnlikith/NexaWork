/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { withAuth, apiError, apiSuccess } from "@/middleware/auth";
import { getWalletSummary } from "@/services/walletService";

// GET /api/wallet — employee sees own wallet
export const GET = withAuth(async (req, authUser) => {
  const { searchParams } = new URL(req.url);
  const employeeId = authUser.role === "employee" ? authUser.userId : (searchParams.get("employeeId") ?? authUser.userId);

  try {
    const data = await getWalletSummary(employeeId);
    return apiSuccess(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Error fetching wallet");
  }
});
