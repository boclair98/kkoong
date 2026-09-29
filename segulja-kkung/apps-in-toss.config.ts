import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'segulja-kkung',
  brand: {
    primaryColor: '#9D7CFF',
  },
  navigationBar: {
    theme: 'dark',
    transparentBackground: true,
    withTitle: false,
    withHomeButton: false,
  },
  permissions: [],
  webBundleDir: 'dist',
});
