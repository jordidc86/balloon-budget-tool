'use client';

import React, { useState } from 'react';
import { Vendor } from '@/lib/types';
import Configurator from '@/components/Configurator';
import { Card } from '@/components/ui';

export default function Home() {
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  if (selectedVendor) {
    return <Configurator vendor={selectedVendor} onBack={() => setSelectedVendor(null)} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <div className="max-w-4xl w-full space-y-12 mb-20 animate-in fade-in zoom-in duration-1000">
        <div className="space-y-4">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter bg-gradient-to-b from-white to-blue-500 bg-clip-text text-transparent">
            BALLOON BUDGET TOOL
          </h1>
          <p className="text-blue-400/80 text-lg md:text-xl font-medium uppercase tracking-widest">
            Schroeder & Pasha Manufacturers
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
          <VendorCard 
            name="SCHROEDER" 
            image="https://www.schroeder-balloon.de/wp-content/uploads/2019/12/logo-schroeder-fire-balloons.png"
            color="hover:border-blue-500/50"
            onClick={() => setSelectedVendor('SCHROEDER')}
          />
          <VendorCard 
            name="PASHA" 
            image="https://pashaballoons.com/wp-content/uploads/2021/05/pasha-balloons-logo.png"
            color="hover:border-blue-400/50"
            onClick={() => setSelectedVendor('PASHA')}
          />
        </div>
      </div>

      <footer className="fixed bottom-10 text-white/20 text-xs font-mono tracking-widest uppercase">
        Professional Aerospace Budgeting System v1.0
      </footer>
    </div>
  );
}

function VendorCard({ name, onClick, color }: { name: string, onClick: () => void, color: string }) {
  return (
    <Card 
      className={`group cursor-pointer transition-all duration-500 hover:-translate-y-2 flex flex-col items-center justify-center p-12 min-h-[300px] border-2 border-transparent ${color}`}
      onClick={onClick}
    >
      <div className="text-4xl font-black tracking-tighter mb-4 transition-transform duration-500 group-hover:scale-110">
        {name}
      </div>
      <div className="w-12 h-1 bg-white/10 group-hover:w-24 group-hover:bg-blue-500 transition-all duration-500" />
      <p className="mt-6 text-sm text-gray-500 group-hover:text-blue-300 transition-colors uppercase tracking-widest font-bold">
        Enter Catalog
      </p>
    </Card>
  );
}
