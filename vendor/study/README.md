# Study reader libraries

Vendored from the same pinned packages used by CGMHOPH's OPH Study reader:

- JSZip 3.10.1: `https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js`
- sql.js 1.10.3: `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js` and `sql-wasm.wasm`

Keep the JavaScript and WASM binary from the same sql.js release. JSZip and sql.js licenses are included alongside the files. Runtime loading is from the site's own origin, only when a deck is opened.
