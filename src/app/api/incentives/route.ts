/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, apiError, apiSuccess, authenticate } from "@/middleware/auth";
import { awardIncentive, getIncentiveSummary, processVesting } from "@/services/incentiveService";
import { z } from "zod";

const AwardSchema = z.object({
  employee: z.string(),
  amount: z.number().positive().optional(),
  fixed_amount: z.number().min(0).optional(),
  variable_amount: z.number().min(0).optional(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  const hasBreakdown = data.fixed_amount !== undefined || data.variable_amount !== undefined;
  if (!hasBreakdown && data.amount === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fixed_amount"],
      message: "Provide amount or fixed/variable split",
    });
  }
});

// GET /api/incentives — employee sees own, admin sees by employeeId
export const GET = withAuth(async (req, authUser) => {
  const { searchParams } = new URL(req.url);
  const isAdmin = authUser.role === "admin";
  // Admins must pass ?employeeId to pick a target; everyone else defaults to self.
  const employeeId = isAdmin
    ? searchParams.get("employeeId")
    : (searchParams.get("employeeId") || authUser.userId);

  if (!employeeId) return apiError("employeeId required", 400);

  try {
    const summary = await getIncentiveSummary(employeeId);
    return apiSuccess(summary);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Error fetching summary");
  }
});

// POST /api/incentives — HR/Admin award incentive
export const POST = withAuth(async (req) => {
  const body = await req.json();

  // Special action: process vesting
  if (body.action === "process_vesting") {
    const count = await processVesting();
    return apiSuccess({ message: `${count} incentives vested` });
  }

  const result = AwardSchema.safeParse(body);
  if (!result.success) return apiError(JSON.stringify(result.error.errors), 400);

  const data = result.data;
  const fixedAmount = data.fixed_amount ?? data.amount ?? 0;
  const variableAmount = data.variable_amount ?? 0;

  try {
    const incentive = await awardIncentive(
      data.employee,
      fixedAmount,
      variableAmount,
      data.month,
      data.year,
      data.notes
    );
    return apiSuccess({ incentive }, 201);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Error awarding incentive");
  }
}, "admin");
