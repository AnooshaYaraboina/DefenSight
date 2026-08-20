"use client";

import * as React from "react";

/**
 * Last-resort boundary, for failures in the root layout itself.
 *
 * It must render its own <html> and <body>, and cannot rely on the app's CSS
 * having loaded — so the styling here is inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[DefenSight] fatal:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#070a11",
          color: "#e8eefb",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            DefenSight could not start
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem", lineHeight: 1.6, color: "#9aabc4" }}>
            The console failed to load. Detection and enforcement run independently of this
            interface and are unaffected.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.75rem", fontFamily: "ui-monospace, monospace", fontSize: "0.6875rem", color: "#61728d" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem", padding: "0.5rem 1rem", borderRadius: "0.375rem",
              border: "1px solid #29374e", background: "#111826", color: "#e8eefb",
              fontSize: "0.8125rem", cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
