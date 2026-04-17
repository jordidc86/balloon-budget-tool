'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Catalog, CatalogItem, SelectedItem, Vendor, ClientDetails } from '@/lib/types';

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

const formatCurrency = (amount: number | undefined | null) => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '0,00 €';
  }
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

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
  const [availableKits, setAvailableKits] = useState<any[]>([]);

  useEffect(() => {
    // Set draft numbering
    const year = new Date().getFullYear();
    setQuotationNumber(`${year}-DRAFT`);

    const cacheBuster = `?v=${Date.now()}`;
    // Load catalog
    fetch(`/catalog-${vendor.toLowerCase()}.json${cacheBuster}`)
      .then(res => res.json())
      .then(setCatalog);

    // Load predefined kits
    fetch(`/predefined-kits.json${cacheBuster}`)
      .then(res => res.json())
      .then(data => {
        setAvailableKits(data[vendor.toLowerCase()] || []);
      });
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
      const price = customPrice !== undefined ? customPrice : (item?.price || 0);
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
      const cacheBuster = `?v=${Date.now()}`;
      const res = await fetch(`/predefined-kits.json${cacheBuster}`);
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

        if (kit.envelope) findAndAdd("ENVELOPE", kit.envelope);
        if (kit.basket) findAndAdd("BASKET", kit.basket);
        if (kit.burner) findAndAdd("BURNER", kit.burner);

        if (kit.items && Array.isArray(kit.items)) {
          kit.items.forEach((kitItem: any) => {
            for (const category of catalog.categories) {
              const item = category.items.find(i => i.id === kitItem.id);
              if (item) {
                newItems.set(item.id, { 
                  item: { ...item, category: category.name }, 
                  quantity: kitItem.quantity || 1,
                  customPrice: kitItem.customPrice,
                  customDescription: kitItem.customDescription
                });
                break;
              }
            }
          });
        }
        
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
    let attempts = 3;
    let lastError = null;

    while (attempts > 0) {
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
          setSaving(false);
          return result.quotationNumber;
        }
        
        const errorData = await res.json();
        throw new Error(errorData.error || "Save failed");
      } catch (e: any) {
        lastError = e;
        attempts--;
        if (attempts > 0) {
          // Wait briefly before retrying pool-related errors
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }

    // After all attempts
    if (!silent) alert(`Error saving quotation: ${lastError?.message || 'Unknown error'}`);
    setSaving(false);
    return null;
  };

  const printQuotation = async () => {
    if (isGenerating || saving) return; // Prevent multiple clicks
    
    setIsGenerating(true);
    let currentNum = quotationNumber;
    
    // Auto-save if it's a draft
    if (currentNum.toLowerCase().includes('draft')) {
      currentNum = "TEST-2024-001";
    }

    try {
      if (!selectedList || selectedList.length === 0) {
        throw new Error("No items selected in the budget.");
      }

      const vendorColorHex = vendor === 'SCHROEDER' ? '#c8141e' : '#1e3a8a';
      const vendorBgHex = vendor === 'SCHROEDER' ? '#3c3c3c' : '#1e3a8a';

      // Addresses
      const fromAddress = vendor === 'SCHROEDER' 
        ? "THEO SCHROEDER fire balloons GmbH\nGewerbegebiet - Am Bahnhof 12\nD-54338 Schweich, Germany\nTel: +49 6502 930-4\nEmail: mail@schroederballon.de"
        : "Pasha Balloons d.o.o.\nPasha Valley 123\nIstanbul, Turkey\nTel: +90 123 456 789\nEmail: sales@pashaballoons.com";

      const clientLines = [
        clientDetails.name,
        clientDetails.contactPerson ? `Att: ${clientDetails.contactPerson}` : null,
        clientDetails.country,
        clientDetails.email,
        clientDetails.phone
      ].filter(Boolean) as string[];

      const validUntil = new Date();
      validUntil.setMonth(validUntil.getMonth() + 1);

      // Total calculations
      const rawTotal = selectedList.reduce((sum, { item, quantity, customPrice }) => {
        const price = customPrice !== undefined ? customPrice : (item?.price || 0);
        return sum + (price * quantity);
      }, 0);
      const hasDiscount = discount > 0;
      const discountAmount = (rawTotal * discount) / 100;

      // Table rows
      const tableRows = selectedList.map((sel, idx) => {
        const price = sel.customPrice !== undefined ? sel.customPrice : (sel.item?.price || 0);
        const name = sel.item?.name || "Unnamed Item";
        const desc = sel.customDescription || sel.item?.description || "";
        const qty = sel.quantity || 0;
        
        return `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td><strong>${name}</strong><br/><span style="font-size:10px;color:#666;">${desc}</span></td>
            <td class="text-right">${formatCurrency(price)}</td>
            <td class="text-center">${qty}</td>
            <td class="text-right"><strong>${formatCurrency(price * qty)}</strong></td>
          </tr>
        `;
      }).join('');

      // We need to carefully escape the HTML generation
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Quotation ${currentNum}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; font-size: 12px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
            .logo { height: 60px; }
            .quote-title { text-align: right; }
            .quote-title h1 { margin: 0; font-size: 24px; color: #444; }
            .quote-title p { margin: 2px 0; color: #777; font-size: 10px; }
            .addresses { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .address-box { width: 45%; }
            .address-title { font-weight: bold; font-size: 10px; margin-bottom: 8px; color: #555; }
            .address-content { white-space: pre-wrap; font-size: 11px; line-height: 1.4; color: #000; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background-color: ${vendorBgHex}; color: white; padding: 10px; text-align: left; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            td { padding: 10px; border-bottom: 1px solid #eee; font-size: 11px; vertical-align: top; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .summary { width: 100%; display: flex; justify-content: flex-end; margin-bottom: 40px; }
            .summary-box { width: 300px; background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .summary-total { font-weight: bold; font-size: 16px; color: ${vendorColorHex}; margin-top: 10px; padding-top: 10px; border-top: 1px solid #ccc; }
            .terms { font-size: 10px; color: #555; border-top: 2px solid ${vendorColorHex}; padding-top: 10px; page-break-inside: avoid; }
            .terms-title { font-weight: bold; margin-bottom: 8px; color: #333; font-size: 11px; }
            .terms-content { white-space: pre-wrap; line-height: 1.4; }
            @media print {
              body { padding: 0; }
              @page { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${window.location.origin}/joint_logo.png" class="logo" alt="Logo" />
            <div class="quote-title">
              <h1>QUOTATION</h1>
              <p>Ref No: ${currentNum}</p>
              <p>Date: ${new Date().toLocaleDateString()}</p>
              <p>Valid until: ${validUntil.toLocaleDateString()}</p>
            </div>
          </div>
          
          <div class="addresses">
            <div class="address-box">
              <div class="address-title">FROM:</div>
              <div class="address-content">${fromAddress}</div>
            </div>
            <div class="address-box">
              <div class="address-title">TO:</div>
              <div class="address-content">${clientLines.join('\n')}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th class="text-center" style="width: 5%">#</th>
                <th style="width: 45%">ITEM / DESCRIPTION</th>
                <th class="text-right" style="width: 15%">PRICE</th>
                <th class="text-center" style="width: 10%">QTY</th>
                <th class="text-right" style="width: 25%">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-box">
              <div class="summary-row">
                <span>Subtotal:</span>
                <span>${formatCurrency(rawTotal)}</span>
              </div>
              ${hasDiscount ? `
              <div class="summary-row" style="color: #dc2626;">
                <span>Discount (${discount}%):</span>
                <span>-${formatCurrency(discountAmount)}</span>
              </div>
              ` : ''}
              <div class="summary-row summary-total">
                <span>TOTAL:</span>
                <span>${formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          <div class="terms">
            <div class="terms-title">TERMS & CONDITIONS</div>
            <div class="terms-content">${String(paymentTerms || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          </div>
          
          <script>
            // Automatically trigger print dialog when images load
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
      } else {
        alert("Please allow popups for this website to print the quotation.");
      }

    } catch (e: any) {
      console.error("Print Generation Error:", e);
      alert(`An error occurred: ${e?.message || 'Check console for details'}`);
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
            onClick={printQuotation} 
            disabled={isGenerating || saving}
            className="bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 px-8 h-12 rounded-2xl font-bold uppercase tracking-widest text-xs text-white disabled:opacity-70 disabled:cursor-not-allowed min-w-[160px]"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Preparing...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" /> Print Quote
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
                {availableKits.map(kit => (
                  <button
                    key={kit.id}
                    onClick={() => handleLoadKit(kit.name)}
                    className="px-4 py-2 bg-white hover:bg-blue-600 hover:text-white text-slate-700 rounded-xl text-xs font-bold border border-slate-200 hover:border-blue-600 transition-all shadow-sm"
                  >
                    Load {kit.name}
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
                <input
                  placeholder="Contact Person (Representative)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  value={clientDetails.contactPerson || ''}
                  onChange={e => setClientDetails({...clientDetails, contactPerson: e.target.value})}
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
                          {quantity} x {formatCurrency(customPrice !== undefined ? customPrice : item.price)}
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
                  <span>Gross Subtotal</span>
                  <span className="font-mono text-slate-900">{formatCurrency(selectedList.reduce((s, {item, quantity, customPrice}) => s + ((customPrice ?? (item?.price || 0)) * quantity), 0))}</span>
                
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
                  <span className="text-2xl font-black text-white">{formatCurrency(totalAmount)}</span>
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
