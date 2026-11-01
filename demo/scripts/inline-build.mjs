#!/usr/bin/env node
/**
 * Inline the single-chunk Vite build (dist/) into:
 *   dist-single/totk-luma-demo.html   - a complete document that works from file://
 *   dist-artifact/totk-luma-scope.html - the same page as a fragment for a Claude Artifact
 *                                        (no doctype/html/head/body; starts with <title>)
 * No dependencies beyond Node itself.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const assets = readdirSync(join(dist, 'assets'));
const jsFiles = assets.filter((f) => f.endsWith('.js'));
const cssFiles = assets.filter((f) => f.endsWith('.css'));
if (jsFiles.length !== 1) {
  throw new Error(`Expected exactly one JS chunk in dist/assets, found ${jsFiles.length}: ${jsFiles.join(', ')}`);
}
if (cssFiles.length > 1) throw new Error(`Expected at most one CSS file, found ${cssFiles.length}`);

const js = readFileSync(join(dist, 'assets', jsFiles[0]), 'utf8');
const css = cssFiles.length ? readFileSync(join(dist, 'assets', cssFiles[0]), 'utf8') : '';

// Never let inlined code close the script or style element early.
const safeJs = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const safeCss = css.replace(/<\/style/gi, '<\\/style');

const title = (html.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? 'TOTK Luma Scope Demo';
const description = (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? '';

const styleTag = `<style>\n${safeCss}\n</style>`;
const rootDiv = '<div id="root"></div>';
const scriptTag = `<script type="module">\n${safeJs}\n</script>`;

const single = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <meta name="description" content="${description}" />
    <title>${title}</title>
    ${styleTag}
  </head>
  <body>
    ${rootDiv}
    ${scriptTag}
  </body>
</html>
`;

const fragment = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${styleTag}
${rootDiv}
${scriptTag}
`;

mkdirSync(join(root, 'dist-single'), { recursive: true });
mkdirSync(join(root, 'dist-artifact'), { recursive: true });
writeFileSync(join(root, 'dist-single', 'totk-luma-demo.html'), single);
writeFileSync(join(root, 'dist-artifact', 'totk-luma-scope.html'), fragment);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist-single/totk-luma-demo.html   ${kb(single)}`);
console.log(`dist-artifact/totk-luma-scope.html ${kb(fragment)}`);
