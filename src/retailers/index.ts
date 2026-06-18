import type { RetailerPlugin } from '@/types';
import { WalmartRetailer } from './walmart';
import { TargetRetailer }  from './target';
// import { HomeDepotRetailer } from './homedepot';

// Registry of all available retailer plugins
const RETAILERS: RetailerPlugin[] = [
  new TargetRetailer(),
  new WalmartRetailer(),
  // Home Depot disabled (2026-06-18): crawlerbros/homedepot-scraper returns no
  // price field, and cirkit/home-depot-product-scraper is too slow (PDP enrich
  // times out past the sync budget). Re-enable when a fast, price-returning
  // Home Depot actor is wired into homedepot.ts.
  // new HomeDepotRetailer(),
  // Add more retailers here as they are implemented:
  // new WalgreensRetailer(),
  // new CvsRetailer(),
  // new KohlsRetailer(),
  // new MacysRetailer(),
  // new LowesRetailer(),
  // new OfficeDepotRetailer(),
  // new VitacostRetailer(),
  // new IherbRetailer(),
  // new VitaminShoppeRetailer(),
  // new PetcoRetailer(),
  // new PetsmartRetailer(),
  // new ChewyRetailer(),
  // new GameStopRetailer(),
  // new StaplesRetailer(),
  // new NordstromRetailer(),
];

export function getRetailer(name: string): RetailerPlugin | undefined {
  return RETAILERS.find((r) => r.name.toLowerCase() === name.toLowerCase());
}

export function getAllRetailers(): RetailerPlugin[] {
  return RETAILERS;
}

export function getRetailerNames(): string[] {
  return RETAILERS.map((r) => r.name);
}
