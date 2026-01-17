#!/usr/bin/env node

/**
 * Postinstall script to ensure Electron binary is downloaded correctly
 * This is needed because pnpm doesn't recognize electron_mirror in .npmrc
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const electronPath = path.join(__dirname, '../node_modules/electron');
const electronDist = path.join(electronPath, 'dist');
const installScript = path.join(electronPath, 'install.js');

// Set environment variables for electron download
process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';
process.env.ELECTRON_BUILDER_BINARIES_MIRROR = process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/';

// Check if electron binary exists (platform-specific)
const isWindows = process.platform === 'win32';
const electronBinary = isWindows 
  ? path.join(electronDist, 'electron.exe')
  : (process.platform === 'darwin' 
      ? path.join(electronDist, 'Electron.app')
      : path.join(electronDist, 'electron'));

// Check if electron binary exists
const electronExists = fs.existsSync(electronBinary) || fs.existsSync(electronDist);

// Check if electron binary needs to be downloaded
if (!electronExists && fs.existsSync(installScript)) {
  console.log('Electron binary not found, downloading...');
  try {
    execSync(`node "${installScript}"`, {
      stdio: 'inherit',
      env: process.env,
      cwd: path.join(__dirname, '..')
    });
    console.log('Electron binary downloaded successfully');
  } catch (error) {
    console.warn('Warning: Failed to download Electron binary:', error.message);
  }
} else if (electronExists) {
  console.log('Electron binary already exists');
}

