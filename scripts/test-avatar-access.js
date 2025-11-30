const path = require('path');
const fs = require('fs').promises;

async function testAvatarAccess() {
  console.log('🔍 Testing Avatar Access Configuration\n');

  const avatarsDir = path.join(__dirname, 'public/avatars');

  try {
    // Проверка существования директории
    const stats = await fs.stat(avatarsDir);
    console.log('✅ Avatars directory exists:', avatarsDir);
    console.log('   Is directory:', stats.isDirectory());

    // Список файлов в директории
    const files = await fs.readdir(avatarsDir);
    console.log(`\n📁 Found ${files.length} file(s) in avatars directory:`);

    for (const file of files.slice(0, 5)) {
      const filePath = path.join(avatarsDir, file);
      const fileStats = await fs.stat(filePath);
      console.log(`   - ${file} (${(fileStats.size / 1024).toFixed(2)} KB)`);
    }

    if (files.length > 5) {
      console.log(`   ... and ${files.length - 5} more files`);
    }

    // Проверка доступов
    console.log('\n🔐 Checking permissions:');
    await fs.access(avatarsDir, fs.constants.R_OK);
    console.log('   ✅ Read access: OK');

    await fs.access(avatarsDir, fs.constants.W_OK);
    console.log('   ✅ Write access: OK');

    // Информация о путях
    console.log('\n🗺️  Path configuration:');
    console.log('   Absolute path:', avatarsDir);
    console.log('   Relative to __dirname:', path.relative(__dirname, avatarsDir));
    console.log('   Public URL: /avatars/[filename]');
    console.log('   Alternative URL: /api/avatars/[filename]');

    console.log('\n✅ Avatar access test completed successfully!');

  } catch (error) {
    console.error('\n❌ Error testing avatar access:');
    console.error('   Error:', error.message);

    if (error.code === 'ENOENT') {
      console.log('\n💡 Solution: Create the avatars directory:');
      console.log(`   mkdir -p ${avatarsDir}`);
    }
  }
}

testAvatarAccess().catch(console.error);
