'use client';

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ 
  children, 
  className,
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass-card p-6", className)} {...props}>
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
