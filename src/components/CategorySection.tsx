'use client';

import React, { useState } from 'react';
import { CatalogCategory, CatalogItem, SelectedItem } from '@/lib/types';
import { getCategoryBehavior } from '@/lib/category-logic';
import { getCompatibleBaskets, getCompatibleBurners } from '@/lib/compatibility';
import { Card, Button, cn } from '@/components/ui';
import { ChevronDown, Check, Trash2, Plus, Info } from 'lucide-react';

interface CategorySectionProps {
  category: CatalogCategory;
  selectedItems: Map<string, SelectedItem>;
  selectedEnvelope: string | null;
  selectedBurner?: string | null;
  vendorId: string;
  onSelect: (item: CatalogItem, qty: number, customPrice?: number, customDescription?: string) => void;
  onRemove: (itemId: string) => void;
}

export default function CategorySection({
  category,
  selectedItems,
  selectedEnvelope,
  selectedBurner,
  vendorId,
  onSelect,
  onRemove
}: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const behavior = getCategoryBehavior(category.name);

  // Filter items based on compatibility
  const filteredItems = (() => {
    const categoryUpper = category.name.toUpperCase();

    // Only filter BASKET and BURNER categories if an envelope is selected
    if (!selectedEnvelope && categoryUpper !== "BURNER FRAME") return category.items;

    if (categoryUpper === "BASKET") {
      if (!selectedEnvelope) return category.items;
      const compatibleBaskets = getCompatibleBaskets(vendorId, selectedEnvelope!);
      return category.items.filter(item => compatibleBaskets.includes(item.name));
    }

    if (categoryUpper === "BURNER") {
      if (!selectedEnvelope) return category.items;
      const compatibleBurners = getCompatibleBurners(vendorId, selectedEnvelope!);
      return category.items.filter(item => compatibleBurners.includes(item.name));
    }

    // Burner Frame Filtering Logic
    if (categoryUpper === "BURNER FRAME" && selectedBurner) {
      const burnerUpper = selectedBurner.toUpperCase();
      let requiredType = "";
      if (burnerUpper.includes("DOUBLE")) requiredType = "DOUBLE";
      else if (burnerUpper.includes("TRIPLE")) requiredType = "TRIPLE";
      else if (burnerUpper.includes("QUAD")) requiredType = "QUADRUPLE";
      else if (burnerUpper.includes("QUADRUPLE")) requiredType = "QUADRUPLE";

      if (requiredType) {
        return category.items.filter(item => item.name.toUpperCase().includes(requiredType));
      }
    }

    return category.items;
  })();

  const getSelection = (id: string) => selectedItems.get(id);
  const isSelected = (id: string) => selectedItems.has(id);

  const currentSelectedItem = behavior === "single"
    ? filteredItems.find(item => isSelected(item.id))
    : null;

  const handleSingleSelect = (item: CatalogItem) => {
    filteredItems.forEach(i => {
      if (isSelected(i.id)) onRemove(i.id);
    });
    onSelect({ ...item, category: category.name }, 1);
    setIsOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-blue-600 uppercase tracking-widest">{category.name}</h3>
        <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full uppercase font-mono">
          {filteredItems.length} options
        </span>
      </div>

      {behavior === 'single' ? (
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "w-full text-left p-4 rounded-2xl border flex justify-between items-center transition-all duration-300",
              "bg-white border-slate-200 hover:border-blue-500/50 shadow-sm",
              isOpen && "border-blue-500 ring-2 ring-blue-500/10 shadow-md"
            )}
          >
            <span className={cn("font-medium", currentSelectedItem ? 'text-slate-900' : 'text-slate-400')}>
              {currentSelectedItem ? currentSelectedItem.name : `Select ${category.name}...`}
            </span>
            <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform duration-300", isOpen && "rotate-180")} />
          </button>

          {isOpen && (
            <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {filteredItems.length === 0 ? (
                  <div className="p-4 text-gray-500 text-sm italic">No compatible items found.</div>
                ) : (
                  filteredItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSingleSelect(item)}
                      className="w-full p-4 text-left hover:bg-blue-50 flex justify-between items-center group transition-colors border-b border-slate-50 last:border-0"
                    >
                      <span className="text-slate-600 group-hover:text-blue-700 font-medium">{item.name}</span>
                      <span className="text-blue-600 font-mono text-sm">
                        {item.price === 0 ? "FREE" : `€${item.price.toLocaleString()}`}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {currentSelectedItem && (
            <Card className="mt-3 bg-blue-50/50 border-blue-100 p-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <h4 className="font-bold text-slate-900">{currentSelectedItem.name}</h4>
                  </div>
                  <p className="text-xs text-slate-500 whitespace-pre-wrap leading-relaxed">{currentSelectedItem.description}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                   <div className="font-mono font-bold text-blue-600">
                      {currentSelectedItem.price === 0 ? "FREE" : `€${currentSelectedItem.price.toLocaleString()}`}
                    </div>
                    <button
                      onClick={() => onRemove(currentSelectedItem.id)}
                      className="p-2 text-slate-300 hover:text-rose-500 transition-colors mt-2"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                </div>
              </div>
              
              {(currentSelectedItem.name.toUpperCase().includes("ARTWORK") || currentSelectedItem.name.toUpperCase().includes("HYPERLAST")) && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-tighter">Custom Description / Notes</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 focus:border-blue-500 outline-none transition-all"
                      placeholder="Enter specific details..."
                      value={getSelection(currentSelectedItem.id)?.customDescription || ""}
                      onChange={(e) => onSelect({ ...currentSelectedItem, category: category.name }, 1, undefined, e.target.value)}
                    />
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredItems.map(item => {
            const checked = isSelected(item.id);
            const selection = getSelection(item.id);
            const isCustomizable = item.name.toUpperCase().includes("ARTWORK") || item.name.toUpperCase().includes("HYPERLAST");
            const isArtwork = item.name.toUpperCase().includes("ARTWORK");

            return (
              <Card 
                key={item.id} 
                className={cn(
                  "p-4 transition-all duration-300 border-2",
                  checked ? "bg-blue-50 border-blue-500 shadow-md" : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
                )}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => {
                      if (checked) onRemove(item.id);
                      else onSelect({ ...item, category: category.name }, 1);
                    }}
                    className={cn(
                      "mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                      checked ? "bg-blue-500 border-blue-500" : "bg-transparent border-white/10 hover:border-white/30"
                    )}
                  >
                    {checked && <Check className="w-4 h-4 text-white" />}
                  </button>

                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <span className={cn("font-bold transition-colors", checked ? "text-slate-900" : "text-slate-600")}>
                        {item.name}
                      </span>
                      <span className="font-mono text-sm text-blue-600 font-bold">
                        {item.price === 0 && !isArtwork ? "FREE" : `€${item.price.toLocaleString()}`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{item.description}</p>

                    {checked && (
                      <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="flex flex-wrap gap-4">
                          {behavior === 'multi-qty' && (
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-black text-slate-400 tracking-tighter">Quantity</label>
                              <div className="flex items-center gap-2">
                                <Button 
                                  variant="outline" 
                                  className="h-8 w-8 p-0 min-h-0 rounded-lg border-slate-200"
                                  onClick={() => onSelect({ ...item, category: category.name }, Math.max(1, (selection?.quantity || 1) - 1), selection?.customPrice, selection?.customDescription)}
                                >-</Button>
                                <input
                                  type="number"
                                  className="w-12 bg-slate-50 border border-slate-200 rounded-lg h-8 text-center text-sm font-mono text-slate-900"
                                  value={selection?.quantity || 1}
                                  onChange={(e) => onSelect({ ...item, category: category.name }, parseInt(e.target.value) || 1, selection?.customPrice, selection?.customDescription)}
                                />
                                <Button 
                                  variant="outline" 
                                  className="h-8 w-8 p-0 min-h-0 rounded-lg border-slate-200"
                                  onClick={() => onSelect({ ...item, category: category.name }, (selection?.quantity || 1) + 1, selection?.customPrice, selection?.customDescription)}
                                >+</Button>
                              </div>
                            </div>
                          )}

                          {isArtwork && (
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-black text-slate-400 tracking-tighter">Custom Price (€)</label>
                              <input
                                type="number"
                                className="w-32 bg-slate-50 border border-slate-200 rounded-lg h-8 px-3 text-sm font-mono text-blue-600 outline-none focus:border-blue-500"
                                value={selection?.customPrice || 0}
                                onChange={(e) => onSelect({ ...item, category: category.name }, selection?.quantity || 1, parseFloat(e.target.value) || 0, selection?.customDescription)}
                              />
                            </div>
                          )}
                        </div>

                        {isCustomizable && (
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-black text-slate-400 tracking-tighter">Custom Notes</label>
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-600 outline-none focus:border-blue-500"
                              placeholder="Describe artwork or custom features..."
                              value={selection?.customDescription || ""}
                              onChange={(e) => onSelect({ ...item, category: category.name }, selection?.quantity || 1, selection?.customPrice, e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
