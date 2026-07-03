// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages project site. Update `site` to your GitHub username and `base`
  // to your repo name if they differ.
  site: 'https://deep-dive.avetavos.com',
  base: '/astro',
  output: 'static',
  integrations: [starlight({
      title: 'Astro Deep Dive',
      head: [
        { tag: 'script', attrs: { type: 'module', src: '/astro/enhance.js' } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/astro/manifest.webmanifest' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/astro/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/astro/icon-192.png' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#883AEA' } },
        { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: "Astro Deep Dive" } },
        { tag: 'script', content: "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/astro/sw.js',{scope:'/astro/'}).catch(function(){})})}" },
      ],
      defaultLocale: 'en',
      locales: {
        en: { label: 'English', lang: 'en' },
        th: { label: 'ไทย', lang: 'th' },
      },
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/avetavos/astro-deep-dive' }],
      sidebar: [
        { label: 'Astro Foundations & Mental Model', items: [{ autogenerate: { directory: 'foundations' } }] },
        { label: 'Components & Templating', items: [{ autogenerate: { directory: 'components' } }] },
        { label: 'Islands & Client Interactivity', items: [{ autogenerate: { directory: 'islands' } }] },
        { label: 'Content & Data', items: [{ autogenerate: { directory: 'content-and-data' } }] },
        { label: 'Server-Side Astro', items: [{ autogenerate: { directory: 'server-side' } }] },
        { label: 'Rendering, Performance & UX', items: [{ autogenerate: { directory: 'rendering-and-performance' } }] },
        { label: 'Tooling, Integrations & Production', items: [{ autogenerate: { directory: 'tooling-and-production' } }] },
      ],
      }), preact()],
});
