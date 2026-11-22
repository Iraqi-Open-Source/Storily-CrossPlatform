/**
 * Copy the generated Storily icons into the native Android and iOS projects.
 *
 * `tauri android init` / `tauri ios init` scaffold the default launcher art
 * (Android robot WebP plus the green adaptive-icon vector, and the Tauri mark
 * on iOS). `tauri icon` only writes into those projects when they already
 * exist, and this repo generates icons before init. Run this after init and
 * before every mobile build so the home-screen icon is Storily.
 */
import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidSrc = join(root, "src-tauri", "icons", "android");
const androidDst = join(root, "src-tauri", "gen", "android", "app", "src", "main", "res");
const iosSrc = join(root, "src-tauri", "icons", "ios");
const iosDestinations = [
  join(root, "src-tauri", "gen", "apple", "Assets.xcassets", "AppIcon.appiconset"),
];

function copyTree(src, dst) {
  cpSync(src, dst, { recursive: true, force: true });
}

function applyAndroid() {
  if (!existsSync(androidDst)) {
    console.log("Android project is not initialized; launcher icons stay in src-tauri/icons/android.");
    return;
  }
  if (!existsSync(androidSrc)) {
    throw new Error("Missing src-tauri/icons/android. Run npm run icons first.");
  }
  for (const name of readdirSync(androidSrc)) {
    copyTree(join(androidSrc, name), join(androidDst, name));
  }
  let removed = 0;
  for (const bucket of readdirSync(androidDst)) {
    const dir = join(androidDst, bucket);
    if (!bucket.startsWith("mipmap-") || !statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".webp")) {
        rmSync(join(dir, file));
        removed += 1;
      }
    }
  }
  for (const extra of [
    "drawable-v24/ic_launcher_foreground.xml",
    "drawable/ic_launcher_background.xml",
    "drawable/ic_launcher_foreground.xml",
  ]) {
    const path = join(androidDst, extra);
    if (existsSync(path)) {
      rmSync(path);
      removed += 1;
    }
  }
  console.log(`Applied Storily Android icons (${removed} default template files removed).`);
}

function applyIos() {
  const destinations = iosDestinations.filter((path) => existsSync(path));
  if (destinations.length === 0) {
    console.log("iOS project is not initialized; icons stay in src-tauri/icons/ios.");
    return;
  }
  if (!existsSync(iosSrc)) {
    throw new Error("Missing src-tauri/icons/ios. Run npm run icons first.");
  }
  const pngs = readdirSync(iosSrc).filter((name) => name.endsWith(".png"));
  if (pngs.length === 0) {
    throw new Error("src-tauri/icons/ios has no PNG icons. Run npm run icons first.");
  }
  for (const destination of destinations) {
    for (const name of pngs) {
      cpSync(join(iosSrc, name), join(destination, name));
    }
    console.log(`Applied ${pngs.length} Storily iOS icons to ${destination}.`);
  }
}

applyAndroid();
applyIos();
