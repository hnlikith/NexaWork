/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * Seed script for NexaWork.
 * Run: npm run seed
 *
 * Creates:
 *  - 1 Super Admin
 *  - 1 HR user
 *  - 3 Employees
 *  - System Config
 *  - Sample KPI scores + Incentives + Wallet
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import User from "../models/User";
import SystemConfig from "../models/SystemConfig";
import KpiScore from "../models/KpiScore";
import Wallet from "../models/Wallet";
import Incentive from "../models/Incentive";
import Transaction from "../models/Transaction";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/nexawork";

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    SystemConfig.deleteMany({}),
    KpiScore.deleteMany({}),
    Wallet.deleteMany({}),
    Incentive.deleteMany({}),
    Transaction.deleteMany({}),
  ]);
  console.log("Cleared existing data");

  // Create System Config
  const config = await SystemConfig.create({
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
    payout_pool_amount: 500000,
    payout_capacity: "HIGH",
    current_claim_cycle: 1,
  });
  console.log("System config created");

  // Create users
  const superAdmin = await User.create({
    name: "Arjun Sharma",
    email: "admin@example.com",
    password: "Admin@123",
    role: "admin",
    employeeId: "SA001",
    department: "Management",
    designation: "Super Administrator",
    joiningDate: new Date("2022-01-01"),
  });

  const hrUser = await User.create({
    name: "Priya Mehta",
    email: "hr@example.com",
    password: "Hr@12345",
    role: "admin",
    employeeId: "HR001",
    department: "Human Resources",
    designation: "HR Manager",
    joiningDate: new Date("2022-03-15"),
  });

  const employees = await User.insertMany([
    {
      name: "Rahul Verma",
      email: "rahul@example.com",
      password: "Emp@12345",
      role: "employee",
      employeeId: "EMP001",
      department: "Engineering",
      designation: "Software Engineer",
      joiningDate: new Date("2023-01-10"),
    },
    {
      name: "Sneha Patel",
      email: "sneha@example.com",
      password: "Emp@12345",
      role: "employee",
      employeeId: "EMP002",
      department: "Marketing",
      designation: "Marketing Executive",
      joiningDate: new Date("2023-04-01"),
    },
    {
      name: "Amit Joshi",
      email: "amit@example.com",
      password: "Emp@12345",
      role: "employee",
      employeeId: "EMP003",
      department: "Engineering",
      designation: "Senior Engineer",
      joiningDate: new Date("2022-06-15"),
    },
  ]);
  console.log(`Created ${employees.length + 2} users`);

  // Create wallets for all users
  for (const emp of [...employees, hrUser]) {
    await Wallet.create({ employee: emp._id });
  }
  await Wallet.create({ employee: superAdmin._id });

  // Create KPI scores for employees
  const now = new Date();
  for (const emp of employees) {
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const kpi = Math.floor(Math.random() * 30) + 65;
      const kra = Math.floor(Math.random() * 30) + 65;
      await KpiScore.create({
        employee: emp._id,
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        kpi_score: kpi,
        kra_score: kra,
        final_score: parseFloat(((kpi * 0.5 + kra * 0.5)).toFixed(2)),
        enteredBy: hrUser._id,
        remarks: "Monthly review complete",
      });
    }
  }
  console.log("KPI scores seeded");

  // Create sample incentives
  for (const emp of employees) {
    const vestingStart = new Date();
    const vestingEnd = new Date();
    vestingEnd.setDate(vestingEnd.getDate() + 30);

    // Past incentive — already vested and claimable
    const pastVestEnd = new Date();
    pastVestEnd.setDate(pastVestEnd.getDate() - 5);
    const pastVestStart = new Date();
    pastVestStart.setDate(pastVestStart.getDate() - 35);

    const pastInc = await Incentive.create({
      employee: emp._id,
      amount: 5000,
      base_amount: 5000,
      status: "claimable",
      month: now.getMonth() === 0 ? 12 : now.getMonth(),
      year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
      vesting_start: pastVestStart,
      vesting_end: pastVestEnd,
      hold_months: 0,
      bonus_applied: 0,
    });

    // Update wallet
    const wallet = await Wallet.findOne({ employee: emp._id });
    if (wallet) {
      wallet.earned_total += 5000;
      wallet.claimable_amount += 5000;
      await wallet.save();
    }

    await Transaction.create({
      employee: emp._id,
      type: "incentive_earned",
      amount: 5000,
      balance_after: wallet?.claimable_amount ?? 5000,
      reference_id: pastInc._id,
      reference_model: "Incentive",
      description: "Incentive earned and vested",
    });

    // Current month — locked
    const lockedInc = await Incentive.create({
      employee: emp._id,
      amount: 6000,
      base_amount: 6000,
      status: "locked",
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      vesting_start: vestingStart,
      vesting_end: vestingEnd,
      hold_months: 0,
      bonus_applied: 0,
    });

    if (wallet) {
      wallet.earned_total += 6000;
      wallet.locked_amount += 6000;
      await wallet.save();
    }

    await Transaction.create({
      employee: emp._id,
      type: "incentive_earned",
      amount: 6000,
      balance_after: wallet?.claimable_amount ?? 0,
      reference_id: lockedInc._id,
      reference_model: "Incentive",
      description: "Incentive awarded — under vesting",
    });
  }
  console.log("Incentives seeded");

  console.log("\n✅ Seed complete!\n");
  console.log("Login credentials:");
  console.log("  Super Admin : admin@example.com / Admin@123");
  console.log("  HR          : hr@example.com / Hr@12345");
  console.log("  Employee 1  : rahul@example.com / Emp@12345");
  console.log("  Employee 2  : sneha@example.com / Emp@12345");
  console.log("  Employee 3  : amit@example.com / Emp@12345\n");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
