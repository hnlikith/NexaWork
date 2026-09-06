/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * Init script — creates only the system config.
 * No dummy users. Real users are created via the Admin panel.
 * Run: npx tsx src/scripts/init.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import SystemConfig from "../models/SystemConfig";

async function init() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log("Connected to MongoDB Atlas");

  await SystemConfig.deleteMany({});
  await SystemConfig.create({
    company_revenue: 100000,
    profit_percentage: 30,
    expense_percentage: 70,
    company_stage: "Very early-stage startup",
    equity_min_percentage: 2.5,
    equity_max_percentage: 10,
    revenue_achievement_percentage: 84,
    collections_percentage: 87,
    delivery_health_percentage: 75,
    vesting_days: 30,
    bonus_percentage_1m: 5,
    bonus_percentage_2m: 10,
    claim_limit: 25,
    payout_pool_amount: 0,
    payout_capacity: "HIGH",
    current_claim_cycle: 1,
  });

  console.log("✅ System config initialised. Add your first admin via the API or MongoDB Atlas.");
  await mongoose.disconnect();
}

init().catch((err) => { console.error(err); process.exit(1); });
