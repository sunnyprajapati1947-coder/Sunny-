import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Printer, QrCode, Share2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { buildUpiUri, isValidVpa, makeQrDataUrl } from '../lib/upi'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { PageHeader } from '../components/layout/AppShell'

/**
 * The counter QR: the same UPI id the billing screen uses, drawn as a printable
 * poster. Amount is left blank here on purpose (a customer pays the bill amount
 * at the counter); the billing screen shows a QR with the exact amount.
 */
export default function ShopQrPage() {
  const { shop, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [qr, setQr] = useState<string | null>(null)

  const upiId = shop?.upi_id ?? ''
  const valid = isValidVpa(upiId)

  const uri = useMemo(() => {
    if (!valid || !shop) return ''
    return buildUpiUri({ vpa: upiId, payeeName: shop.name, note: shop.name })
  }, [valid, upiId, shop])

  useEffect(() => {
    let cancelled = false
    if (!uri) {
      setQr(null)
      return
    }
    void makeQrDataUrl(uri, 900).then((url) => {
      if (!cancelled) setQr(url)
    })
    return () => {
      cancelled = true
    }
  }, [uri])

  /** Draws the printable poster (1080 × 1350) on a canvas and returns a data URL. */
  const buildPoster = async (): Promise<string | null> => {
    if (!qr || !shop) return null
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1350
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#f6f4ee'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#0d7a4f'
    ctx.fillRect(0, 0, canvas.width, 210)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 64px "Segoe UI", Arial, sans-serif'
    ctx.fillText(shop.name.slice(0, 22), 540, 105)
    ctx.font = '500 34px "Segoe UI", Arial, sans-serif'
    ctx.fillText([shop.address, shop.phone].filter(Boolean).join(' · ').slice(0, 60), 540, 165)

    ctx.fillStyle = '#111111'
    ctx.font = 'bold 46px "Segoe UI", Arial, sans-serif'
    ctx.fillText('SCAN & PAY', 540, 300)
    ctx.font = '500 30px "Segoe UI", Arial, sans-serif'
    ctx.fillStyle = '#555555'
    ctx.fillText('UPI · Google Pay · PhonePe · Paytm', 540, 345)

    const img = new Image()
    img.src = qr
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('qr image failed'))
    })
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(140, 390, 800, 800)
    ctx.drawImage(img, 165, 415, 750, 750)

    ctx.fillStyle = '#0d7a4f'
    ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif'
    ctx.fillText(upiId, 540, 1255)
    ctx.fillStyle = '#666666'
    ctx.font = '500 26px "Segoe UI", Arial, sans-serif'
    ctx.fillText('Amount 0 — customer bill amount daalein', 540, 1300)
    return canvas.toDataURL('image/png')
  }

  const download = async () => {
    const url = await buildPoster()
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = `${(shop?.name ?? 'shop').replace(/\s+/g, '-').toLowerCase()}-upi-qr.png`
    link.click()
    toast(t('saved'), 'success')
  }

  const share = async () => {
    const url = await buildPoster()
    if (!url) return
    try {
      const blob = await (await fetch(url)).blob()
      const file = new File([blob], 'upi-qr.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shop?.name ?? 'UPI QR' })
        return
      }
    } catch {
      /* fall through to download */
    }
    await download()
  }

  const print = async () => {
    const url = await buildPoster()
    if (!url) return
    const win = window.open('', '_blank', 'width=640,height=900')
    if (!win) {
      await download()
      return
    }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${shop?.name ?? 'UPI QR'}</title>
       <style>@page{size:A4;margin:12mm}body{margin:0;display:flex;justify-content:center}img{width:100%;max-width:180mm}</style>
       </head><body><img src="${url}" onload="window.print()"></body></html>`,
    )
    win.document.close()
  }

  return (
    <div className="space-y-3">
      <PageHeader title={t('shopQr')} subtitle={t('shopQrHint')} onBack={() => navigate('/more')} />

      {!valid ? (
        <Card className="space-y-3 text-center">
          <QrCode className="mx-auto h-10 w-10 text-ink-400" />
          <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('qrNoUpi')}</p>
          <Button onClick={() => navigate('/settings')}>{t('shopSettings')}</Button>
        </Card>
      ) : (
        <>
          <Card className="space-y-3 text-center">
            <p className="font-display text-lg font-extrabold text-ink-900 dark:text-ink-50">{shop?.name}</p>
            {shop?.address && <p className="text-xs font-semibold text-ink-500">{shop.address}</p>}
            {qr ? (
              <img src={qr} alt="UPI QR" className="mx-auto h-64 w-64 rounded-2xl bg-white p-2 shadow-card" />
            ) : (
              <div className="mx-auto h-64 w-64 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
            )}
            <p className="font-mono text-sm font-bold text-brand-800 dark:text-brand-200">{upiId}</p>
            <p className="text-[11px] text-ink-500">{t('scanToPay')}</p>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={download}>
              {t('downloadQr')}
            </Button>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={print}>
              {t('printQr')}
            </Button>
            <Button variant="secondary" icon={<Share2 className="h-4 w-4" />} onClick={share}>
              {t('share')}
            </Button>
            <Button variant="outline" icon={<QrCode className="h-4 w-4" />} onClick={() => navigate('/billing')}>
              {t('navBilling')}
            </Button>
          </div>

          <Card className="space-y-1 bg-ink-50 text-xs text-ink-600 dark:bg-ink-900 dark:text-ink-300">
            <p className="font-bold text-ink-800 dark:text-ink-100">Print tip</p>
            <p>
              Poster A4 par print karein aur counter par chipka dein. Yahan amount khali hai (customer jo dena hai
              daal dega). Bill ke waqt app khud exact amount wala QR dikhata hai.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
