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
