# ⚠️ DEPRECATED — DO NOT USE THIS FOLDER FOR NEW DEPLOYMENTS

The 97 SQL files under `src/supabase/migrations/` are the **historical**
migration trail of the current production database. They are preserved here
for reference and audit.

**They will NOT replay cleanly on a fresh Supabase project.** Specifically:

- Seven sets of duplicate-numbered filenames (017, 048, 050, 060, 084, 085, 098)
- `084` → `085` → `086` repeatedly DROP/recreate the `user_role` enum with
  incompatible value sets, which breaks order dependencies
- `096_seed_departments_teams.sql` hardcodes a "Namaah" org structure that
  doesn't belong on a clean prod deploy
- `000_CLEAR_ALL_DATA.sql` is nuclear and must not be auto-run

## What to use instead

The canonical Supabase deployment lives at the project root:

```
supabase/
├── config.toml
├── migrations/
│   ├── 00000000_baseline.sql       # pg_dump of current schema (see header)
│   └── 00000001_role_model.sql     # final 4-role model + manager flags + employee_permissions
├── storage/
│   └── buckets.sql
└── README.md                        # full deploy guide
```

See `supabase/README.md` for step-by-step instructions to deploy to a new
Supabase project.

## Why we kept this folder

Two reasons:
1. **Historical context** — if you want to see how a feature evolved or when a
   column was added, the answer is in these files.
2. **Generating the baseline** — `supabase/migrations/00000000_baseline.sql`
   is meant to be a `pg_dump` of the CURRENT production schema. Until that
   dump exists, the files here are the only source-of-truth representation
   of the schema.

Once `00000000_baseline.sql` is filled with the real schema dump, this folder
is purely archival.
