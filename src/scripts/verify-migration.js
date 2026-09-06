/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function verifyMigration() {
  if (!supabaseKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔍 Checking migration status...\n');

  const tables = ['teams', 'project_members'];
  let allTablesExist = true;

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);

      if (error && error.code === 'PGRST116') {
        console.log(`❌ Table '${table}' not found`);
        allTablesExist = false;
      } else if (error && error.code === 'PGRST205') {
        console.log(`❌ Table '${table}' not found in schema`);
        allTablesExist = false;
      } else if (error) {
        console.log(`⚠️  ${table}: ${error.message}`);
      } else {
        console.log(`✅ Table '${table}' exists`);
      }
    } catch (err) {
      console.log(`❌ Error checking '${table}': ${err.message}`);
      allTablesExist = false;
    }
  }

  console.log('\n' + '='.repeat(50));
  if (!allTablesExist) {
    console.log('\n⚠️  Some tables are missing!');
    console.log('\n📝 To apply the migration manually:');
    console.log('  1. Go to Supabase Dashboard: https://app.supabase.com');
    console.log('  2. Select your project');
    console.log('  3. Go to SQL Editor (left sidebar)');
    console.log('  4. Click "New Query"');
    console.log('  5. Copy the SQL from: src/supabase/migrations/046_teams_and_project_members.sql');
    console.log('  6. Paste it into the editor');
    console.log('  7. Click "Run" button');
    console.log('\n📋 SQL Migration Location: ' + require('path').resolve('src/supabase/migrations/046_teams_and_project_members.sql'));
  } else {
    console.log('\n✅ All migration tables are set up correctly!');
  }
}

verifyMigration();
