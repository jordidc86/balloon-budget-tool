import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main style={{ padding: 30, fontFamily: "Arial" }}>
        <h1>Could not load the quotation tool</h1>
        <p>Your saved quotations remain in the database. Reload the page to retry.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
