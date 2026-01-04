import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Basic connection test
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ 
      status: 'OK', 
      message: 'Database connection successful'
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        status: 'FAIL', 
        message: 'Database connection failed', 
        error: error.message 
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
