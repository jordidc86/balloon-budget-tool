import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Try to perform a simple query to check the connection
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'OK', message: 'Database connection successful' });
  } catch (error: any) {
    console.error('Database connection error:', error);
    return NextResponse.json(
      { status: 'FAIL', message: 'Database connection failed', error: error.message },
      { status: 500 }
    );
  }
}
