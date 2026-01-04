const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  try {
    console.log('Attempting to connect to DB: ' + process.env.DATABASE_URL.split('@')[1]);
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log('Success:', result);
  } catch (e) {
    console.error('Connection failed:');
    console.error(e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
