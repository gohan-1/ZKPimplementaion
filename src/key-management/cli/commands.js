// cli/commands.js
const KeyGenerator = require('../KeyGenerator');
const Prompts = require('./prompts');

class Commands {
    constructor() {
        this.generator = new KeyGenerator();
        this.prompts = new Prompts();
    }

    async generateInteractive() {
        console.log('\n🔐 Key Generation Tool\n');
        console.log('This tool will generate Ed25519 key pairs for your ZKP system.');
        console.log('Keys will be encrypted and stored securely using AES-256-CBC with HMAC authentication.\n');

        // Select library
        const library = await this.prompts.selectLibrary();

        // Generate key pair
        console.log(`\nGenerating ${library} key pair...`);
        const keyPair = await this.generator.generateKeyPair(library);

        console.log(`✅ Key pair generated!`);
        console.log(`   ID: ${keyPair.id}`);
        console.log(`   Public Key: ${keyPair.publicKey.substring(0, 32)}...`);

        // Get password
        const password = await this.prompts.getPassword(true);

        // Save encrypted key
        const filePath = await this.generator.saveKeyPair(keyPair, password);

        // Set as active
        const setActive = await this.prompts.confirm('\nSet this as active key?');
        if (setActive) {
            this.generator.setActiveKey(keyPair.id, filePath);
        }

        // Export public key
        const exportPublic = await this.prompts.confirm('Export public key?');
        if (exportPublic) {
            await this.generator.exportPublicKey(keyPair);
        }

        console.log('\n✅ Key generation complete!');
        console.log('\n⚠️  IMPORTANT:');
        console.log('   - Keep your password secure!');
        console.log(`   - Keys are stored in: ${this.generator.storage.baseDir}`);
        console.log('   - Encryption: AES-256-CBC with HMAC-SHA256 authentication');

        this.prompts.close();
        return keyPair;
    }

    async listKeys() {
        const keys = this.generator.listKeys();

        if (keys.length === 0) {
            console.log('\nNo keys found.');
            return;
        }

        console.log('\n📋 Available keys:');
        keys.forEach(key => {
            const active = key.isActive ? '🔑 ACTIVE' : '   ';
            console.log(`  ${active} ${key.name}`);
            console.log(`       Size: ${Math.round(key.size / 1024)} KB`);
            console.log(`       Modified: ${key.modified.toLocaleString()}`);
            console.log('');
        });

        const activeKey = this.generator.getActiveKey();
        if (activeKey) {
            console.log(`\nActive key: ${activeKey.keyId} (${activeKey.file})`);
        }
    }

    async generateNonInteractive(library, password) {
        const keyPair = await this.generator.generateKeyPair(library);
        const filePath = await this.generator.saveKeyPair(keyPair, password);

        // Output JSON for script consumption
        console.log(JSON.stringify({
            success: true,
            keyId: keyPair.id,
            publicKey: keyPair.publicKey,
            filePath: filePath,
            library: library,
            encryption: 'aes-256-cbc-hmac-sha256'
        }));

        return keyPair;
    }

    async exportKey(keyId) {
        const keys = this.generator.listKeys();
        const key = keys.find(k => k.name.includes(keyId) || k.name === keyId);

        if (!key) {
            console.error(`Key not found: ${keyId}`);
            return;
        }

        // Need password to load key
        const password = await this.prompts.getPassword(false);
        const keyPair = await this.generator.loadKeyPair(password);

        const exportPath = await this.generator.exportPublicKey(keyPair);
        console.log(`✅ Public key exported to: ${exportPath}`);

        this.prompts.close();
    }

    async setActiveKey(keyId) {
        const keys = this.generator.listKeys();
        const key = keys.find(k => k.name.includes(keyId) || k.name === keyId);

        if (!key) {
            console.error(`Key not found: ${keyId}`);
            return;
        }

        this.generator.setActiveKey(keyId, key.name);
        console.log(`✅ Active key set to: ${keyId}`);
    }

    async loadAndVerify(password) {
        try {
            const keyPair = await this.generator.loadKeyPair(password);
            console.log(`✅ Key loaded successfully!`);
            console.log(`   ID: ${keyPair.id}`);
            console.log(`   Library: ${keyPair.library}`);
            console.log(`   Created: ${keyPair.createdAt}`);
            return keyPair;
        } catch (error) {
            console.error(`❌ Failed to load key: ${error.message}`);
            throw error;
        }
    }
}

module.exports = Commands;