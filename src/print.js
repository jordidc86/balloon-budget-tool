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
        `<tr><td class="item-number">${i + 1}</td><td><strong>${h(s.item.name)}</strong><div class="description">${h(s.customDescription || s.item.description || "")}</div></td><td class="numeric">${h(money(s.customPrice ?? s.item.price))}</td><td class="numeric">${h(s.quantity)}</td><td class="numeric"><strong>${h(money(Math.round((s.customPrice ?? s.item.price) * 100 * s.quantity) / 100))}</strong></td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quotation ${h(quote.quotationNumber)}</title><style>
 @page{size:A4;margin:16mm 0}
 *{box-sizing:border-box}
 body{font:10pt Arial,sans-serif;line-height:1.45;margin:0;color:#172033;background:#e9edf2}
 .sheet{width:210mm;max-width:100%;margin:0 auto;padding:18mm;background:white}
 header,.addresses{display:flex;justify-content:space-between;gap:10mm;margin-bottom:5mm;break-inside:avoid}
 header{align-items:flex-start;border-bottom:2px solid #ad1f24;padding-bottom:4mm}
 header img{width:36mm;height:25mm;object-fit:contain;object-position:left top}
 header section{text-align:right}h1{font-size:21pt;line-height:1.1;letter-spacing:0.5pt;margin:0 0 3mm}
 p{margin:1mm 0}section{flex:1;min-width:0}
 .label{display:block;color:#566171;font-size:8pt;letter-spacing:0.7pt;margin-bottom:2mm}
 .address,.description,.terms p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
 .address{font-size:9pt}.description{font-size:8.5pt;color:#465264;margin-top:1.5mm}
 table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}
 th{background:#243b53;color:white;text-align:left;font-size:7.5pt;letter-spacing:0.3pt;padding:3mm 2mm}
 td{padding:2mm;vertical-align:top;border-bottom:1px solid #dbe2eb;overflow-wrap:anywhere}
 tbody tr:nth-child(even){background:#f8fafc}.item-number{color:#687383}
 .numeric{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
 thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
 .summary{margin:4mm 0 4mm auto;width:84mm;max-width:100%;background:#f3f6f9;padding:3mm;break-inside:avoid;page-break-inside:avoid}
 .summary p{display:flex;justify-content:space-between;gap:4mm;font-size:9pt}
 .summary p span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
 .summary .total{font-size:14pt;font-weight:bold;border-top:1px solid #b9c6d7;padding-top:3mm;margin-top:3mm}
 .terms{border-top:2px solid #ad1f24;padding-top:3mm;font-size:8.5pt}
 .terms h2{font-size:8pt;letter-spacing:0.5pt;margin:0 0 2mm;break-after:avoid;page-break-after:avoid}
 .terms p{orphans:3;widows:3}
 .tools{max-width:210mm;margin:4mm auto;padding:4mm;background:#eff6ff;font-size:10pt}
 .tools button{padding:9px 15px;border:0;background:#2563eb;color:white;border-radius:6px;cursor:pointer}
 .tools p{font-size:9pt}.qa{font-size:14pt;color:#b91c1c;font-weight:bold}
 @media print{body{background:white}.tools{display:none}.sheet{width:auto;max-width:none;margin:0;padding:0 18mm}table,header,.summary,.terms{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 </style></head><body><div class="tools"><button id="print-again" type="button">Print / Save PDF</button><p>A4 paper · 100% scale · Turn off browser headers and footers. Side margins are included in the document.</p></div><main class="sheet">${quote.quotationNumber.startsWith("QA-") ? '<p class="qa">TEST QUOTATION - NOT VALID FOR COMMERCIAL USE</p>' : ""}<header><img src="${h(origin)}/joint_logo.png" alt="Schroeder and Pasha"><section><h1>QUOTATION</h1><p>Ref: <strong>${h(quote.quotationNumber)}</strong></p><p>Date: ${h(quote.dateOfIssue)}</p><p>Valid until: ${h(nextMonth(quote.dateOfIssue))}</p></section></header><div class="addresses"><section><b class="label">FROM</b><p class="address">${h([issuer.name, ...issuer.address, "Tel: " + issuer.phone, issuer.email].join("\n"))}</p></section><section><b class="label">TO</b><p class="address">${h([customer.name, customer.contactPerson, customer.country, customer.email, customer.phone].filter(Boolean).join("\n"))}</p></section></div><table><colgroup><col style="width:5%"><col style="width:46%"><col style="width:18%"><col style="width:8%"><col style="width:23%"></colgroup><thead><tr><th>#</th><th>ITEM / DESCRIPTION</th><th class="numeric">PRICE</th><th class="numeric">QTY</th><th class="numeric">TOTAL</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><p><span>Subtotal</span><span>${h(money(quote.grossTotal))}</span></p>${quote.discount ? `<p><span>Discount (${h(quote.discount)}%)</span><span>-${h(money(quote.grossTotal - quote.netTotal))}</span></p>` : ""}<p class="total"><span>TOTAL</span><span>${h(money(quote.netTotal))}</span></p></div><div class="terms"><h2>TERMS &amp; CONDITIONS</h2><p>${h(quote.conditions)}</p></div></main></body></html>`;
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
