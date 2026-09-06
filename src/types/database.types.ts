/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Auto-generate this file by running:
// npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/types/database.types.ts
//
// Manual type definitions below — replace with generated types after Supabase project is set up

// Final role model. Manager-ness (dept_lead / team_lead) is now expressed via
// is_dept_lead / is_team_lead boolean flags on the employees table, NOT as a
// separate role. See supabase/migrations/00000001_role_model.sql.
export type Role = "admin" | "hr" | "accounts" | "employee" | "intern" | "dept_lead" | "team_lead";

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string;
          name: string;
          email: string;
          employee_id: string;
          role: Role;
          department: string | null;
          designation: string | null;
          team_id: string | null;
          joining_date: string | null;
          is_active: boolean;
          employment_type: "full_time" | "part_time" | "internship";
          salary_structure: "fixed_monthly" | "hourly" | "daily" | "stipend";
          base_salary: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["employees"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
      };
      teams: {
        Row: {
          id: string;
          name: string;
          department: string;
          lead_id: string | null;
          member_count: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["teams"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["teams"]["Insert"]>;
      };
      attendance_logs: {
        Row: {
          id: string;
          employee_id: string;
          date: string;
          clock_in: string | null;
          clock_out: string | null;
          status: "present" | "absent" | "late" | "half_day";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["attendance_logs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["attendance_logs"]["Insert"]>;
      };
      leave_requests: {
        Row: {
          id: string;
          employee_id: string;
          type: "casual" | "sick" | "earned" | "unpaid";
          from_date: string;
          to_date: string;
          days: number;
          reason: string;
          status: "pending" | "approved" | "rejected";
          approved_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["leave_requests"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["leave_requests"]["Insert"]>;
      };
      kpi_scores: {
        Row: {
          id: string;
          employee_id: string;
          month: number;
          year: number;
          kra_score: number;
          kpi_score: number;
          behavioral_score: number;
          final_score: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["kpi_scores"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["kpi_scores"]["Insert"]>;
      };
      incentives: {
        Row: {
          id: string;
          employee_id: string;
          month: number;
          year: number;
          fixed_amount: number;
          variable_amount: number;
          total_amount: number;
          status: "locked" | "claimable" | "held" | "claimed";
          vesting_start: string;
          vesting_end: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["incentives"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["incentives"]["Insert"]>;
      };
      payroll_runs: {
        Row: {
          id: string;
          employee_id: string;
          month: number;
          year: number;
          base_salary: number;
          incentive_amount: number;
          deductions: number;
          gross_pay: number;
          net_pay: number;
          status: "draft" | "processed" | "paid";
          processed_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payroll_runs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["payroll_runs"]["Insert"]>;
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          client_id: string | null;
          vendor_id: string | null;
          amount: number;
          tax: number;
          total: number;
          status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
          due_date: string;
          type: "receivable" | "payable";
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["invoices"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
      };
      vendors: {
        Row: {
          id: string;
          name: string;
          contact_person: string | null;
          email: string | null;
          phone: string | null;
          category: string;
          total_paid: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["vendors"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["vendors"]["Insert"]>;
      };
      subscriptions: {
        Row: {
          id: string;
          name: string;
          team_id: string | null;
          assigned_to: string | null;
          cost_monthly: number;
          renewal_date: string;
          status: "active" | "inactive" | "expiring_soon";
          category: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["subscriptions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
      };
      team_budgets: {
        Row: {
          id: string;
          team_id: string;
          month: number;
          year: number;
          budget_amount: number;
          spent_amount: number;
          status: "on_track" | "warning" | "over_budget";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["team_budgets"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["team_budgets"]["Insert"]>;
      };
      leads: {
        Row: {
          id: string;
          name: string;
          company: string | null;
          email: string | null;
          phone: string | null;
          source: string | null;
          stage: "new" | "contacted" | "proposal" | "negotiation" | "won" | "lost";
          deal_value: number;
          assigned_to: string | null;
          follow_up_date: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["leads"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
      };
      clients: {
        Row: {
          id: string;
          company_name: string;
          contact_person: string;
          email: string | null;
          phone: string | null;
          total_revenue: number;
          last_activity: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["clients"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
      };
      channels: {
        Row: {
          id: string;
          name: string;
          type: "text" | "voice" | "announcement";
          org_id: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["channels"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_id: string;
          sender_name: string;
          content: string;
          file_url: string | null;
          file_name: string | null;
          file_type: string | null;
          file_size: number | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      meetings: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          scheduled_at: string;
          duration_minutes: number;
          meet_link: string | null;
          organizer_id: string;
          status: "scheduled" | "completed" | "cancelled";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["meetings"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["meetings"]["Insert"]>;
      };
      system_config: {
        Row: {
          id: string;
          revenue: number;
          profit_percentage: number;
          expense_percentage: number;
          company_stage: string;
          vesting_days: number;
          bonus_percentage_1m: number;
          bonus_percentage_2m: number;
          claim_limit: number;
          payout_pool_amount: number;
          payout_capacity: "HIGH" | "MODERATE" | "LOW";
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["system_config"]["Row"], "id" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["system_config"]["Insert"]>;
      };
      wallets: {
        Row: {
          id: string;
          employee_id: string;
          earned_total: number;
          locked_amount: number;
          claimable_amount: number;
          held_amount: number;
          claimed_amount: number;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["wallets"]["Row"], "id" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["wallets"]["Insert"]>;
      };
      wallet_transactions: {
        Row: {
          id: string;
          employee_id: string;
          type: string;
          amount: number;
          balance_after: number;
          reference_id: string | null;
          reference_model: string | null;
          description: string | null;
          meta: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["wallet_transactions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["wallet_transactions"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string;
          action: string;
          table_name: string;
          record_id: string;
          old_values: Record<string, unknown> | null;
          new_values: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at">;
        Update: never;
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      role: Role;
    };
  };
};
