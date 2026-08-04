// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'DocSolace',
  // Docusaurus falls back to this as the page's meta/og description on any
  // page that doesn't set its own frontmatter `description` (every
  // generated tutorial does; this landing page and a couple of others
  // don't) — themeConfig.metadata's "description" entry is overridden by
  // this default, so the SEO-relevant text needs to live here instead.
  tagline:
    "Docs generated from your app's real running UI — grounded in what the browser actually saw, and flagged the moment a screen drifts. You stay in the loop: every run ships as a reviewable PR, never auto-merged.",
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  // The published GitHub Pages URL (see PUBLISHING.md / .github/workflows/
  // deploy-site.yml at the repo root) — the sitemap and every canonical/OG
  // URL Docusaurus emits are only correct once this is real, not the
  // scaffold's example.com placeholder.
  url: 'https://esandeepchoudary.github.io',
  baseUrl: '/docsolace/',

  organizationName: 'esandeepchoudary',
  projectName: 'docsolace',

  onBrokenLinks: 'throw',

  // Site-wide JSON-LD — themeConfig.metadata (below) covers the plain
  // description/keywords meta tags; this is the one thing that needs a raw
  // tag since Docusaurus has no built-in structured-data option.
  headTags: [
    {
      tagName: 'script',
      attributes: { type: 'application/ld+json' },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'DocSolace',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Cross-platform',
        description:
          'Claude Code plugin that drives your running web app with Playwright, takes screenshots, and writes tutorial-style Markdown docs that stay in sync as the app changes.',
        url: 'https://esandeepchoudary.github.io/docsolace/',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }),
    },
  ],

  // generate-docs.mjs writes plain CommonMark with `<!-- docsolace:keep -->`
  // HTML comments — MDX (the default) parses `<!-- -->` as JSX and chokes on
  // it, so every doc is treated as plain Markdown instead.
  markdown: {
    format: 'md',
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        // Serves the repo's real docs/ directory directly — no duplication,
        // generate-docs.mjs writes there and the site just reads it.
        docs: {
          path: '../docs',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/esandeepchoudary/docsolace/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        // Explicit (rather than relying on the classic preset's defaults)
        // so it's obvious this only starts emitting real absolute URLs once
        // `url` above is a real host — a bare relative `url` would silently
        // produce a broken sitemap.xml.
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          filename: 'sitemap.xml',
        },
      }),
    ],
  ],

  // Self-contained, zero-external-service search — no Algolia account/API
  // key to set up, which matters for a plugin whose whole pitch is "install
  // once, works in any project". Indexes at build time (site/build/) rather
  // than a hosted crawler, so search results are only ever as fresh as the
  // last build/deploy, same staleness window as everything else on the site.
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        indexDocs: true,
        indexBlog: false,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Site-wide og:image/twitter:image (og.png is a plain, generic
      // 1280x640 card — see .github/social-preview.png at the repo root,
      // generated the same way and used for the repo's own GitHub social
      // preview). Any page can still override with its own frontmatter
      // `image`.
      image: 'img/og.png',
      // Docusaurus has no built-in default for "keywords" the way it does
      // for "description" (which falls back to `tagline` above), so this is
      // the one that actually needs to be set here.
      metadata: [
        {
          name: 'keywords',
          content:
            'documentation generator, docs as code, claude code plugin, playwright, headless browser, screenshot testing, docusaurus, technical documentation',
        },
        {
          name: 'google-site-verification',
          content: 'm3nQPyVi5nM03PaC8iTUJK73i-N4Wsv_ELtji9sVN8w',
        },
      ],
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'DocSolace',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Tutorials',
          },
          {
            href: 'https://github.com/esandeepchoudary/docsolace',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright: `Generated tutorials — kept in sync by DocSolace.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
