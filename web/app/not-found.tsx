import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="content" className="section">
        <p className="eyebrow">404</p>
        <h1>No rung here</h1>
        <p className="section-lead">
          That page does not exist. Try <a href="/ladder">the ladder</a>,{" "}
          <a href="/tower">the tower</a>, <a href="/inventions">the inventions</a> or{" "}
          <a href="/start">where to start</a>.
        </p>
      </main>
      <Footer />
    </>
  );
}
