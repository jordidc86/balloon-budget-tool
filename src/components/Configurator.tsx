'use client';

import React, { useState, useEffect } from 'react';
import { Catalog, Product, QuotationItem, Vendor } from '@/lib/types';
import { Card, Button, cn } from '@/components/ui';
import { Trash2, Plus, Download, Save, ChevronLeft } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export default function Configurator({ vendor, onBack }: { vendor: Vendor, onBack: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [conditions, setConditions] = useState('Payment: 50% deposit, 50% upon delivery.');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/catalog-${vendor.toLowerCase()}.json`)
      .then(res => res.json())
      .then(setCatalog);
  }, [vendor]);

  const addItem = (product: Product) => {
    const existing = items.find(i => i.productId === product.id);
    if (existing) {
      setItems(items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { productId: product.id, name: product.name, price: product.price, quantity: 1 }]);
    }
  };

  const addKit = (kit: any) => {
    const kitItems = catalog?.products.filter(p => kit.items.includes(p.id)) || [];
    const newItems = [...items];
    kitItems.forEach(p => {
      const existing = newItems.find(i => i.productId === p.id);
      if (existing) existing.quantity += 1;
      else newItems.push({ productId: p.id, name: p.name, price: p.price * (1 - kit.discount), quantity: 1 });
    });
    setItems(newItems);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.productId !== id));
  };

  const total = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  // Compatibility logic: if a basket is selected, filter burners.
  const selectedBasketIds = items.filter(i => {
    const p = catalog?.products.find(prod => prod.id === i.productId);
    return p?.category === 'Basket';
  }).map(i => i.productId);

  const filteredProducts = catalog?.products.filter(p => {
    if (p.category === 'Burner' && selectedBasketIds.length > 0) {
      return p.compatibleWith?.some(c => selectedBasketIds.includes(c));
    }
    return true;
  });

  const generatePDF = () => {
    const doc = new jsPDF() as any;
    doc.setFontSize(20);
    doc.text(`QUOTATION - ${vendor}`, 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Client: ${customer.name}`, 14, 35);
    doc.text(`Email: ${customer.email}`, 14, 40);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 45);

    const tableData = items.map((item, idx) => [
      idx + 1,
      item.name,
      item.quantity,
      `${item.price.toLocaleString()} €`,
      `${(item.price * item.quantity).toLocaleString()} €`
    ]);

    doc.autoTable({
      startY: 55,
      head: [['#', 'Description', 'Qty', 'Unit Price', 'Total']],
      body: tableData,
      foot: [['', '', '', 'NET TOTAL', `${total.toLocaleString()} €`]],
      theme: 'grid',
      headStyles: { fillStyle: '#1e3a8a' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Conditions:", 14, finalY);
    doc.setFontSize(9);
    doc.text(conditions, 14, finalY + 7);

    doc.save(`Quotation_${vendor}_${customer.name || 'Draft'}.pdf`);
  };

  const saveQuotation = async () => {
    if (!customer.name) return alert('Please enter client name');
    setSaving(true);
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({
          quotationNumber: `QT-${Date.now()}`,
          customerData: customer,
          items,
          total,
          conditions
        })
      });
      if (res.ok) alert('Saved successfully!');
      else alert('Failed to save');
    } catch (e) {
      alert('Error saving');
    } finally {
      setSaving(false);
    }
  };

  if (!catalog) return <div className="p-20 text-center animate-pulse text-blue-400">Loading Catalog...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-blue-400 bg-clip-text text-transparent">
            {vendor} CONFIGURATOR
          </h1>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={saveQuotation} disabled={saving} className="flex gap-2 items-center">
            <Save className="w-4 h-4" /> Save
          </Button>
          <Button onClick={generatePDF} className="flex gap-2 items-center shadow-blue-500/20 shadow-xl">
            <Download className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Catalog Section */}
        <div className="lg:col-span-2 space-y-8">
          {/* Kits Section */}
          {catalog.kits.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">★</span>
                Recommended Kits
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {catalog.kits.map(kit => (
                  <Card key={kit.id} className="border-blue-500/30 bg-blue-500/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 px-3 py-1 bg-blue-600 text-[10px] font-bold tracking-tighter rounded-bl-lg">
                      {Math.round(kit.discount * 100)}% OFF
                    </div>
                    <h3 className="text-lg font-bold mb-1">{kit.name}</h3>
                    <p className="text-xs text-gray-400 mb-4 italic">Complete setup with bundle discount.</p>
                    <Button onClick={() => addKit(kit)} className="w-full py-2 text-xs">
                      Select Kit
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Products Grid */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">📦</span>
              Browse Catalog
              {selectedBasketIds.length > 0 && (
                <span className="text-xs font-normal text-blue-400 ml-2 animate-pulse">(Filtered by compatibility)</span>
              )}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProducts?.map(product => (
                <Card key={product.id} className="group hover:border-blue-500/50 transition-all duration-300">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">{product.category}</span>
                    <span className="text-lg font-mono font-bold text-blue-300">{product.price.toLocaleString()} €</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">{product.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{product.description}</p>
                  <Button variant="outline" onClick={() => addItem(product)} className="w-full flex gap-2 items-center justify-center py-2 text-sm">
                    <Plus className="w-4 h-4" /> Add to Budget
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        </div>

        {/* Summary Section */}
        <div className="space-y-6">
          <Card className="sticky top-10 border-blue-500/30">
            <h2 className="text-xl font-bold mb-6 border-b border-white/10 pb-4">Budget Summary</h2>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Client Name</label>
                <input 
                  type="text" 
                  value={customer.name}
                  onChange={e => setCustomer({...customer, name: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-colors"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Email</label>
                <input 
                  type="email" 
                  value={customer.email}
                  onChange={e => setCustomer({...customer, email: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-colors"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div className="space-y-3 min-h-[100px] max-h-[400px] overflow-y-auto pr-2 mb-8">
              {items.length === 0 && <p className="text-center text-gray-500 text-sm py-4 italic">No items added yet</p>}
              {items.map(item => (
                <div key={item.productId} className="flex justify-between items-center group">
                  <div className="flex-1">
                    <p className="text-sm font-medium leading-tight">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.quantity} x {item.price.toLocaleString()} €</p>
                  </div>
                  <button onClick={() => removeItem(item.productId)} className="text-gray-500 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Net Total</span>
                <span className="text-2xl font-bold text-blue-400">{total.toLocaleString()} €</span>
              </div>
            </div>

            <div className="mt-6">
              <label className="text-xs text-gray-400 block mb-1">Payment Conditions</label>
              <textarea 
                value={conditions}
                onChange={e => setConditions(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:border-blue-500 outline-none transition-colors h-20 resize-none"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
