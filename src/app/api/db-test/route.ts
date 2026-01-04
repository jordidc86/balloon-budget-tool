import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Safer connection test using standard findFirst instead of raw query
    await prisma.quotation.findFirst({ select: { id: true } });
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
