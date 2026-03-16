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
    extraResource: [
      // Bundle the PowerShell module inside the app
      '../StableLabel',
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'StableLabel',
      setupIcon: './assets/icon.ico',
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
