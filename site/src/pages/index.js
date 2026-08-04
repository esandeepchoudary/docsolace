import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';

import Heading from '@theme/Heading';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/overview">
            Browse the docs
          </Link>
          <Link className="button button--primary button--lg" to="/docs/dashboard-overview">
            See a generated page
          </Link>
        </div>
      </div>
    </header>
  );
}

// The screenshot below is copied straight from a real generated tour
// (docs/images/dashboard-overview/dashboard-full@desktop.png) — the same
// file the "Dashboard overview" doc page embeds, not a staged mockup. See
// CLAUDE.md's "Page layout vs. design-skill styling" note: this page is
// hand-authored site copy, not generated output, so it's fine for a human to
// edit directly — it just isn't allowed to claim anything the pipeline
// itself doesn't actually do.
function ProofSection() {
  return (
    <section className={styles.proofSection}>
      <div className="container">
        <div className={styles.proofGrid}>
          <img
            src={useBaseUrl('/img/generated-page-example.png')}
            alt="A real screenshot from DocSolace's own generated 'Dashboard overview' tutorial"
            className={styles.proofImage}
          />
          <div>
            <Heading as="h2">A real generated page, not a mockup</Heading>
            <p>
              This screenshot is the exact file DocSolace's own{' '}
              <Link to="/docs/dashboard-overview">Dashboard overview</Link> tutorial embeds —
              captured by Playwright against the running demo app, paired with an
              accessibility snapshot, and never touched by hand. <Link to="/docs/dashboard-overview">
              Read the full generated page</Link> to see the prose grounded in that same snapshot.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const HOW_IT_WORKS = [
  {title: 'Drive', body: "Playwright clicks through your app's real running UI — no fixtures, no mockups."},
  {title: 'Capture', body: 'Every step records a screenshot and an accessibility snapshot together.'},
  {title: 'Write', body: "Prose is grounded strictly in what the snapshot shows — nothing invented."},
  {title: 'Review', body: 'Output ships as a pull request. You decide what merges — never auto-merged.'},
];

function HowItWorks() {
  return (
    <section className={styles.howItWorks}>
      <div className="container">
        <Heading as="h2" className={styles.howItWorksHeading}>
          How it works
        </Heading>
        <ol className={styles.howItWorksList}>
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className={styles.howItWorksStep}>
              <span className={styles.howItWorksIndex}>{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <ProofSection />
        <HowItWorks />
      </main>
    </Layout>
  );
}
