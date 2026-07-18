// Runs BEFORE prisma db push to safely migrate enum values
// Adds new enum variants, updates existing rows, so prisma db push can drop the old ones
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('>>> Pre-migration: checking enum values...')

  // MICROCREDITS is in the Prisma schema — add it before db push in case it's missing
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "ProgramCategory" ADD VALUE IF NOT EXISTS 'MICROCREDITS'`)
    console.log('  MICROCREDITS ok')
  } catch (e) { console.log('  MICROCREDITS skip:', e.message) }

  // Migrate any rows using old enum values that no longer exist in the schema
  try {
    const microloan = await prisma.$executeRawUnsafe(
      `UPDATE "Program" SET category = 'MICROCREDITS' WHERE category::text = 'MICROLOANS'`
    )
    console.log(`  Migrated ${microloan} MICROLOANS → MICROCREDITS`)
  } catch (e) { console.log('  MICROLOANS migration skip:', e.message) }

  try {
    const loan = await prisma.$executeRawUnsafe(
      `UPDATE "Program" SET category = 'OTHER' WHERE category::text = 'LOAN'`
    )
    console.log(`  Migrated ${loan} LOAN → OTHER`)
  } catch (e) { console.log('  LOAN migration skip:', e.message) }

  try {
    const dypa = await prisma.$executeRawUnsafe(
      `UPDATE "Program" SET category = 'DYPA' WHERE category::text = 'DYPA_OAED'`
    )
    console.log(`  Migrated ${dypa} DYPA_OAED → DYPA`)
  } catch (e) { console.log('  DYPA_OAED migration skip:', e.message) }

  console.log('>>> Pre-migration done.')
}

main()
  .catch(e => { console.error('Pre-migration error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
