import issuers from "../data/issuers.json" with { type: "json" };
import { money, nextMonth } from "./domain.js";
export const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function printHTML(quote, origin = "") {
  const issuer = issuers[quote.vendor];
  const h = escapeHTML;
  const customer = quote.customerData;
  const rows = quote.items
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td><strong>${h(s.item.name)}</strong><div class="description">${h(s.customDescription || s.item.description || "")}</div></td><td class="numeric">${h(money(s.customPrice ?? s.item.price))}</td><td class="numeric">${h(s.quantity)}</td><td class="numeric"><strong>${h(money(Math.round((s.customPrice ?? s.item.price) * 100 * s.quantity) / 100))}</strong></td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quotation ${h(quote.quotationNumber)}</title><style>
 body{font:12px Arial,sans-serif;margin:28px;color:#172033}header,.addresses{display:flex;justify-content:space-between;gap:30px;margin-bottom:28px}header img{max-width:160px;max-height:72px;object-fit:contain}header section{text-align:right}h1{font-size:25px;margin:0 0 12px}p{margin:5px 0}section{flex:1}.address,.description,.terms{white-space:pre-wrap;line-height:1.45}.address{font-size:12px}.description{font-size:10px;color:#526074;margin-top:5px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#243b53;color:white;text-align:left;padding:10px}td{padding:10px 7px;vertical-align:top;border-bottom:1px solid #dbe2eb;overflow-wrap:anywhere}.numeric{text-align:right;white-space:nowrap}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.summary{margin:25px 0 25px auto;max-width:310px;background:#f3f6fb;padding:18px;break-inside:avoid}.summary p{display:flex;justify-content:space-between;gap:20px}.total{font-size:18px;font-weight:bold;border-top:1px solid #b9c6d7;padding-top:12px}.terms{border-top:2px solid #2455b8;padding-top:12px;break-inside:avoid;font-size:11px}.tools{padding:12px;background:#eff6ff;margin-bottom:18px}.tools button{padding:9px 15px;border:0;background:#2563eb;color:white;border-radius:6px;cursor:pointer}.qa{font-size:18px;color:#b91c1c;font-weight:bold}@media print{.tools{display:none}body{margin:0}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:14mm}}
 </style></head><body><div class="tools"><button id="print-again" type="button">Print / Save PDF</button> <span>Use your browser to print or save a PDF.</span></div>${quote.quotationNumber.startsWith("QA-") ? '<p class="qa">TEST QUOTATION - NOT VALID FOR COMMERCIAL USE</p>' : ""}<header><img src="${h(origin)}/joint_logo.png" alt="Schroeder and Pasha"><section><h1>QUOTATION</h1><p>Ref: ${h(quote.quotationNumber)}</p><p>Date: ${h(quote.dateOfIssue)}</p><p>Valid until: ${h(nextMonth(quote.dateOfIssue))}</p></section></header><div class="addresses"><section><b>FROM</b><p class="address">${h([issuer.name, ...issuer.address, "Tel: " + issuer.phone, issuer.email].join("\n"))}</p></section><section><b>TO</b><p class="address">${h([customer.name, customer.contactPerson, customer.country, customer.email, customer.phone].filter(Boolean).join("\n"))}</p></section></div><table><colgroup><col style="width:5%"><col style="width:47%"><col style="width:18%"><col style="width:8%"><col style="width:22%"></colgroup><thead><tr><th>#</th><th>ITEM / DESCRIPTION</th><th class="numeric">PRICE</th><th class="numeric">QTY</th><th class="numeric">TOTAL</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><p><span>Subtotal</span><span>${h(money(quote.grossTotal))}</span></p>${quote.discount ? `<p><span>Discount (${h(quote.discount)}%)</span><span>-${h(money(quote.grossTotal - quote.netTotal))}</span></p>` : ""}<p class="total"><span>TOTAL</span><span>${h(money(quote.netTotal))}</span></p></div><div class="terms"><b>TERMS &amp; CONDITIONS</b><p>${h(quote.conditions)}</p></div></body></html>`;
}
export async function showPrint(windowRef, quote, origin) {
  if (windowRef.closed) throw new Error("The print window was closed.");
  windowRef.document.open();
  windowRef.document.write(printHTML(quote, origin));
  windowRef.document.close();
  windowRef.document
    .getElementById("print-again")
    .addEventListener("click", () => windowRef.print());
  await Promise.all(
    [...windowRef.document.images].map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            setTimeout(resolve, 5000);
          }),
    ),
  );
  windowRef.focus();
  windowRef.print();
}
