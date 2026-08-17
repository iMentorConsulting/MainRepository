import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

// Plain `throw new Error(...)` inside authorize() gets swallowed by Auth.js
// into a generic "Configuration" error on the client — these CredentialsSignin
// subclasses carry a `code` that survives to `signIn()`'s returned `error`,
// so the login page can show the real reason instead.
export class RateLimitedSignin extends CredentialsSignin { code = 'rate_limited' }
export class EmailNotVerifiedSignin extends CredentialsSignin { code = 'email_not_verified' }
export class AccountantNotApprovedSignin extends CredentialsSignin { code = 'accountant_not_approved' }

// Simple in-memory login rate limiter: max 5 attempts per email per 15 minutes.
// Resets on deploy/restart, but stops automated credential-stuffing/brute-force
// attempts within a running instance.
const LOGIN_ATTEMPT_LIMIT = 5
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS })
    return false
  }
  return entry.count >= LOGIN_ATTEMPT_LIMIT
}

function recordFailedAttempt(key: string) {
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS })
  } else {
    entry.count += 1
  }
}

function clearFailedAttempts(key: string) {
  loginAttempts.delete(key)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 4 * 60 * 60 },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.accountantId = (user as any).accountantId
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role as string
        session.user.accountantId = token.accountantId as string | null
        session.user.id = token.id as string
      }
      return session
    }
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(1)
        }).safeParse(credentials)
        if (!parsed.success) return null
        const email = parsed.data.email.toLowerCase()

        if (isRateLimited(email)) {
          throw new RateLimitedSignin()
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          recordFailedAttempt(email)
          return null
        }
        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) {
          recordFailedAttempt(email)
          return null
        }
        if (user.role === 'ACCOUNTANT' && user.verifyToken && !user.emailVerified) {
          throw new EmailNotVerifiedSignin()
        }
        if (user.role === 'ACCOUNTANT' && user.accountantId) {
          const accountant = await prisma.accountant.findUnique({ where: { id: user.accountantId }, select: { approved: true } })
          if (accountant && !accountant.approved) {
            throw new AccountantNotApprovedSignin()
          }
        }
        clearFailedAttempts(email)
        const now = new Date()
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } }),
          prisma.loginLog.create({ data: { userId: user.id } }),
        ]).catch(() => {})
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          accountantId: user.accountantId
        }
      }
    })
  ]
})
