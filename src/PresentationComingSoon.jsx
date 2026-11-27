import React from "react";

export default function PresentationComingSoon({ user, signOut, onBack }) {
  return (
    <main className="presentation-shell">
      <div className="account-bar">
        <span className="signed-in-email">{user.email}</span>
        <button type="button" className="action secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
      <button type="button" className="action secondary" onClick={onBack}>
        Back to manufacturers
      </button>
      <section className="panel presentation-intro">
        <span className="construction-badge">UNDER CONSTRUCTION</span>
        <h1>Create presentation</h1>
        <p>
          Bring your customer's brand to life on a balloon.
        </p>
        <div className="presentation-steps">
          <div>
            <span aria-hidden="true">01</span>
            <h2>Brand references</h2>
            <p>Multiple logos, reference images, colours and design ideas.</p>
          </div>
          <div>
            <span aria-hidden="true">02</span>
            <h2>Balloon design</h2>
            <p>A first visual proposal to review with your customer.</p>
          </div>
          <div>
            <span aria-hidden="true">03</span>
            <h2>Presentation PDF</h2>
            <p>Your balloon design in a consistent Pasha presentation.</p>
          </div>
        </div>
        <p className="presentation-coming-soon">
          Coming soon. Uploads and presentation creation are not available yet.
        </p>
      </section>
    </main>
  );
}
