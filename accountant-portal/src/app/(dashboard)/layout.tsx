import { DashboardShell } from '@/components/layout/dashboard-shell'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) {
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') || '/'
    redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`)
  }

  let pendingApproval = false
  if (session.user.role === 'ACCOUNTANT' && session.user.accountantId) {
    const accountant = await prisma.accountant.findUnique({ where: { id: session.user.accountantId }, select: { approved: true } })
    pendingApproval = !!accountant && !accountant.approved
  }

  return (
    <DashboardShell pendingApproval={pendingApproval}>
      {children}
    </DashboardShell>
  )
}
