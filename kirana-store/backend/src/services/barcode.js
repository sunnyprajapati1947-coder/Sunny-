// Barcode helpers: EAN-13/EAN-8/UPC-A validation + internal barcode generation
export function eanCheckDigit(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}
export function isValidEAN13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  return eanCheckDigit(code.slice(0, 12)) === code[12];
}
export function isValidEAN8(code) {
  if (!/^\d{8}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(code[i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10) === code[7];
}
export function normalizeUPC(code) {
  if (/^\d{12}$/.test(code)) return '0' + code; // UPC-A -> EAN-13
  return code;
}
export function detectBarcodeType(code) {
  if (/^\d{13}$/.test(code)) return isValidEAN13(code) ? 'EAN-13' : 'EAN-13 (invalid check)';
  if (/^\d{12}$/.test(code)) return 'UPC-A';
  if (/^\d{8}$/.test(code)) return 'EAN-8';
  return 'CODE-128';
}
// Internal barcodes for loose/unlabelled items: prefix 20 + 9-digit seq + check digit
export function generateInternalBarcode(seq) {
  const body = '20' + String(seq).padStart(10, '0').slice(0, 10);
  return body + eanCheckDigit(body);
}
// Weight barcode (scale mode): 21 + 5-digit item ref + 5-digit weight(g)/price + check
export function generateWeightBarcode(itemRef, weightGrams) {
  const body = '21' + String(itemRef).padStart(5, '0').slice(-5) + String(Math.round(weightGrams)).padStart(5, '0').slice(-5);
  return body + eanCheckDigit(body);
}
