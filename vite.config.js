import { defineConfig } from "vite";

// GitHub project page: https://<user>.github.io/<repo>/
// If you rename the repo, update this path (leading + trailing slashes).
const repoBase = "/Augmented-Face/";

export default defineConfig({
  base: repoBase,
  build: {
    // Avoid `assets/` vs public `Assets/` merging on case-insensitive disks (macOS).
    assetsDir: "bundle",
  },
});
