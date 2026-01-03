import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const quotations = await prisma.quotation.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(quotations);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    if (!finalQuotationNumber || finalQuotationNumber.toLowerCase().includes('draft')) {
      const year = new Date().getFullYear();
      // Use raw query or findMany to get the max sequential number reliably
      const lastQuotation = await prisma.quotation.findFirst({
        where: { 
          quotationNumber: { 
            startsWith: `${year}-`,
            not: { contains: 'DRAFT' } // Ensure we don't pick up leftovers
          } 
        },
        orderBy: { quotationNumber: 'desc' } // Order by string is safe for 'YYYY-NNN'
      });

      let nextSeq = 1;
      if (lastQuotation) {
        const parts = lastQuotation.quotationNumber.split('-');
        const lastSeq = parseInt(parts[1]);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }
      finalQuotationNumber = `${year}-${String(nextSeq).padStart(3, '0')}`;
    }

    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber: finalQuotationNumber,
        customerData: data.customerData,
        items: data.items,
        total: data.total,
        conditions: data.conditions,
      },
    });
    return NextResponse.json(quotation);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await prisma.quotation.delete({
      where: { id: parseInt(id) },
    });
    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
