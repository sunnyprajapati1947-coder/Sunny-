import * as XLSX from 'xlsx'
import type { Product, Unit } from '../types'
import { toPaise } from './money'

export interface ImportRow {
  barcode: string | null
  name_en: string
  name_hi: string
  category: string | null
  brand: string | null
  unit: Unit
  is_loose: boolean
  purchase_price: number
  selling_price: number
  mrp: number
  gst_rate: number
  stock_qty: number
  low_stock_limit: number
  expiry_date: string | null
  hsn_code: string | null
  rowNumber: number
}

export interface ImportResult {
  rows: ImportRow[]
  errors: { row: number; message: string }[]
}

export const PRODUCT_TEMPLATE_HEADERS = [
  'barcode',
  'name_en',
  'name_hi',
  'category',
  'brand',
  'unit',
  'purchase_price',
  'selling_price',
  'mrp',
  'gst_rate',
  'stock_qty',
  'low_stock_limit',
  'expiry_date',
  'hsn_code',
]

const HEADER_ALIASES: Record<string, string> = {
  barcode: 'barcode',
  'barcode / ean': 'barcode',
  ean: 'barcode',
  name: 'name_en',
  'name (english)': 'name_en',
  name_en: 'name_en',
  'product name': 'name_en',
  'name hindi': 'name_hi',
  name_hi: 'name_hi',
  'हिंदी नाम': 'name_hi',
  category: 'category',
  brand: 'brand',
  unit: 'unit',
  'purchase price': 'purchase_price',
  purchase_price: 'purchase_price',
  cost: 'purchase_price',
  'selling price': 'selling_price',
  selling_price: 'selling_price',
  price: 'selling_price',
  mrp: 'mrp',
  'gst %': 'gst_rate',
  'gst rate': 'gst_rate',
  gst: 'gst_rate',
  gst_rate: 'gst_rate',
  'stock qty': 'stock_qty',
  stock: 'stock_qty',
  stock_qty: 'stock_qty',
  quantity: 'stock_qty',
  'low stock': 'low_stock_limit',
  low_stock_limit: 'low_stock_limit',
  'low stock limit': 'low_stock_limit',
  'expiry date': 'expiry_date',
  expiry: 'expiry_date',
  expiry_date: 'expiry_date',
  hsn: 'hsn_code',
  hsn_code: 'hsn_code',
  'is loose': 'is_loose',
  is_loose: 'is_loose',
}

const VALID_UNITS: Unit[] = ['pcs', 'kg', 'g', 'litre', 'ml', 'packet', 'dozen', 'box']
const UNIT_ALIASES: Record<string, Unit> = {
  pc: 'pcs',
  pcs: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  नग: 'pcs',
  kg: 'kg',
  किलो: 'kg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  litre: 'litre',
  liter: 'litre',
  ltr: 'litre',
  l: 'litre',
  लीटर: 'litre',
  ml: 'ml',
  packet: 'packet',
  pkt: 'packet',
  pack: 'packet',
  पैकेट: 'packet',
  dozen: 'dozen',
  box: 'box',
}

function normalizeHeader(header: unknown): string {
  const key = String(header ?? '').trim().toLowerCase()
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, '_')
}

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(String(value).replace(/[₹,\s]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

function parseDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const raw = cleanString(value)
  if (!raw) return null
  // Excel serial date
  if (/^\d{5}$/.test(raw)) {
    const parsed = XLSX.SSF.parse_date_code(Number(raw))
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return null
}

export async function parseProductFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { rows: [], errors: [{ row: 0, message: 'File is empty' }] }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const rows: ImportRow[] = []
  const errors: { row: number; message: string }[] = []

  raw.forEach((record, index) => {
    const rowNumber = index + 2
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      normalized[normalizeHeader(key)] = value
    }
    const nameEn = cleanString(normalized.name_en || normalized.name)
    const nameHi = cleanString(normalized.name_hi) || nameEn
    if (!nameEn && !nameHi) {
      errors.push({ row: rowNumber, message: 'Product name is missing' })
      return
    }
    const rawUnit = cleanString(normalized.unit).toLowerCase()
    const unit = UNIT_ALIASES[rawUnit] ?? (VALID_UNITS.includes(rawUnit as Unit) ? (rawUnit as Unit) : 'pcs')
    const sellingPrice = toNumber(normalized.selling_price)
    if (sellingPrice <= 0) {
      errors.push({ row: rowNumber, message: `Selling price must be greater than 0 (${nameEn || nameHi})` })
      return
    }
    const gstRate = toNumber(normalized.gst_rate)
    const barcode = cleanString(normalized.barcode) || null
    rows.push({
      barcode,
      name_en: nameEn || nameHi,
      name_hi: nameHi || nameEn,
      category: cleanString(normalized.category) || null,
      brand: cleanString(normalized.brand) || null,
      unit,
      is_loose: unit === 'kg' || unit === 'g' || unit === 'litre' || unit === 'ml',
      purchase_price: toNumber(normalized.purchase_price),
      selling_price: sellingPrice,
      mrp: toNumber(normalized.mrp) || sellingPrice,
      gst_rate: Number.isFinite(gstRate) ? gstRate : 0,
      stock_qty: toNumber(normalized.stock_qty),
      low_stock_limit: toNumber(normalized.low_stock_limit, 5),
      expiry_date: parseDate(normalized.expiry_date),
      hsn_code: cleanString(normalized.hsn_code) || null,
      rowNumber,
    })
  })

  return { rows, errors }
}

export function downloadTemplate(): void {
  const rows = [
    PRODUCT_TEMPLATE_HEADERS,
    [
      '8901234567890',
      'Tata Salt 1kg',
      'टाटा नमक 1 किलो',
      'Grocery',
      'Tata',
      'packet',
      '24',
      '28',
      '30',
      '5',
      '50',
      '10',
      '',
      '2501',
    ],
    [
      '',
      'Toor Dal',
      'अरहर दाल',
      'Dal & Pulses',
      'Loose',
      'kg',
      '120',
      '145',
      '160',
      '0',
      '25',
      '5',
      '2027-03-31',
      '0713',
    ],
  ]
  exportRows(rows, 'dukaan-dost-product-template', 'Products')
}

export function exportProducts(products: Product[], categoryNames: Map<string, string>): void {
  const rows: (string | number)[][] = [PRODUCT_TEMPLATE_HEADERS]
  for (const p of products) {
    rows.push([
      p.barcode ?? '',
      p.name_en,
      p.name_hi,
      p.category_id ? categoryNames.get(p.category_id) ?? '' : '',
      p.brand ?? '',
      p.unit,
      p.purchase_price_paise / 100,
      p.selling_price_paise / 100,
      p.mrp_paise / 100,
      p.gst_rate,
      p.stock_qty,
      p.low_stock_limit,
      p.expiry_date ?? '',
      p.hsn_code ?? '',
    ])
  }
  exportRows(rows, `dukaan-dost-products-${new Date().toISOString().slice(0, 10)}`, 'Products')
}

function exportRows(rows: (string | number)[][], filename: string, sheetName: string): void {
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  worksheet['!cols'] = rows[0].map((_, i) => ({ wch: i === 0 ? 18 : i < 3 ? 22 : 14 }))
  if (rows.length > 1) worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: rows[0].length - 1, r: rows.length - 1 } }) }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

/** Small CSV parser for the "paste / quick import" path. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

export function ruPeeStringToPaise(value: string): number {
  return toPaise(value)
}
