const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const imagesDir = path.resolve(__dirname, '../../frontend/public/images');

const jobs = [
  { file: 'logo.webp', widths: [32, 40, 48, 80], quality: 82 },
  { file: 'chiCoinFull.webp', widths: [96, 128, 160, 192], quality: 78 },
  { file: '1.webp', widths: [24, 32, 48, 64], quality: 80 },
  { file: '2.webp', widths: [24, 32, 48, 64], quality: 80 },
  { file: '3.webp', widths: [24, 32, 48, 64], quality: 80 },
];

async function ensureFileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function generateVariants() {
  for (const job of jobs) {
    const sourcePath = path.join(imagesDir, job.file);
    const sourceExists = await ensureFileExists(sourcePath);
    if (!sourceExists) {
      // eslint-disable-next-line no-console
      console.warn(`[skip] Missing source image: ${job.file}`);
      continue;
    }

    const base = path.parse(job.file).name;

    for (const width of job.widths) {
      const targetName = `${base}-${width}.webp`;
      const targetPath = path.join(imagesDir, targetName);

      await sharp(sourcePath)
        .resize({ width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: job.quality })
        .toFile(targetPath);

      // eslint-disable-next-line no-console
      console.log(`[ok] ${targetName}`);
    }
  }
}

generateVariants()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Done: static image variants generated.');
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to generate image variants:', error);
    process.exitCode = 1;
  });
