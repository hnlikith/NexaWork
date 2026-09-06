/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment.');
  process.exit(1);
}

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const migrationFile = path.join(__dirname, '../supabase/migrations/046_teams_and_project_members.sql');
    const sql = fs.readFileSync(migrationFile, 'utf-8');

    console.log('Creating Supabase client...');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Executing migration...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('Migration error:', error);
      return;
    }

    console.log('✓ Migration completed successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

runMigration();
