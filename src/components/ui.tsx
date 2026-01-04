'use client';

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Trash2 } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ 
  children, 
  className,
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}

export function Button({ 
  children, 
  variant = 'primary', 
  className, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' }) {
  return (
    <button 
      className={cn(
        variant === 'primary' ? 'btn-primary' : 'btn-outline',
        className
      )} 
      {...props}
    >
      {children}
    </button>
  );
}

export function DbStatus() {
  const [status, setStatus] = React.useState<'LOADING' | 'OK' | 'FAIL'>('LOADING');

  React.useEffect(() => {
    fetch('/api/db-test')
      .then(res => res.ok ? setStatus('OK') : setStatus('FAIL'))
      .catch(() => setStatus('FAIL'));
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={cn(
        "px-3 py-1 rounded-full text-xs font-mono border backdrop-blur-sm transition-all duration-500",
        status === 'LOADING' && "bg-slate-100/50 border-slate-200 text-slate-400",
        status === 'OK' && "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm",
        status === 'FAIL' && "bg-rose-50 border-rose-200 text-rose-600 shadow-sm"
      )}>
        DB: {status}
      </div>
    </div>
  );
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode 
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <Trash2 className="w-4 h-4 text-slate-400 rotate-45" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
