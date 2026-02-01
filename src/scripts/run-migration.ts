/**
 * Simple migration runner using node-postgres
 */
import { pool } from '../db/connection';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function runMigration(): Promise<void> {
  const migrationPath = join(__dirname, '../../migrations/005_sandbox_config.sql');
  console.log(`[Migration] Reading from ${migrationPath}`);
  
  try {
    const sql = await readFile(migrationPath, 'utf-8');
    console.log('[Migration] Executing SQL...');
    await pool.query(sql);
    console.log('[Migration] Success!');
    process.exit(0);
  } catch (error) {
    console.error('[Migration] Failed:', error);
    process.exit(1);
  }
}

void runMigration();
