export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px", lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 8 }}>MOC Part Matcher</h1>
      <p style={{ color: "#555" }}>
        Foundation rebuild in progress. The matching engine and accuracy harness live in{" "}
        <code>/engine</code> and <code>/eval</code>; the review UI lands in a later phase.
      </p>
      <p style={{ color: "#888", fontSize: 14 }}>
        Run <code>npm test</code> for the engine suite and <code>npm run eval</code> for the accuracy report.
      </p>
    </main>
  );
}
