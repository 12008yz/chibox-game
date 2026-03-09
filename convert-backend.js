const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function convertDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      await convertDir(filePath);
    } else if (file.match(/\.(png|jpg|jpeg)$/i)) {
      const name = path.basename(file, path.extname(file));
      const webpPath = path.join(dir, `${name}.webp`);
      
      if (!fs.existsSync(webpPath)) {
        console.log(`Converting ${filePath} to WebP...`);
        try {
          await sharp(filePath)
            .webp({ quality: 80 })
            .toFile(webpPath);
        } catch (e) {
          console.error(`Error converting ${filePath}:`, e);
        }
      }
    }
  }
}

async function run() {
  const publicDir = path.join(__dirname, 'public');
  await convertDir(publicDir);
  console.log('Backend images conversion complete!');
}

run();