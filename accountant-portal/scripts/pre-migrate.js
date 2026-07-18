// Runs BEFORE prisma db push to safely migrate enum values
// Adds new enum variants, updates existing rows, so prisma db push can drop the old ones
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('>>> Pre-migration: adding new ProgramCategory enum values...')

  // ADD VALUE cannot run inside a transaction in PostgreSQL.
  // Using $executeRawUnsafe with autocommit (Prisma does not wrap these in a tx by default).
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "ProgramCategory" ADD VALUE IF NOT EXISTS 'MICROCREDITS'`)
    console.log('  Added MICROCREDITS')
  } catch (e) { console.log('  MICROCREDITS skip:', e.message) }

  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "ProgramCategory" ADD VALUE IF NOT EXISTS 'DYPA_OAED'`)
    console.log('  Added DYPA_OAED')
  } catch (e) { console.log('  DYPA_OAED skip:', e.message) }

  // Migrate existing data so no rows use the old values
  // Wrapped in try-catch: if the old enum value no longer exists, skip silently
  try {
    const microloan = await prisma.$executeRawUnsafe(
      `UPDATE "Program" SET category = 'MICROCREDITS' WHERE category = 'MICROLOANS'`
    )
    console.log(`  Migrated ${microloan} MICROLOANS → MICROCREDITS`)
  } catch (e) { console.log('  MICROLOANS migration skip (already done):', e.message) }

  try {
    const loan = await prisma.$executeRawUnsafe(
      `UPDATE "Program" SET category = 'OTHER' WHERE category = 'LOAN'`
    )
    console.log(`  Migrated ${loan} LOAN → OTHER`)
  } catch (e) { console.log('  LOAN migration skip (already done):', e.message) }

  console.log('>>> Pre-migration done.')
}

main()
  .catch(e => { console.error('Pre-migration error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
