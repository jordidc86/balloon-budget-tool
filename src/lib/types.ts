export type Vendor = 'SCHROEDER' | 'PASHA';

export interface Product {
  id: string;
  category: string;
  name: string;
  price: number;
  description: string;
  compatibleWith?: string[];
}

export interface Kit {
  id: string;
  name: string;
  items: string[];
  discount: number;
}

export interface Catalog {
  vendor: Vendor;
  products: Product[];
  kits: Kit[];
}

export interface QuotationItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}
