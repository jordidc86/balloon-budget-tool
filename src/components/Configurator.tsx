'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Catalog, CatalogItem, SelectedItem, Vendor, ClientDetails } from '@/lib/types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ChevronLeft, 
  Save, 
  Download, 
  Package,
  User,
  FileText,
  Trash2,
  CreditCard,
  Plus,
  RefreshCw,
  Search
} from 'lucide-react';
import CategorySection from './CategorySection';
import { Card, Button, cn, Modal } from '@/components/ui';

export default function Configurator({ vendor, onBack }: { vendor: Vendor, onBack: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [discount, setDiscount] = useState<number>(0);
  const [clientDetails, setClientDetails] = useState<ClientDetails>({
    name: '',
    country: '',
    phone: '',
    email: ''
  });
  const [paymentTerms, setPaymentTerms] = useState<string>(
    `• All prices are in EUR, VAT not included\n• Payment conditions: 50% deposit and 50% down payment\n• Delivery time: 12 weeks from order confirmation\n• Shipping: Ex-Works (customer arranges shipping)\n• Taxes not included`
  );
  const [quotationNumber, setQuotationNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [loadRef, setLoadRef] = useState("");
  const [loadDate, setLoadDate] = useState("");
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  useEffect(() => {
    // Set draft numbering
    const year = new Date().getFullYear();
    setQuotationNumber(`${year}-DRAFT`);

    // Load catalog
    fetch(`/catalog-${vendor.toLowerCase()}.json`)
      .then(res => res.json())
      .then(setCatalog);
  }, [vendor]);

  const handleSelect = (item: CatalogItem, qty: number, customPrice?: number, customDescription?: string) => {
    const newItems = new Map(selectedItems);
    newItems.set(item.id, { item, quantity: qty, customPrice, customDescription });
    setSelectedItems(newItems);
  };

  const handleRemove = (itemId: string) => {
    const newItems = new Map(selectedItems);
    newItems.delete(itemId);
    setSelectedItems(newItems);
  };

  const selectedList = useMemo(() => Array.from(selectedItems.values()), [selectedItems]);

  const totalAmount = useMemo(() => {
    const rawTotal = selectedList.reduce((sum, { item, quantity, customPrice }) => {
      const price = customPrice !== undefined ? customPrice : item.price;
      return sum + (price * quantity);
    }, 0);
    const discountAmount = (rawTotal * discount) / 100;
    return Math.max(0, rawTotal - discountAmount);
  }, [selectedList, discount]);

  const selectedEnvelope = useMemo(() => {
    for (const selected of selectedItems.values()) {
      if (selected.item.category === "ENVELOPE" || selected.item.name.includes("Envelope")) {
        return selected.item.name;
      }
    }
    return null;
  }, [selectedItems]);

  const selectedBurner = useMemo(() => {
    for (const selected of selectedItems.values()) {
      if (selected.item.category === "BURNER") {
        return selected.item.name;
      }
    }
    return null;
  }, [selectedItems]);

  const handleLoadKit = async (kitName: string) => {
    try {
      const res = await fetch('/predefined-kits.json');
      const kits = await res.json();
      const vendorKits = kits[vendor.toLowerCase()];
      const kit = vendorKits.find((k: any) => k.name === kitName);

      if (kit && catalog) {
        const newItems = new Map();
        
        const findAndAdd = (catName: string, itemName: string) => {
          const item = catalog.categories
            .find(cat => cat.name.toUpperCase() === catName)
            ?.items.find(i => i.name === itemName);
          if (item) newItems.set(item.id, { item: { ...item, category: catName }, quantity: 1 });
        };

        findAndAdd("ENVELOPE", kit.envelope);
        findAndAdd("BASKET", kit.basket);
        findAndAdd("BURNER", kit.burner);
        
        setSelectedItems(newItems);
      }
    } catch (e) {
      console.error("Error loading kit:", e);
    }
  };

  const loadFromDb = async () => {
    if (!loadRef || !loadDate) {
      alert("Please enter both Reference Number and Date");
      return;
    }
    setIsLoadingQuote(true);
    try {
      const res = await fetch(`/api/quotations?number=${encodeURIComponent(loadRef)}&date=${loadDate}`);
      if (res.ok) {
        const quote = await res.json();
        // Map items back
        const newItems = new Map();
        quote.items.forEach((sel: any) => {
          newItems.set(sel.item.id, sel);
        });
        setSelectedItems(newItems);
        setClientDetails(quote.customerData);
        setQuotationNumber(quote.quotationNumber);
        setPaymentTerms(quote.conditions || "");
        setDiscount(0); // Optional: reset or load total
        setIsLoadModalOpen(false);
        alert("Quotation loaded successfully!");
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (e) {
      alert("Error connecting to server");
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const saveToDb = async (silent = false) => {
    if (!clientDetails.name) {
      if (!silent) alert('Please enter client name');
      return null;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotationNumber,
          customerData: clientDetails,
          items: selectedList,
          total: totalAmount,
          conditions: paymentTerms
        })
      });
      if (res.ok) {
        const result = await res.json();
        setQuotationNumber(result.quotationNumber);
        if (!silent) alert(`Quotation saved successfully! Reference: ${result.quotationNumber}`);
        return result.quotationNumber;
      }
      throw new Error("Save failed");
    } catch (e) {
      if (!silent) alert('Error saving quotation');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const generatePDF = async () => {
    if (isGenerating || saving) return; // Prevent multiple clicks
    
    setIsGenerating(true);
    let currentNum = quotationNumber;
    
    // Auto-save if it's a draft
    if (currentNum.toLowerCase().includes('draft')) {
      const savedNum = await saveToDb(true); // Silent save
      if (!savedNum) {
        setIsGenerating(false);
        alert("Error saving your quotation. Please check your connection and try again.");
        return; 
      }
      currentNum = savedNum;
    }

    try {
      const doc = new jsPDF() as any;
    const vendorColor = vendor === 'SCHROEDER' ? [200, 20, 30] : [30, 58, 138]; // Schroeder Red vs Pasha Blue
    
    // Add Logo
    try {
      const img = new Image();
      img.src = '/joint_logo.png';
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve; // Continue even if image fails
      });
      if (img.complete && img.naturalWidth > 0) {
        // Real ratio: 1840/1250 = 1.472. Narrowed by 10% = 1.325
        const h = 22;
        const w = h * 1.472 * 0.93;
        doc.addImage(img, 'JPEG', 15, 10, w, h, undefined, 'FAST');
      }
    } catch (e) {
      console.error("Logo error:", e);
    }

    // Header Right (Quotation Info)
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(28);
    doc.setFont(undefined, 'bold');
    doc.text("QUOTATION", 195, 25, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Ref No: ${currentNum}`, 195, 33, { align: 'right' });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 195, 38, { align: 'right' });
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 1);
    doc.text(`Valid until: ${validUntil.toLocaleDateString()}`, 195, 43, { align: 'right' });

    // Addresses
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("FROM:", 15, 55);
    doc.setFont(undefined, 'normal');
    if (vendor === 'SCHROEDER') {
      doc.text("THEO SCHROEDER fire balloons GmbH\nGewerbegebiet - Am Bahnhof 12\nD-54338 Schweich, Germany\nTel: +49 6502 930-4\nEmail: mail@schroederballon.de", 15, 61);
    } else {
      doc.text("Pasha Balloons d.o.o.\nPasha Valley 123\nIstanbul, Turkey\nTel: +90 123 456 789\nEmail: sales@pashaballoons.com", 15, 61);
    }

    doc.setFont(undefined, 'bold');
    doc.text("TO:", 120, 55);
    doc.setFont(undefined, 'normal');
    doc.text(`${clientDetails.name || '---'}\n${clientDetails.country || '---'}\n${clientDetails.email || '---'}\n${clientDetails.phone || '---'}`, 120, 61);

    // Items Table
    const tableBody = selectedList.map((sel, idx) => {
      const price = sel.customPrice !== undefined ? sel.customPrice : sel.item.price;
      const desc = sel.customDescription || sel.item.description;
      return [
        idx + 1,
        sel.item.name,
        desc,
        `€${price.toLocaleString()}`,
        sel.quantity,
        `€${(price * sel.quantity).toLocaleString()}`
      ];
    });

    autoTable(doc, {
        startY: 85,
        head: [['#', 'ITEM', 'DESCRIPTION', 'PRICE', 'QTY', 'TOTAL']],
        body: tableBody,
        theme: 'grid',
        headStyles: { 
          fillColor: vendor === 'SCHROEDER' ? [60, 60, 60] : [30, 58, 138], 
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 40, fontStyle: 'bold' },
            2: { cellWidth: 80, fontSize: 8 },
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 15, halign: 'center' },
            5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
        },
        styles: { fontSize: 9, cellPadding: 4, lineColor: [200, 200, 200] },
        alternateRowStyles: { fillColor: [252, 252, 252] }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Summary Box
    const boxWidth = 70;
    const boxX = 195 - boxWidth;
    doc.setFillColor(248, 250, 252);
    doc.rect(boxX, finalY, boxWidth, 35, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(boxX, finalY, boxWidth, 35, 'D');

    const rawTotal = selectedList.reduce((sum, { item, quantity, customPrice }) => {
      const price = customPrice !== undefined ? customPrice : item.price;
      return sum + (price * quantity);
    }, 0);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Subtotal:", boxX + 5, finalY + 10);
    doc.setTextColor(30, 41, 59);
    doc.text(`€${rawTotal.toLocaleString()}`, 190, finalY + 10, { align: 'right' });
    
    if (discount > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`Discount (${discount}%):`, boxX + 5, finalY + 17);
      doc.text(`-€${((rawTotal * discount) / 100).toLocaleString()}`, 190, finalY + 17, { align: 'right' });
    }

    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(vendorColor[0], vendorColor[1], vendorColor[2]);
    doc.text("TOTAL:", boxX + 5, finalY + 28);
    doc.text(`€${totalAmount.toLocaleString()}`, 190, finalY + 28, { align: 'right' });

    finalY += 45;

    // Terms
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.setFont(undefined, 'bold');
    doc.text("TERMS & CONDITIONS", 15, finalY);
    doc.setDrawColor(vendorColor[0], vendorColor[1], vendorColor[2]);
    doc.setLineWidth(0.5);
    doc.line(15, finalY + 2, 60, finalY + 2);

    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    const splitTerms = doc.splitTextToSize(paymentTerms, 180);
    doc.text(splitTerms, 15, finalY + 10);

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setDrawColor(230, 230, 230);
      doc.line(15, 280, 195, 280);
      doc.text(`Quotation #${currentNum}`, 15, 285);
      doc.text(`Issued: ${new Date().toLocaleDateString()}`, 105, 285, { align: 'center' });
      doc.text(`Page ${i} of ${pageCount}`, 195, 285, { align: 'right' });
      if (vendor === 'SCHROEDER') {
        doc.text("Bank Details: Contact mail@schroederballon.de for payment information", 15, 289);
      }
    }

    doc.save(`Quotation_${vendor}_${clientDetails.name || 'Draft'}.pdf`);
    } catch (e) {
      console.error("PDF Error:", e);
      alert("An error occurred during PDF generation.");
    } finally {
      setIsGenerating(false);
    }
  };



  if (!catalog) return <div className="p-20 text-center animate-pulse text-blue-400">Loading Configuration...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/70 backdrop-blur-xl p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
        <div className="flex items-center gap-6">
          <button 
            onClick={onBack} 
            className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-blue-500/20 rounded-2xl border border-white/5 hover:border-blue-500/50 transition-all duration-300 group"
          >
            <ChevronLeft className="w-6 h-6 text-gray-400 group-hover:text-blue-400" />
          </button>
          <div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-slate-900 via-blue-900 to-blue-600 bg-clip-text text-transparent tracking-tighter">
              {vendor} CONFIGURATOR
            </h1>
            <p className="text-slate-500 text-sm font-mono tracking-widest uppercase mt-1">Ref: {quotationNumber}</p>
          </div>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setIsLoadModalOpen(true)} className="bg-white border-slate-200 hover:border-blue-500/50 px-6 h-12 rounded-2xl font-bold uppercase tracking-widest text-xs text-slate-600">
            <Search className="w-4 h-4 mr-2" /> Load Quote
          </Button>
          <Button 
            onClick={generatePDF} 
            disabled={isGenerating || saving}
            className="bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 px-8 h-12 rounded-2xl font-bold uppercase tracking-widest text-xs text-white disabled:opacity-70 disabled:cursor-not-allowed min-w-[160px]"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" /> Export PDF
              </>
            )}
          </Button>
        </div>
      </header>

      <Modal 
        isOpen={isLoadModalOpen} 
        onClose={() => setIsLoadModalOpen(false)} 
        title="Load Quotation"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 mb-4 italic">Confirm identity by entering the exact reference number and date of issue.</p>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reference Number</label>
            <input
              placeholder="e.g. 2024-001"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-all"
              value={loadRef}
              onChange={e => setLoadRef(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date of Issue</label>
            <input
              type="date"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-all"
              value={loadDate}
              onChange={e => setLoadDate(e.target.value)}
            />
          </div>
          <Button 
            onClick={loadFromDb} 
            disabled={isLoadingQuote}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-widest text-xs rounded-2xl shadow-lg mt-4 disabled:opacity-50"
          >
            {isLoadingQuote ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : 'Verify & Load'}
          </Button>
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-8 space-y-8">
          {/* Kit Loader Banner */}
          <section className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl p-8 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700 text-blue-900">
              <Package className="w-32 h-32" />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">PREDEFINED KITS</h2>
                <p className="text-slate-500 text-sm">Quickly load standard configurations for optimized performance.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(vendor === 'SCHROEDER' ? ['SCH1', 'SCH2', 'SCH3'] : ['PH1', 'PH2', 'PH3']).map(kit => (
                  <button
                    key={kit}
                    onClick={() => handleLoadKit(kit)}
                    className="px-4 py-2 bg-white hover:bg-blue-600 hover:text-white text-slate-700 rounded-xl text-xs font-bold border border-slate-200 hover:border-blue-600 transition-all shadow-sm"
                  >
                    Load {kit}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Categories */}
          <div className="space-y-10">
            {catalog.categories.map(category => (
              <CategorySection
                key={category.name}
                category={category}
                selectedItems={selectedItems}
                selectedEnvelope={selectedEnvelope}
                selectedBurner={selectedBurner}
                vendorId={vendor}
                onSelect={handleSelect}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>

        {/* Sidebar Summary */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="sticky top-8 space-y-6">
            {/* Client Details Card */}
            <Card className="bg-white border-slate-200 p-6 rounded-3xl shadow-sm">
              <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <User className="w-4 h-4" /> Client Details
              </h3>
              <div className="space-y-4">
                <input
                  placeholder="Client Name"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  value={clientDetails.name}
                  onChange={e => setClientDetails({...clientDetails, name: e.target.value})}
                />
                <input
                  placeholder="Country"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  value={clientDetails.country}
                  onChange={e => setClientDetails({...clientDetails, country: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Phone"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    value={clientDetails.phone}
                    onChange={e => setClientDetails({...clientDetails, phone: e.target.value})}
                  />
                  <input
                    placeholder="Email"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    value={clientDetails.email}
                    onChange={e => setClientDetails({...clientDetails, email: e.target.value})}
                  />
                </div>
              </div>
            </Card>

            {/* Budget Summary Card */}
            <Card className="bg-white border-slate-200 p-6 rounded-3xl shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 blur-3xl -z-10" />
              <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Selected Items
              </h3>
              
              <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 mb-8">
                {selectedList.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-10 italic">Your budget is empty...</p>
                ) : (
                  selectedList.map(({ item, quantity, customPrice }) => (
                    <div key={item.id} className="flex justify-between items-center group animate-in fade-in slide-in-from-right-4">
                      <div className="flex-1 pr-4">
                        <p className="text-sm font-bold text-slate-800 line-clamp-1">{item.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {quantity} x €{(customPrice !== undefined ? customPrice : item.price).toLocaleString()}
                        </p>
                      </div>
                      <button onClick={() => handleRemove(item.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-100">
                 <div className="flex justify-between items-center text-xs text-slate-500 px-1">
                  <span>Gross Subtotal</span>
                  <span className="font-mono text-slate-900">€{selectedList.reduce((s, {item, quantity, customPrice}) => s + ((customPrice ?? item.price) * quantity), 0).toLocaleString()}</span>
                </div>
                
                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discount %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="flex-1 bg-transparent text-right font-mono text-blue-600 focus:outline-none"
                    value={discount}
                    onChange={e => setDiscount(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  />
                </div>
 
                <div className="flex justify-between items-center p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 mt-4">
                  <span className="text-xs font-black text-blue-100 uppercase tracking-widest">Net Total</span>
                  <span className="text-2xl font-black text-white">€{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </Card>

            {/* Payment Terms Card */}
            <Card className="bg-white border-slate-200 p-6 rounded-3xl shadow-sm">
              <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Payment Terms
              </h3>
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-[10px] text-slate-500 focus:border-blue-500 outline-none transition-all h-32 resize-none leading-relaxed"
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
              />
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
