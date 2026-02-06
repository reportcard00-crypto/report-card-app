const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ensure web-specific extensions are resolved first
config.resolver.sourceExts = [
  'web.ts',
  'web.tsx',
  'web.js',
  'web.jsx',
  ...config.resolver.sourceExts,
];

// Force zustand to use the CJS version (which doesn't have import.meta)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'zustand') {
    // Force using the main CJS entry point instead of ESM
    return {
      filePath: path.resolve(__dirname, 'node_modules/zustand/index.js'),
      type: 'sourceFile',
    };
  }
  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
