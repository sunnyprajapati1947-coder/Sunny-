import React, { forwardRef } from 'react';
import { inr } from '../utils.js';

// Thermal-print ready receipt (58mm / 80mm via settings.printerWidth)
const Receipt = forwardRef(function Receipt({ bill, settings, width }, ref) {
  const w = width || settings?.printerWidth || 80;
  if (!bill) return null;
  return (
    <div ref={ref} id="print-area" className="receipt" style={{ width: w === 58 ? '54mm' : '76mm', fontSize: w === 58 ? 10 : 11 }}>
      <div className="center bold" style={{ fontSize: w === 58 ? 12 : 15 }}>{settings?.storeName || 'Rishu Kirana Store'}</div>
      <div className="center">{settings?.address || 'Gaya Road, Nawada'}</div>
      <div className="center">Ph: {settings?.phone || '9608087035'}{settings?.gstNumber ? ` • GSTIN: ${settings.gstNumber}` : ''}</div>
      <hr />
      <div className="row"><span>Bill No:</span><span className="bold">{bill.billNumber}</span></div>
      <div className="row"><span>Date:</span><span>{new Date(bill.billDate).toLocaleString('en-IN')}</span></div>
      <div className="row"><span>Cashier:</span><span>{bill.cashierName}</span></div>
      {bill.customerName && <div className="row"><span>Customer:</span><span>{bill.customerName}</span></div>}
      <hr />
      {bill.items?.map((i, idx) => (
        <div key={idx} style={{ marginBottom: 1.5 }}>
          <div className="bold">{i.name}{i.freeQty ? ` (+${i.freeQty} FREE)` : ''}</div>
          <div className="row">
            <span>{i.qty} {i.unit} x {inr(i.price)}{i.discountPct ? ` (-${i.discountPct}%)` : ''}</span>
            <span className="bold">{inr(i.total)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="row"><span>Subtotal</span><span>{inr(bill.subtotal)}</span></div>
      {bill.itemDiscount > 0 && <div className="row"><span>Item discounts</span><span>-{inr(bill.itemDiscount)}</span></div>}
      {bill.billDiscountValue > 0 && <div className="row"><span>Bill discount{bill.billDiscountPct ? ` (${bill.billDiscountPct}%)` : ''}</span><span>-{inr(bill.billDiscountValue)}</span></div>}
      {bill.couponValue > 0 && <div className="row"><span>Coupon {bill.couponCode}</span><span>-{inr(bill.couponValue)}</span></div>}
      <div className="row"><span>GST included</span><span>{inr(bill.totalTax)}</span></div>
      <div className="row bold" style={{ fontSize: '1.25em' }}><span>TOTAL</span><span>{inr(bill.grandTotal)}</span></div>
      {bill.roundOff ? <div className="row"><span>Round off</span><span>{bill.roundOff > 0 ? '+' : ''}{bill.roundOff.toFixed(2)}</span></div> : null}
      <hr />
      {(bill.payments || []).map((p, i) => (
        <div className="row" key={i}><span>{String(p.mode).toUpperCase()}{p.ref ? ` (${p.ref})` : ''}</span><span>{inr(p.amount)}</span></div>
      ))}
      {bill.changeReturned > 0 && <div className="row"><span>Change returned</span><span>{inr(bill.changeReturned)}</span></div>}
      {bill.creditAmount > 0 && <div className="row bold"><span>UDHAAR BALANCE</span><span>{inr(bill.creditAmount)}</span></div>}
      {bill.loyaltyEarned > 0 && <div className="row"><span>Loyalty points earned</span><span>+{bill.loyaltyEarned}</span></div>}
      <hr />
      <div className="center" style={{ margin: '2mm 0' }}>
        <img src="/upi-qr.png" alt="UPI QR" style={{ width: '26mm', height: '26mm' }} />
        <div style={{ fontSize: 9, fontWeight: 700 }}>UPI se payment karein / UPI से भुगतान</div>
      </div>
      <div className="center">{settings?.receiptFooter || 'धन्यवाद! Thank you, visit again.'}</div>
      <div className="center" style={{ fontSize: 9 }}>*** Computer generated bill ***</div>
    </div>
  );
});
export default Receipt;
