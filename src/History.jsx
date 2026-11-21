import React, { useEffect, useRef, useState } from "react";
import { money } from "./domain.js";
import { describeChanges } from "./history.js";
export default function History({ quotation, request, onClose }) {
  const [versions, setVersions] = useState([]),
    [selected, setSelected] = useState(null),
    [hasMore, setHasMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef(null),
    loading = useRef(false);
  async function load(before) {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request(
        "/api/quotations?" +
          new URLSearchParams({
            id: quotation.id,
            history: "1",
            ...(before ? { before } : {}),
          }),
      );
      setVersions((old) =>
        before ? [...old, ...result.versions] : result.versions,
      );
      setSelected((old) => old || result.versions[0] || null);
      setHasMore(Boolean(result.hasMore));
    } catch (e) {
      setError(e.message);
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const previousFocus=globalThis.document.activeElement;
    load();
    dialog.current?.focus();
    return ()=>previousFocus?.focus();
  }, [quotation.id]);
  const document = selected?.document;
  const changes = document ? describeChanges(document, quotation) : [];
  function keyboard(event) {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "Tab") {
      const list = Array.from(
        dialog.current.querySelectorAll("button:not(:disabled),select,a,input"),
      ).filter((e) => e.offsetParent !== null);
      const first = list[0],
        last = list.at(-1);
      if (event.shiftKey && event.target === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="panel modal history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={keyboard}
      >
        <button
          className="remove modal-close"
          aria-label="Close version history"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="history-title">
          Version history · {quotation.quotationNumber}
        </h2>
        <p>
          Saved versions of this quotation. Viewing a version does not modify
          the document or its reference.
        </p>
        {error && (
          <p className="message warning" role="alert">
            {error}
          </p>
        )}
        <div className="history-layout">
          <nav aria-label="Saved versions">
            {versions.map((v) => (
              <button
                key={v.revision}
                className={
                  "history-version " +
                  (selected?.revision === v.revision ? "active" : "")
                }
                onClick={() => setSelected(v)}
                aria-pressed={selected?.revision === v.revision}
              >
                <b>Revision {v.revision}</b>
                <span>{new Date(v.savedAt).toLocaleString()}</span>
                <span>{money(v.document.netTotal)}</span>
              </button>
            ))}
            {busy && <p role="status">Loading versions...</p>}
            {hasMore && (
              <button
                className="action secondary"
                disabled={busy}
                onClick={() => load(versions.at(-1)?.revision)}
              >
                Load older versions
              </button>
            )}
            {error && !versions.length && (
              <button className="action secondary" onClick={() => load()}>
                Retry
              </button>
            )}
          </nav>
          {document && (
            <article>
              <h3>Revision {selected.revision}</h3>
              <dl className="history-details">
                {Object.entries({
                  Client: document.customerData?.name,
                  Country: document.customerData?.country,
                  Representative: document.customerData?.contactPerson,
                  Phone: document.customerData?.phone,
                  Email: document.customerData?.email,
                  Reference: document.quotationNumber,
                  "Issue date": document.dateOfIssue,
                }).map(([label, value]) => (
                  <React.Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </React.Fragment>
                ))}
              </dl>
              <h3>Compared with saved revision {quotation.revision}</h3>
              {changes.length ? (
                <ul>
                  {changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              ) : (
                <p>No document changes.</p>
              )}
              <h3>Saved items</h3>
              <div className="history-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(document.items || []).map((s, i) => (
                      <tr key={i}>
                        <td>
                          {s.item.name}
                          {s.customDescription && <p>{s.customDescription}</p>}
                        </td>
                        <td>{s.quantity}</td>
                        <td>{money(s.customPrice ?? s.item.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Discount: {document.discount || 0}% ·{" "}
                <b>Net total: {money(document.netTotal)}</b>
              </p>
              <h3>Saved payment terms</h3>
              <p className="history-terms">{document.conditions}</p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
