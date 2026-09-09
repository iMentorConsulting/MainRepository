// Run with: node scripts/reset-admin.js
// Resets admin password without ts-node
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('Admin@2024!', 12)
  const user = await prisma.user.upsert({
    where: { email: 'info@i-mentor.gr' },
    update: { passwordHash: hash, role: 'ADMIN' },
    create: { name: 'I-MENTOR Admin', email: 'info@i-mentor.gr', passwordHash: hash, role: 'ADMIN' },
  })
  console.log('Admin password reset for:', user.email)
}

main().catch(console.error).finally(() => prisma.$disconnect())
