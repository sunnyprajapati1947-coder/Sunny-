export { phones } from './data/phones.js';
import { phones } from './data/phones.js';
export const brands = [...new Set(phones.map(p => p.brand))].sort((a,b) => a.localeCompare(b));
export function searchPhones(brand, query = '') {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return phones.filter(p => (!brand || p.brand === brand) && words.every(w => `${p.brand} ${p.model} ${p.codes.join(' ')}`.toLocaleLowerCase().includes(w)));
}
