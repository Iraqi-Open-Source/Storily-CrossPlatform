# Pre-release verification checklist

This environment could not install Rust crates or build native targets, so this is an unverified source-code delivery. Run each checklist item on native hosts / GitHub Actions, record results, and fix any failing builds before publishing.

- [ ] `npm install && npm run icons && npm run build`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Desktop: create 2 albums; import PNG/JPG/WebP/TIFF; drag/drop, reload app and verify local persistence.
- [ ] Import real Swift `.storily` with TIFF `imageData`, verify all photos, date/time conversion, description, location and alignment.
- [ ] Export v2 `.storily`, delete a copy of the album, import again, check exact image count and metadata.
- [ ] Open an album and use Preview export. Page through the PDF style and confirm no file is written. Export PDF and `.storily` still save a file.
- [ ] Test filter/rotate/crop/emoji editor and favorite/search/sort; confirm backup strategy before destructive edit.
- [ ] Export PDFs in English and Arabic with all five styles, compare on phone and desktop.
- [ ] Build Windows x64 NSIS EXE and MSI; install and launch on Windows 10 and 11 (WebView2 installed).
- [ ] Build macOS Intel and arm64 .dmg / .app; verify Gatekeeper/signing behavior and icons.
- [ ] Build Ubuntu 22.04 .deb/.rpm/.AppImage; run on actual Linux distro with correct WebKitGTK.
- [ ] Android: build and install debug APK on Android 8+; the launcher icon is the Storily mark, not the green Android template icon. Import/export using scoped document provider (`content://` URI).
- [ ] iPhone & iPad: compile simulator app; the home-screen icon is the Storily mark, not the Tauri logo. Test photo picker and save dialogs; check iPhone safe areas and tablet layout.
- [ ] Configure Apple signing and build real .ipa (App Store or development provisioning); configure Android release keystore and sign AAB.
- [ ] Verify release binaries contain exact icon fetched from upstream (not bundled offline placeholder).
