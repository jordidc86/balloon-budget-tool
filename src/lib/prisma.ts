import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Inyectamos pgbouncer=true dinámicamente si no está, para evitar 
// errores de 'prepared statement' en Serverless Functions (Netlify/Vercel) con PostgreSQL Connection Poolers
let connectionString = process.env.DATABASE_URL || '';
if (connectionString && !connectionString.includes('pgbouncer=true')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'pgbouncer=true';
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'], // Reducimos ruido de logs en producción
    datasources: {
      db: {
        url: connectionString,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
