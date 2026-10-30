import { supabase, supabaseConfigured, SUPABASE_BUCKET } from './supabase'
import { shortId } from './id'

/**
 * Product photos are compressed on-device before upload so a 3 MB camera shot
 * becomes ~40 KB on a kirana's 4G connection.
 */
export async function compressImage(file: File, maxSize = 800, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', quality)
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Local (offline-safe) preview URL for a photo picked by the owner. */
export async function fileToPreview(file: File): Promise<{ dataUrl: string; blob: Blob }> {
  const blob = await compressImage(file)
  const dataUrl = await blobToDataUrl(blob)
  return { dataUrl, blob }
}

export async function uploadProductImage(shopId: string, productId: string, blob: Blob): Promise<string> {
  if (!supabaseConfigured || !supabase) throw new Error('Cloud upload needs Supabase configuration')
  const path = `${shopId}/${productId}-${shortId(6)}.jpg`
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
