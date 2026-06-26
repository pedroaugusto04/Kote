import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const srcDir = path.resolve('src');
const distDir = path.resolve('dist');

async function build() {
  // Ensure dist directory exists
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  console.log('Building TypeScript source files...');
  try {
    await esbuild.build({
      entryPoints: [
        path.join(srcDir, 'background.ts'),
        path.join(srcDir, 'content-extractor.ts'),
        path.join(srcDir, 'popup.ts'),
      ],
      bundle: true,
      minify: false, // set to false for readability and debugging
      sourcemap: true,
      outdir: distDir,
      platform: 'browser',
      target: 'es2020',
      format: 'esm',
      define: {
        'process.env.NODE_ENV': '"production"',
        'process.env.LOG_PERF': 'undefined',
        'process.env': '{}',
      },
    });
    console.log('Build compiled successfully.');
  } catch (error) {
    console.error('Compilation failed:', error);
    process.exit(1);
  }

  console.log('Copying static assets...');
  const assets = ['manifest.json', 'popup.html', 'popup.css'];
  for (const asset of assets) {
    const srcPath = path.join(srcDir, asset);
    const destPath = path.join(distDir, asset);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    } else {
      console.warn(`Warning: Asset ${asset} not found in ${srcDir}`);
    }
  }

  console.log('Extension build complete! Output folder: dist/');
}

build();
