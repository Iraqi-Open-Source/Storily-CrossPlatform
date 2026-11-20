# Architecture and extension points

## Application layers

- **Vite frontend**: `src/main.js` renders screen state and talks to a narrow set of Tauri commands; `src/style.css` handles responsive desktop / mobile layouts.
- **Rust storage**: `src-tauri/src/lib.rs` has `Library`, `Album`, `Photo`, `Repository`, image processing, portable archive converters, and command handlers. No persistent external service.
- **Native bridge**: Tauri IPC for album/image commands; Tauri dialog & fs plugins for exports into desktop and mobile document locations.

## Schema

`library.json` tracks albums and photos (image pixels not embedded). Imported image bytes are stored in separate files under the app-data root. This avoids loading gigabyte archives into memory at every startup, unlike a large JSON single-file album.

`.storily` v2 is a top-level `{ format: 'storily-v2', album: Album, photos: [{ photo: Photo, dataBase64: '...' }] }` JSON document. Legacy Swift `.storily` is top-level `[ImageMetadata, ...]`. Conversion is one-way into the local app-data library unless exported again.

## Recommended next milestones

1. Replace the current JSON metadata index with a SQLite catalog for very large photo libraries and add migration tests.
2. Add file-backed streaming instead of DataURL/base64 IPC to reduce RAM for >100 MB exports.
3. Add non-destructive, reversible edits with an edit history rather than overwriting originals.
4. Add EXIF orientation / metadata extraction, batch edits, full-res preview paging, and cancelable progress for imports.
5. Audit accessibility/keyboard navigation, RTL translations, large text, and mobile picker UI on real devices.
6. Add native iOS signing, Android keystore signing, notarization, App Store / Google Play release workflows, and signed desktop updates.
7. Consider account-independent sync via user-owned cloud providers with optional end-to-end encryption.

## Trust boundaries

Image decoders and external `.storily` documents are untrusted input. Limit imports by file size/count, use UUID-derived paths, and reject references to external legacy image paths. Validate exports for file format; keep Tauri permissions scoped to user-selected files via dialog plugin. Add fuzz tests on malformed images and archive data before broad distribution.
