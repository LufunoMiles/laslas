import { copyFile, cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const sdkDirectory = dirname(require.resolve("@supabase/supabase-js/package.json"));
await mkdir("public/vendor", { recursive: true });
await Promise.all([
  ...["index.html", "admin.html", "auth.html"].map(page => copyFile(page, join("public", page))),
  cp("assets", "public/assets", { recursive: true }),
  copyFile(join(sdkDirectory, "dist", "umd", "supabase.js"), "public/vendor/supabase.js")
]);
