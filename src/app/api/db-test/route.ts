import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const envVars = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    SUPABASE_DATABASE_URL: !!process.env.SUPABASE_DATABASE_URL,
  };

  try {
    // Try to perform a simple query to check the connection
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ 
      status: 'OK', 
      message: 'Database connection successful',
      envVars 
    });
  } catch (error: any) {
    console.error('Database connection error:', error);
    return NextResponse.json(
      { 
        status: 'FAIL', 
        message: 'Database connection failed', 
        error: error.message,
        code: error.code,
        envVars
      },
      { status: 500 }
    );
  }
}
