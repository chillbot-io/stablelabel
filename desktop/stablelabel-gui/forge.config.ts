import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'StableLabel',
    executableName: 'stablelabel',
    icon: './assets/icon',
    // Code signing — set via environment variables in CI/CD:
    //   Windows: WINDOWS_CERTIFICATE_FILE, WINDOWS_CERTIFICATE_PASSWORD
    //   macOS: APPLE_IDENTITY (e.g., "Developer ID Application: ...")
    ...(process.env.APPLE_IDENTITY ? {
      osxSign: {
        identity: process.env.APPLE_IDENTITY,
      },
      osxNotarize: process.env.APPLE_TEAM_ID ? {
        teamId: process.env.APPLE_TEAM_ID,
      } : undefined,
    } : {}),
    extraResource: [
      // Bundle the PowerShell module inside the app
      '../StableLabel',
      // Bundle the Presidio classifier directory (built via PyInstaller --onedir)
      // Run: cd stablelabel-classifier && python build_exe.py
      // This bundles the entire dist/stablelabel-classifier/ directory
      '../stablelabel-classifier/dist/stablelabel-classifier',
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'StableLabel',
      setupIcon: './assets/icon.ico',
      // Windows code signing — set WINDOWS_CERTIFICATE_FILE and WINDOWS_CERTIFICATE_PASSWORD in CI
      ...(process.env.WINDOWS_CERTIFICATE_FILE ? {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      } : {}),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        name: 'stablelabel',
        productName: 'StableLabel',
        genericName: 'Compliance Management',
        icon: './assets/icon.png',
        categories: ['Utility'],
      },
    }),
    new MakerRpm({
      options: {
        name: 'stablelabel',
        productName: 'StableLabel',
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
