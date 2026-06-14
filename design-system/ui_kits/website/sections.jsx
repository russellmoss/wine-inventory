/* Savvy Wealth — marketing site sections.
   Brand-applied reference composition built from the design-system
   primitives (Button, Eyebrow, Metric, Quote, Card, Input, Avatar).
   Components are read from the compiled DS bundle namespace. */
const DS = window.SavvyDesignSystem_9598d9;
const { Button, Eyebrow, Metric, Quote, Card, Input, Avatar, Badge } = DS;

const ASSET = "../../assets";
const Arrow = () => <span style={{ fontSize: "1.05em", lineHeight: 0 }}>→</span>;

function Nav({ onCta }) {
  const link = { fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-secondary)", textDecoration: "none" };
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,248,241,0.82)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", height: 72, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src={`${ASSET}/logos/savvy-wordmark-black.png`} alt="Savvy" style={{ height: 26 }} />
        <nav style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <a href="#" style={link}>How it works</a>
          <a href="#" style={link}>For advisors</a>
          <a href="#" style={link}>Pricing</a>
          <a href="#" style={link}>About</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Button variant="link" size="sm">Sign in</Button>
          <Button variant="primary" size="sm" onClick={onCta}>Book a call</Button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onCta }) {
  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <img src={`${ASSET}/illustrations/gold/globe-striped.png`} alt="" aria-hidden="true"
           style={{ position: "absolute", right: -120, top: 70, height: 540, opacity: 0.5 }} />
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "104px 32px 96px" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 26 }}>
          <Eyebrow rule>Wealth management, reimagined</Eyebrow>
          <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 76, lineHeight: 1.02, letterSpacing: "-0.025em", color: "var(--text-primary)", margin: 0 }}>
            A smarter home<br />for your wealth
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 21, lineHeight: 1.5, color: "var(--text-secondary)", maxWidth: 540, margin: 0 }}>
            Savvy pairs an experienced fiduciary advisor with technology that handles the busywork — so the relationship, not the paperwork, stays at the center.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
            <Button variant="primary" size="lg" onClick={onCta}>Book a call</Button>
            <Button variant="secondary" size="lg" iconRight={<Arrow />}>See how it works</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metrics() {
  return (
    <section style={{ borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--paper-100)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 32px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 56 }}>
        <Metric value="$2.4B" caption="Assets under advisement" />
        <Metric value="98%" caption="Client retention, year over year" />
        <Metric value="12 yrs" caption="Average advisor tenure" serif />
      </div>
    </section>
  );
}

function ValueProps() {
  const items = [
    { art: "sphere-equator", title: "A real advisor", body: "A dedicated fiduciary who knows your full picture — not a call-center queue." },
    { art: "orbit-dot", title: "Software that works", body: "Planning, transfers, and reporting handled quietly in the background." },
    { art: "venn-two", title: "One clear view", body: "Every account, goal, and document in a single, calm place." },
  ];
  return (
    <section style={{ maxWidth: 1180, margin: "0 auto", padding: "96px 32px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, marginBottom: 56, maxWidth: 640 }}>
        <Eyebrow>What it includes</Eyebrow>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 44, letterSpacing: "-0.02em", margin: 0 }}>One platform, three promises</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
        {items.map((it) => (
          <Card key={it.title} interactive padding="32px">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18 }}>
              <img src={`${ASSET}/illustrations/gold/${it.art}.png`} alt="" style={{ height: 60 }} />
              <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 23, letterSpacing: "-0.01em", margin: 0 }}>{it.title}</h3>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 16.5, lineHeight: 1.55, color: "var(--text-secondary)", margin: 0 }}>{it.body}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section style={{ background: "var(--savvy-black)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "104px 32px" }}>
        <Quote onDark name="Maya Iyer" role="Founder, Iyer Wealth" markSrc={`${ASSET}/illustrations/quote-white.png`}>
          Savvy gave our advisors their time back — so the relationship, not the paperwork, stays at the center of every conversation.
        </Quote>
      </div>
    </section>
  );
}

function CTA({ email, setEmail }) {
  return (
    <section style={{ maxWidth: 1180, margin: "0 auto", padding: "96px 32px" }}>
      <Card padding="56px" style={{ background: "var(--paper-100)", border: "1px solid var(--border-strong)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 56, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18 }}>
            <Eyebrow>Get started</Eyebrow>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 40, letterSpacing: "-0.02em", margin: 0 }}>See what calm looks like</h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 18, lineHeight: 1.5, color: "var(--text-secondary)", margin: 0 }}>
              Leave your email and an advisor will reach out within one business day.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Work email" type="email" placeholder="you@firm.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button variant="primary" size="lg" fullWidth>Book a call</Button>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-muted)" }}>
              By continuing you agree to Savvy's terms and privacy policy.
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}

function Footer() {
  const col = (title, links) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-on-dark-muted)" }}>{title}</div>
      {links.map((l) => <a key={l} href="#" style={{ fontFamily: "var(--font-body)", fontSize: 14.5, color: "var(--text-on-dark)", textDecoration: "none", opacity: 0.86 }}>{l}</a>)}
    </div>
  );
  return (
    <footer style={{ background: "var(--ink-900)", color: "var(--text-on-dark)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 32px 40px", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
          <img src={`${ASSET}/logos/savvy-wordmark-white.png`} alt="Savvy" style={{ height: 28 }} />
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55, color: "var(--text-on-dark-muted)", maxWidth: 240, margin: 0 }}>
            A smarter home for your wealth. Advisors and technology, working as one.
          </p>
        </div>
        {col("Product", ["How it works", "For advisors", "Pricing", "Security"])}
        {col("Company", ["About", "Careers", "Press", "Contact"])}
        {col("Legal", ["Disclosures", "Privacy", "Terms", "Form ADV"])}
      </div>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px 40px", borderTop: "1px solid var(--border-inverse)", paddingTop: 24, fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-on-dark-muted)" }}>
        © 2026 Savvy Advisors, Inc. Investment advisory services offered through Savvy Advisors, an SEC-registered investment adviser.
      </div>
    </footer>
  );
}

Object.assign(window, { SavvyNav: Nav, SavvyHero: Hero, SavvyMetrics: Metrics, SavvyValueProps: ValueProps, SavvyTestimonial: Testimonial, SavvyCTA: CTA, SavvyFooter: Footer });
