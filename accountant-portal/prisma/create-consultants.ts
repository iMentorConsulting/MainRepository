import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// One-off setup script for the two I-MENTOR consultant accounts.
// Run once against the target database: npx tsx prisma/create-consultants.ts
// Generates a random temporary password for each new account and prints it
// to the console — never committed, so it must be copied immediately and
// the user prompted to change it on first login.
const consultants = [
  { name: 'Χρήστος', email: 'christos@i-mentor.gr' },
  { name: 'Ελευθερία', email: 'eleftheria@i-mentor.gr' },
]

function randomPassword() {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + '!1'
}

async function main() {
  for (const c of consultants) {
    const existing = await prisma.user.findUnique({ where: { email: c.email } })
    if (existing) {
      console.log(`Skipped (already exists): ${c.email}`)
      continue
    }
    const password = randomPassword()
    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.user.create({
      data: { name: c.name, email: c.email, passwordHash, role: 'CONSULTANT', emailVerified: new Date() },
    })
    console.log(`Created: ${c.email} / temp password: ${password}`)
  }
}

main().finally(() => prisma.$disconnect())
