export type Vendor = 'SCHROEDER' | 'PASHA';

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category?: string;
}

export interface CatalogCategory {
  name: string;
  items: CatalogItem[];
}

export interface Catalog {
  categories: CatalogCategory[];
}

export interface ClientDetails {
  name: string;
  country: string;
  phone: string;
  email: string;
}

export interface SelectedItem {
  item: CatalogItem;
  quantity: number;
  customPrice?: number;
  customDescription?: string;
}

export interface CompatibilityRules {
  [vendor: string]: {
    [envelope: string]: {
      baskets: string[];
      burners: string[];
    };
  };
}
