// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'AutoDocs',
  tagline: 'Tutorials generated from the running app, kept in sync automatically',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://example.com',
  baseUrl: '/',

  organizationName: 'esandeepchoudary',
  projectName: 'autodocs',

  onBrokenLinks: 'throw',

  // generate-docs.mjs writes plain CommonMark with `<!-- autodocs:keep -->`
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
          editUrl: 'https://github.com/esandeepchoudary/autodocs/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
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
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'AutoDocs',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Tutorials',
          },
          {
            href: 'https://github.com/esandeepchoudary/autodocs',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright: `Generated tutorials — kept in sync by AutoDocs.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
