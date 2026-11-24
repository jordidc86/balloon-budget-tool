import React, { useState, useEffect, useRef, useMemo } from "react";
import SignIn from "./SignIn.jsx";
import History from "./History.jsx";
import { accessToken } from "./auth-client.js";
import {
  catalogs,
  SINGLE,
  DEFAULT_TERMS,
  allItems,
  canonicalId,
  money,
  localDate,
  allowedItems,
  loadKit,
  selectItem,
  normalizeDocument,
  totals,
} from "./domain.js";
import {
  readStore,
  writeStore,
  backupQuote,
  findBackup,
  restoreDraft,
  userStorage,
} from "./storage.js";
import { showPrint } from "./print.js";
import "./base.css";
import "./styles.css";
const emptyCustomer = () => ({
  name: "",
  country: "",
  contactPerson: "",
  phone: "",
  email: "",
});
const fresh = (vendor) => ({
  vendor,
  creationKey: crypto.randomUUID(),
  items: [],
  discount: 0,
  customerData: emptyCustomer(),
  conditions: DEFAULT_TERMS,
  saved: null,
});
const editable = (d) => ({
  vendor: d.vendor,
  items: d.items,
  discount: d.discount,
  customerData: { ...emptyCustomer(), ...d.customerData },
  conditions: d.conditions,
});
const Button = ({ children, secondary = false, ...props }) => (
  <button
    className={secondary ? "action secondary" : "action"}
    type="button"
    {...props}
  >
    {children}
  </button>
);
async function api(path, options) {
  const token = await accessToken();
  let response;
  try {
    response = await fetch(path, {
      ...options,
      signal: AbortSignal.timeout(18000),
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
        Authorization: "Bearer " + token,
      },
    });
  } catch {
    throw Object.assign(
      new Error(
        "The saving service could not be reached. Your draft is retained; retry safely.",
      ),
      { status: 503 },
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success)
    throw Object.assign(
      new Error(
        body?.error ||
          "Could not process the quotation. Your draft is retained.",
      ),
      { status: response.status, quotation: body?.quotation },
    );
  return body;
}
function Configurator({ vendor, onBack, user, signOut }) {
  const key = "pashaquotes:draft:v2:" + vendor;
  const storage = useMemo(() => userStorage(user.id), [user.id]);
  const [draft, setDraft] = useState(() =>
    restoreDraft(key, vendor, () => fresh(vendor), storage),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState(null),
    [busy, setBusy] = useState(false),
    [localFailure, setLocalFailure] = useState(false),
    [load, setLoad] = useState(null),
    [health, setHealth] = useState("CHECKING"),
    [testMode, setTestMode] = useState(false);
  const working = useRef(false);
  const summaryRef = useRef(null);
  useEffect(() => {
    let frame;
    const measure = () => {
      const panel = summaryRef.current;
      if (!panel) return;
      if (window.innerWidth <= 720) {
        panel.style.removeProperty("--summary-available-height");
        return;
      }
      const top = Math.max(24, panel.getBoundingClientRect().top);
      panel.style.setProperty(
        "--summary-available-height",
        `${Math.max(100, window.innerHeight - top - 24)}px`,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(summaryRef.current.closest(".app-shell"));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  const current = useRef(draft);
  current.current = draft;
  const dirty =
    !draft.saved ||
    JSON.stringify(editable(draft)) !== JSON.stringify(editable(draft.saved));
  useEffect(() => {
    setLocalFailure(!writeStore(key, draft, storage));
  }, [key, draft]);
  useEffect(() => {
    let active = true;
    fetch("/api/db-test", {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    })
      .then((r) => r.json().then((b) => ({ r, b })))
      .then(({ r, b }) => {
        if (active) {
          setHealth(r.ok && b.ok ? "OK" : "FAIL");
          setTestMode(Boolean(b.testMode));
        }
      })
      .catch(() => active && setHealth("FAIL"));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const handler = (e) => {
      if (localFailure && dirty && draft.items.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [localFailure, dirty, draft.items.length]);
  function change(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
    setNotice(null);
  }
  function updateCustomer(field, value) {
    setDraft((d) => ({
      ...d,
      customerData: { ...d.customerData, [field]: value },
    }));
    setNotice(null);
  }
  function applyQuote(q) {
    setDraft((d) => ({ ...editable(q), creationKey: d.creationKey, saved: q }));
    return q;
  }
  async function saveCloud() {
    const normalized = normalizeDocument(
      editable(current.current),
      current.current.saved,
    );
    const saved = current.current.saved;
    let body;
    try {
      body = await api("/api/quotations", {
        method: "POST",
        body: JSON.stringify({
          document: normalized,
          ...(saved
            ? { id: saved.id, expectedRevision: saved.revision }
            : { creationKey: current.current.creationKey }),
        }),
      });
    } catch (error) {
      if (error.status === 409 && error.quotation && !saved) {
        setDraft((d) => ({ ...d, saved: error.quotation }));
        throw new Error(
          `This draft was already saved as ${error.quotation.quotationNumber}. Your changes are retained. Review them and press Save again to update that quotation.`,
        );
      }
      throw error;
    }
    const q = body.quotation;
    if (!q?.id || !q.quotationNumber || !q.revision)
      throw new Error(
        "The server did not confirm the saved reference. Retry this draft.",
      );
    applyQuote(q);
    const backed = backupQuote(q, storage);
    setHealth("OK");
    setTestMode(Boolean(body.testMode));
    setNotice({
      type: backed ? "success" : "warning",
      text: `Saved to the database as ${q.quotationNumber} (revision ${q.revision}).${backed ? "" : " The browser could not keep a local backup."}`,
    });
    return q;
  }
  async function save() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await saveCloud();
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function print() {
    if (working.current) return;
    try {
      if (dirty) normalizeDocument(editable(draft), draft.saved);
    } catch (e) {
      setNotice({ type: "error", text: e.message });
      return;
    }
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice({
        type: "error",
        text: "Allow popups for this site and press Print again.",
      });
      return;
    }
    popup.document.write(
      '<p style="font:16px Arial;padding:30px">Preparing quotation...</p>',
    );
    working.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const q = dirty ? await saveCloud() : draft.saved;
      if (!q?.id || !q.quotationNumber)
        throw new Error(
          "Save the quotation to obtain a confirmed reference before printing.",
        );
      await showPrint(popup, q, window.location.origin);
    } catch (e) {
      popup.close();
      setNotice({ type: "error", text: e.message });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function newQuote(copy = false) {
    if (
      dirty &&
      draft.items.length &&
      !window.confirm(
        "Start a new quotation and discard the current unsaved changes?",
      )
    )
      return;
    const next = fresh(vendor);
    if (copy) Object.assign(next, editable(draft));
    setDraft(next);
    setNotice({
      type: "info",
      text: "New draft. A new reference will be assigned only when it is saved.",
    });
  }
  async function retrieve(event) {
    event.preventDefault();
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setNotice(null);
    try {
      let q;
      try {
        const body = await api(
          "/api/quotations?" +
            new URLSearchParams({
              vendor,
              number: load.number.trim(),
              date: load.date,
            }),
        );
        q = body.quotation;
        setTestMode(Boolean(body.testMode));
      } catch (e) {
        if (e.status < 500) throw e;
        q = findBackup(vendor, load.number.trim(), load.date, storage);
        if (!q?.id || !q.revision) throw e;
        setNotice({
          type: "warning",
          text: "Loaded the last confirmed local copy. Saving changes requires a connection.",
        });
      }
      applyQuote(q);
      backupQuote(q, storage);
      setLoad(null);
      setNotice(
        (n) =>
          n || {
            type: "success",
            text: `Loaded ${q.quotationNumber}, revision ${q.revision}.`,
          },
      );
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function choose(item) {
    const result = selectItem(vendor, draft.items, item);
    change("items", result.items);
    if (result.removed.length)
      setNotice({
        type: "warning",
        text:
          "Removed incompatible components: " +
          result.removed.join(", ") +
          ". Please review the configuration.",
      });
  }
  function alter(id, field, value) {
    change(
      "items",
      draft.items.map((s) => (s.item.id === id ? { ...s, [field]: value } : s)),
    );
  }
  function remove(id) {
    const items = draft.items.filter((s) => s.item.id !== id);
    change("items", items);
  }
  const discountValid =
    Number.isFinite(Number(draft.discount)) &&
    Number(draft.discount) >= 0 &&
    Number(draft.discount) <= 100;
  const summary = totals(
    draft.items,
    discountValid ? Number(draft.discount) : 0,
  );
  return (
    <div className="app-shell">
      {testMode && (
        <div className="test-banner">
          TEST ENVIRONMENT - references do not affect official numbering
        </div>
      )}
      <header className="quote-header panel">
        <div className="title-group">
          <button
            className="back-button"
            title="Back to manufacturers"
            disabled={busy}
            onClick={() => {
              if (
                localFailure &&
                dirty &&
                draft.items.length &&
                !window.confirm(
                  "Local storage is unavailable. Leave this unsaved quotation?",
                )
              )
                return;
              onBack();
            }}
          >
            ‹
          </button>
          <div>
            <h1>{vendor} CONFIGURATOR</h1>
            <p>
              Reference:{" "}
              <strong>
                {draft.saved?.quotationNumber ||
                  "Assigned automatically when saved"}
              </strong>
            </p>
          </div>
        </div>
        <div className="toolbar">
          <span className="signed-in-email">{user.email}</span>
          <Button secondary disabled={busy} onClick={signOut}>
            Sign out
          </Button>
          <Button
            secondary
            disabled={busy}
            onClick={() => setLoad({ number: "", date: localDate() })}
          >
            Load Quote
          </Button>
          <Button secondary disabled={busy} onClick={save}>
            {busy ? "Working..." : "Save"}
          </Button>
          <Button disabled={busy} onClick={print}>
            Print Quote
          </Button>
        </div>
      </header>
      <div className="sub-toolbar">
        <span className={"db-status " + health.toLowerCase()}>
          DB: {health}
        </span>
        <span>
          {draft.saved
            ? dirty
              ? "Unsaved changes"
              : `Saved · revision ${draft.saved.revision}`
            : "Draft · no reference assigned"}
        </span>
        <div>
          <Button
            secondary
            disabled={busy || !draft.saved}
            onClick={() => setHistoryOpen(true)}
          >
            Version history
          </Button>{" "}
          <Button secondary disabled={busy} onClick={() => newQuote(false)}>
            New quotation
          </Button>{" "}
          <Button
            secondary
            disabled={busy || !draft.items.length}
            onClick={() => newQuote(true)}
          >
            Copy as new
          </Button>
        </div>
      </div>
      {localFailure && (
        <div className="message warning" role="status">
          Your browser cannot keep a local draft. Save to the database before
          leaving this page.
        </div>
      )}
      {health === "FAIL" && (
        <div className="message warning" role="status">
          Saving is temporarily unavailable. You can continue editing; retained
          drafts can be retried without creating duplicate numbers.
        </div>
      )}
      {notice && !load && (
        <div
          className={"message " + notice.type}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.text}
        </div>
      )}
      <fieldset disabled={busy} className="quote-layout">
        <div className="catalog-column">
          <section className="panel kit-panel">
            <div>
              <h2>PREDEFINED KITS</h2>
              <p>Load a configuration, then review its components.</p>
            </div>
            <div className="kit-buttons">
              {catalogs[vendor].kits.map((k) => (
                <button
                  type="button"
                  className="kit-button"
                  key={k.id}
                  title={k.description}
                  onClick={() => {
                    try {
                      change("items", loadKit(vendor, k.id));
                      setNotice({ type: "info", text: k.description });
                    } catch (e) {
                      setNotice({ type: "error", text: e.message });
                    }
                  }}
                >
                  Load {k.name}
                </button>
              ))}
            </div>
          </section>
          {catalogs[vendor].categories.map((category) => {
            const available = allowedItems(vendor, category.name, draft.items);
            const selected = draft.items.filter(
              (s) => s.item.category === category.name,
            );
            const single = SINGLE.has(category.name);
            return (
              <section className="category" key={category.name}>
                <div className="category-title">
                  <h3>{category.name}</h3>
                  <span>{available.length} options</span>
                </div>
                {!available.length &&
                  ["BASKET", "BURNER"].includes(category.name) && (
                    <p className="message warning">
                      No approved compatibility options are listed for this
                      envelope. Confirm the configuration with the manufacturer
                      before adding these components.
                    </p>
                  )}
                {single ? (
                  <>
                    <select
                      aria-label={category.name}
                      value={selected[0]?.item.id || ""}
                      onChange={(e) => {
                        if (!e.target.value) {
                          change(
                            "items",
                            draft.items.filter(
                              (s) => s.item.category !== category.name,
                            ),
                          );
                          return;
                        }
                        const item = available.find(
                          (i) => i.id === e.target.value,
                        );
                        if (item) choose(item);
                      }}
                    >
                      <option value="">Select {category.name}...</option>
                      {selected[0] &&
                        !available.some(
                          (i) => i.id === selected[0].item.id,
                        ) && (
                          <option value={selected[0].item.id}>
                            {selected[0].item.name} (saved item)
                          </option>
                        )}
                      {available.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ·{" "}
                          {i.priceOnRequest
                            ? "Price on request"
                            : money(i.price)}
                        </option>
                      ))}
                    </select>
                    {selected.map((s) => (
                      <div className="panel selected-product" key={s.item.id}>
                        <div>
                          <b>{s.item.name}</b>
                          <p className="description">{s.item.description}</p>
                          {s.item.priceOnRequest && (
                            <label>
                              Agreed price (€)
                              <input
                                aria-label={"Price for " + s.item.name}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={s.customPrice ?? ""}
                                placeholder="Required"
                                onChange={(e) =>
                                  alter(
                                    s.item.id,
                                    "customPrice",
                                    e.target.value === ""
                                      ? undefined
                                      : Number(e.target.value),
                                  )
                                }
                              />
                            </label>
                          )}
                        </div>
                        <strong>{money(s.customPrice ?? s.item.price)}</strong>
                        <button
                          type="button"
                          className="remove"
                          aria-label={"Remove " + s.item.name}
                          onClick={() => remove(s.item.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="product-list">
                    {available.map((item) => {
                      const selection = selected.find(
                        (s) => s.item.id === item.id,
                      );
                      return (
                        <div
                          key={item.id}
                          className={
                            "panel product " + (selection ? "selected" : "")
                          }
                        >
                          <label className="product-label">
                            <input
                              type="checkbox"
                              checked={Boolean(selection)}
                              onChange={() =>
                                selection ? remove(item.id) : choose(item)
                              }
                            />
                            <span>
                              <b>{item.name}</b>
                              <span className="description">
                                {item.description}
                              </span>
                            </span>
                            <strong>
                              {item.priceOnRequest
                                ? "Price on request"
                                : money(selection?.customPrice ?? item.price)}
                            </strong>
                          </label>
                          {selection && (
                            <div className="product-controls">
                              <label>
                                Quantity
                                <input
                                  aria-label={"Quantity for " + item.name}
                                  type="number"
                                  min="1"
                                  step="1"
                                  max="10000"
                                  value={selection.quantity}
                                  onChange={(e) =>
                                    alter(
                                      item.id,
                                      "quantity",
                                      e.target.value === ""
                                        ? ""
                                        : Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                              {item.allowCustomPrice && (
                                <label>
                                  {item.priceOnRequest
                                    ? "Agreed price (€)"
                                    : "Artwork price (€)"}
                                  <input
                                    aria-label={"Price for " + item.name}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={selection.customPrice ?? ""}
                                    placeholder={
                                      item.priceOnRequest ? "Required" : "0.00"
                                    }
                                    onChange={(e) =>
                                      alter(
                                        item.id,
                                        "customPrice",
                                        e.target.value === ""
                                          ? undefined
                                          : Number(e.target.value),
                                      )
                                    }
                                  />
                                </label>
                              )}
                              <label className="wide">
                                Notes
                                <input
                                  aria-label={"Notes for " + item.name}
                                  value={selection.customDescription || ""}
                                  maxLength="3000"
                                  onChange={(e) =>
                                    alter(
                                      item.id,
                                      "customDescription",
                                      e.target.value,
                                    )
                                  }
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <aside className="summary-column">
          <div className="summary-sticky" ref={summaryRef}>
            <div
              className="summary-scroll"
              role="region"
              aria-label="Quotation overview"
              tabIndex={0}
            >
              <section className="panel detail-panel">
                <h3>CLIENT DETAILS</h3>
                {[
                  ["name", "Client name"],
                  ["country", "Country"],
                  ["contactPerson", "Contact person (representative)"],
                  ["phone", "Phone"],
                  ["email", "Email"],
                ].map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <input
                      type={field === "email" ? "email" : "text"}
                      value={draft.customerData[field] || ""}
                      maxLength="1000"
                      onChange={(e) => updateCustomer(field, e.target.value)}
                      placeholder={label}
                    />
                  </label>
                ))}
              </section>
              <section className="panel detail-panel">
                <h3>QUOTE DETAILS</h3>
                <label>
                  Reference
                  <output className="readonly" aria-label="Quotation reference">
                    {draft.saved?.quotationNumber ||
                      "Pending automatic assignment"}
                  </output>
                </label>
                <label>
                  Issue date
                  <output className="readonly" aria-label="Issue date">
                    {draft.saved?.dateOfIssue ||
                      "Assigned by server on first save"}
                  </output>
                </label>
                <p className="help">
                  The reference and issue date cannot be changed. Copy a saved
                  quotation to issue a new one.
                </p>
              </section>
              <section className="panel detail-panel">
                <h3>SELECTED ITEMS</h3>
                {!draft.items.length ? (
                  <p className="description">Your budget is empty...</p>
                ) : (
                  draft.items.map((s) => (
                    <div key={s.item.id} className="summary-item">
                      <div>
                        <b>{s.item.name}</b>
                        <small>
                          {s.quantity || "?"} ×{" "}
                          {s.item.priceOnRequest && s.customPrice === undefined
                            ? "Price required"
                            : money(s.customPrice ?? s.item.price)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="remove"
                        aria-label={"Remove selected " + s.item.name}
                        onClick={() => remove(s.item.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
                <div className="total-line">
                  <span>Gross subtotal</span>
                  <strong>{money(summary.grossTotal)}</strong>
                </div>
                <label>
                  Discount (%)
                  <input
                    aria-label="Discount percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={draft.discount}
                    onChange={(e) =>
                      change(
                        "discount",
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </label>
                {!discountValid && (
                  <p className="error-text">
                    Discount must be between 0 and 100.
                  </p>
                )}
                <div className="total-line net">
                  <span>NET TOTAL</span>
                  <strong>
                    {discountValid ? money(summary.netTotal) : "Invalid discount"}
                  </strong>
                </div>
              </section>
              <section className="panel detail-panel">
                <h3>PAYMENT TERMS</h3>
                <label className="visually-hidden" htmlFor="terms">
                  Payment terms
                </label>
                <textarea
                  id="terms"
                  value={draft.conditions}
                  maxLength="15000"
                  rows="8"
                  onChange={(e) => change("conditions", e.target.value)}
                />
              </section>
            </div>
            <div className="configuration-total">
              <div>
                <span>Configuration total</span>
                <small>{draft.items.length} selected items</small>
              </div>
              <output
                aria-label="Configuration net total"
                aria-live="polite"
                aria-atomic="true"
              >
                {discountValid ? money(summary.netTotal) : "Invalid discount"}
              </output>
            </div>
          </div>
        </aside>
      </fieldset>
      {historyOpen && draft.saved && (
        <History
          quotation={draft.saved}
          request={api}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {load && (
        <div className="modal-backdrop">
          <section
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="load-title"
          >
            <h2 id="load-title">Load quotation</h2>
            <button
              className="remove modal-close"
              title="Close"
              onClick={() => !busy && setLoad(null)}
            >
              ×
            </button>
            <p>Enter the saved reference and issue date.</p>
            {notice?.type==="error"&&<p className="message error" role="alert">{notice.text}</p>}
            <form onSubmit={retrieve}>
              <label>
                Reference
                <input
                  aria-label="Saved reference"
                  autoFocus
                  required
                  maxLength="100"
                  value={load.number}
                  onChange={(e) =>
                    setLoad((d) => ({ ...d, number: e.target.value }))
                  }
                />
              </label>
              <label>
                Issue date
                <input
                  aria-label="Saved issue date"
                  type="date"
                  required
                  value={load.date}
                  onChange={(e) =>
                    setLoad((d) => ({ ...d, date: e.target.value }))
                  }
                />
              </label>
              <button className="action" type="submit" disabled={busy}>
                {busy ? "Loading..." : "Verify & Load"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Workspace({ user, signOut }) {
  const [vendor, setVendor] = useState(null);
  return vendor ? (
    <Configurator
      key={user.id + vendor}
      vendor={vendor}
      onBack={() => setVendor(null)}
      user={user}
      signOut={signOut}
    />
  ) : (
    <main className="landing">
      <div className="account-bar">
        <span>{user.email}</span>
        <Button secondary onClick={signOut}>
          Sign out
        </Button>
      </div>
      <h1>BALLOON BUDGET TOOL</h1>
      <p className="tagline">Schroeder &amp; Pasha Manufacturers</p>
      <div className="brand-grid">
        {["SCHROEDER", "PASHA"].map((v) => (
          <button
            type="button"
            className="panel brand"
            key={v}
            onClick={() => setVendor(v)}
          >
            <strong>{v}</strong>
            <span>ENTER CATALOG</span>
          </button>
        ))}
      </div>
      <p className="landing-note">
        Professional balloon quotations · References assigned automatically
      </p>
    </main>
  );
}
export default function App() {
  return (
    <SignIn>
      {(identity) => <Workspace key={identity.user.id} {...identity} />}
    </SignIn>
  );
}
