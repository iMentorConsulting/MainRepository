import { PrismaClient, Role, ProgramCategory } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create admin user
  const adminHash = await bcrypt.hash('Admin@2024!', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@i-mentor.gr' },
    update: {},
    create: {
      name: 'Administrator',
      email: 'admin@i-mentor.gr',
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  })
  console.log('Admin user created:', admin.email)

  // Create sample accountant
  const accountant = await prisma.accountant.upsert({
    where: { id: 'sample-accountant-1' },
    update: {},
    create: {
      id: 'sample-accountant-1',
      officeName: 'Λογιστικό Γραφείο Παπαδόπουλος',
      contactPerson: 'Γιώργος Παπαδόπουλος',
      email: 'papadopoulos@logistiko.gr',
      phone: '2101234567',
      address: 'Σταδίου 10, Αθήνα 10562',
      active: true,
    },
  })
  console.log('Accountant created:', accountant.officeName)

  // Create accountant user
  const accountantHash = await bcrypt.hash('Test@2024!', 12)
  const accountantUser = await prisma.user.upsert({
    where: { email: 'logistis@test.gr' },
    update: {},
    create: {
      name: 'Γιώργος Παπαδόπουλος',
      email: 'logistis@test.gr',
      passwordHash: accountantHash,
      role: Role.ACCOUNTANT,
      accountantId: accountant.id,
    },
  })
  console.log('Accountant user created:', accountantUser.email)

  // Create ESPA program
  const espaProgram = await prisma.program.create({
    data: {
      title: 'ΕΣΠΑ 2024 - Ψηφιακός Μετασχηματισμός ΜΜΕ',
      category: ProgramCategory.ESPA,
      description:
        'Πρόγραμμα ενίσχυσης μικρομεσαίων επιχειρήσεων για ψηφιακό μετασχηματισμό. Επιδότηση έως 50% για επενδύσεις σε τεχνολογία και λογισμικό.',
      kadRules: ['47', '62', '63', '58'],
      regionRules: ['Αττική', 'Θεσσαλονίκη', 'Αθήνα'],
      zipCodeRules: [],
      minRegdate: '2015-01-01',
      maxRegdate: '2022-12-31',
      legalStatusRules: ['ΕΠΕ', 'ΑΕ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ'],
      active: true,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      internalNotes: 'Προτεραιότητα σε επιχειρήσεις με ΚΑΔ τεχνολογίας',
    },
  })
  console.log('ESPA program created:', espaProgram.title)

  // Create DYPA program
  const dypaProgram = await prisma.program.create({
    data: {
      title: 'ΔΥΠΑ - Επιδότηση Νέων Θέσεων Εργασίας 2024',
      category: ProgramCategory.DYPA,
      description:
        'Πρόγραμμα επιδότησης για δημιουργία νέων θέσεων εργασίας. Κάλυψη μισθολογικού κόστους έως 12 μήνες.',
      kadRules: [],
      regionRules: [],
      zipCodeRules: [],
      minRegdate: '2010-01-01',
      maxRegdate: null,
      legalStatusRules: [],
      active: true,
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-11-30'),
      internalNotes: 'Χωρίς περιορισμό ΚΑΔ ή περιοχής',
    },
  })
  console.log('DYPA program created:', dypaProgram.title)

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
