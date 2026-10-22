// Sätteri HAST plugin for blog Markdown (Astro 7's default Markdown processor).
// Turns `![alt](/blog/x.svg)` into a <figure> with a <figcaption> taken from the
// alt text, lazy-loads the image and adds width/height (read from the SVG
// viewBox) so the layout never shifts. Wired up in astro.config.mjs via
// `markdown.processor: satteri({ hastPlugins: [blogImagesPlugin] })`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const sizeCache = new Map();

function svgSize(src) {
  if (sizeCache.has(src)) return sizeCache.get(src);
  let size = null;
  try {
    const svg = readFileSync(publicDir + src.replace(/^\//, ''), 'utf8').slice(0, 2000);
    const viewBox = svg.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
    if (viewBox) size = { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
  } catch {
    size = null;
  }
  sizeCache.set(src, size);
  return size;
}

const isBlank = (n) => n.type === 'text' && !n.value.trim();
const isImg = (n) => n.type === 'element' && n.tagName === 'img';

/** Properties every blog image gets: lazy loading plus intrinsic size for SVGs. */
function imageProps(props) {
  const src = String(props.src ?? '');
  const next = { ...props, loading: 'lazy', decoding: 'async' };
  if (src.startsWith('/') && src.endsWith('.svg')) {
    const size = svgSize(src);
    if (size) Object.assign(next, size);
  }
  return next;
}

/** `<p><img/></p>` → `<figure><img/><figcaption>alt</figcaption></figure>` */
function soleImage(p) {
  const kids = (p.children ?? []).filter((n) => !isBlank(n));
  return kids.length === 1 && isImg(kids[0]) ? kids[0] : null;
}

export default function blogImagesPlugin() {
  return {
    name: 'blog-images',
    element: [
      {
        filter: ['p'],
        visit(node, ctx) {
          const img = soleImage(node);
          if (!img) return;
          const props = imageProps(img.properties ?? {});
          const alt = String(props.alt ?? '').trim();
          const children = [{ type: 'element', tagName: 'img', properties: props, children: [] }];
          if (alt) children.push({ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: alt }] });
          ctx.replaceNode(node, { type: 'element', tagName: 'figure', properties: {}, children });
        },
      },
      {
        filter: ['img'],
        visit(node, ctx) {
          // Images that are the sole content of a paragraph are rebuilt by the `p` visitor above.
          const parent = ctx.parent(node);
          if (parent && parent.type === 'element' && parent.tagName === 'p' && soleImage(parent)) return;
          const props = imageProps(node.properties ?? {});
          for (const [key, value] of Object.entries(props)) ctx.setProperty(node, key, value);
        },
      },
    ],
  };
}
