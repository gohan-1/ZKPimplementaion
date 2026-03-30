const path = require('path');
const fs = require('fs');
const { askQuestion } = require('./utils');
const dotenv = require('dotenv');


dotenv.config();


function keysAlreadyExist(keysDir) {
    if (!fs.existsSync(keysDir)) return false;

    const files = fs.readdirSync(keysDir);

    // Check if any .json key files exist
    return files.some(file => file.endsWith('.json'));
}

async function generateKeysPrompt(appPath) {
    const keysDir = path.join(appPath, 'keys');

    // ✅ NEW CHECK
    if (keysAlreadyExist(keysDir)) {
        console.log('🔐 Key pair already exists. Skipping generation...');
        return;
    }

    const { KeyGenerator } = require('../../src/key-management');
    const generator = new KeyGenerator(keysDir);

    console.log('\n🔐 Generating signing keys...');
    console.log('1. noble');
    console.log('2. nacl');

    const choice = await askQuestion('Enter choice: ');
    const lib = choice === '2' ? 'nacl' : 'noble';

    const keyPair = await generator.generateKeyPair(lib);

    console.log(`Key ID: ${keyPair.id}`);

    const password = process.env.KEY_PASSWORD || 'vishnusks';

    if (!password) {
        console.error('❌ Missing KEY_PASSWORD');
        return;
    }

    const filePath = await generator.saveKeyPair(keyPair, password);

    const setActive = await askQuestion('Set active? (y/n): ');
    if (setActive.toLowerCase() === 'y') {
        generator.setActiveKey(keyPair.id, filePath);
    }

    // Save copy to Project_v1/keys (same as before)
    console.log('.........................................')
    console.log(process.cwd())
    const globalKeysDir = path.join(__dirname, '../../Project_v1/keys');
    if (!fs.existsSync(globalKeysDir)) {
        fs.mkdirSync(globalKeysDir, { recursive: true });
    }

    fs.writeFileSync(
        path.join(globalKeysDir, `${keyPair.id}.json`),
        JSON.stringify(keyPair, null, 2)
    );

    console.log('✅ Key pair generated and saved');
}

module.exports = { generateKeysPrompt };