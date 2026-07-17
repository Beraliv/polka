# Features

Small features per book format, as implemented in `apps/client/src/lib/book`.

| Feature | FB2 | EPUB |
| --- | --- | --- |
| Book title metadata | ✅ `<book-title>` | ✅ OPF `<dc:title>` |
| Author metadata | ✅ `<first-name>` + `<last-name>` | ✅ OPF `<dc:creator>` |
| Book language (used for hyphenation) | ✅ `<title-info>/<lang>` | ❌ |
| Chapters / sections | ✅ recursive `<section>` | ✅ one per spine item |
| Section titles | ✅ `<title>` | ✅ first `<h1>`–`<h3>` |
| Heading levels (h1–h5) | ✅ nesting depth, max 5 | ❌ always level 1 |
| Paragraph text | ✅ `<p>` | ✅ `<p>`, `<li>` |
| Verse & wrapped blocks (poem, epigraph, cite) | ✅ `<v>` and descendants | ✅ bare-text `<blockquote>` |
| Inline italic / bold | ✅ `<emphasis>` / `<strong>` | ✅ `<em>` / `<i>` / `<strong>` / `<b>` |
| Footnote popups | ✅ `<a type="note">` + notes body | ✅ `epub:type="noteref"` + endnote heuristics |
| Images | ✅ `<binary>` base64 → data URL | ❌ |
| Vertical gaps | ✅ `<empty-line/>` | ❌ |
