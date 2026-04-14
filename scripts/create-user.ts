#!/usr/bin/env tsx
import { initDatabase, hashPassword, createUser, creditBillableHours, getDb } from '../src/db/database.js';

const email = process.argv[2];
const password = process.argv[3];
const displayName = process.argv[4] ?? '';
const firmName = process.argv[5] ?? '';

if (!email || !password) {
  console.error('Usage: tsx scripts/create-user.ts <email> <password> [displayName] [firmName]');
  process.exit(1);
}

async function main() {
  initDatabase();
  const db = getDb();

  let userId: string;
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email) as any;
  if (existing) {
    // Update password + verify
    const hash = await hashPassword(password);
    db.prepare("UPDATE users SET password_hash=?, email_verified=1, display_name=?, firm_name=? WHERE email=?")
      .run(hash, displayName, firmName, email);
    userId = existing.id;
    console.log('Updated user:', userId, email);
  } else {
    const hash = await hashPassword(password);
    const user = createUser(email, hash, displayName, firmName);
    db.prepare("UPDATE users SET email_verified=1 WHERE id=?").run(user.id);
    userId = user.id;
    console.log('Created user:', userId, email);
  }

  creditBillableHours(userId, 500, 'admin', 'Admin credit');
  console.log('✓ Email verified, 500h credited');
}

main();
