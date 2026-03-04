// vite-plugin-html-partials.js
// ─────────────────────────────────────────────────────────────────
// Replaces <!-- include:name --> markers in index.html with the
// contents of src/partials/name.html — at both dev-server and build time.
//
// Usage in index.html:
//   <!-- include:toolbar -->
//   <!-- include:sidebar -->
//   etc.
// ─────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs'
import { resolve }      from 'path'

export default function htmlPartials(partialsDir = 'src/partials') {
    const MARKER = /<!--\s*include:(\S+?)\s*-->/g

    function inject(html, root) {
        return html.replace(MARKER, (_, name) => {
            const file = resolve(root, partialsDir, `${name}.html`)
            try {
                return readFileSync(file, 'utf-8')
            } catch {
                console.warn(`[html-partials] Missing partial: ${file}`)
                return `<!-- partial "${name}" not found -->`
            }
        })
    }

    return {
        name: 'html-partials',

        // Dev server — transform index.html on every request
        transformIndexHtml(html, ctx) {
            const root = ctx.server?.config?.root ?? process.cwd()
            return inject(html, root)
        },

        // Build — transform the bundled HTML
        generateBundle() {},
        transformIndexHtml: {
            order: 'pre',
            handler(html, ctx) {
                const root = ctx.server?.config?.root ?? process.cwd()
                return inject(html, root)
            }
        }
    }
}
