// Metro (React Native's bundler) does not know about pnpm workspaces by
// default. Without these two settings it cannot resolve `@app/shared` or
// packages hoisted to the workspace root, and fails with a cryptic
// "Unable to resolve module" error. See CHEATSHEET.md.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace, so editing packages/shared triggers a reload.
config.watchFolders = [workspaceRoot];

// Look for modules in both the local and the hoisted, workspace-root
// node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
