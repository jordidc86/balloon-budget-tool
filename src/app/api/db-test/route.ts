import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const envVars = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    SUPABASE_DATABASE_URL: !!process.env.SUPABASE_DATABASE_URL,
    DATABASE_URL_PREVIEW: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[0].substring(0, 20) + '...' + process.env.DATABASE_URL.split('@')[1] : 'none',
    SUPABASE_DATABASE_URL_PREVIEW: process.env.SUPABASE_DATABASE_URL ? process.env.SUPABASE_DATABASE_URL.split('@')[0].substring(0, 20) + '...' + process.env.SUPABASE_DATABASE_URL.split('@')[1] : 'none',
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
