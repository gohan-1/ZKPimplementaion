// index.js
const KeyGenerator = require('./KeyGenerator');
const KeyEncryption = require('./KeyEncryption');
const KeyStorage = require('./KeyStorage');
const config = require('./config');

// Export main components
module.exports = {
    KeyGenerator,
    KeyEncryption,
    KeyStorage,
    config,

    // Convenience function for quick key generation
    async generateKeys(options = {}) {
        const generator = new KeyGenerator(options.keysDir);
        const library = options.library || config.defaultLibrary;
        const keyId = options.keyId || null;

        const keyPair = await generator.generateKeyPair(library, keyId);

        if (options.password) {
            const filePath = await generator.saveKeyPair(keyPair, options.password);
            return { keyPair, filePath };
        }

        return { keyPair };
    },

    // Convenience function for loading keys
    async loadKeys(password, options = {}) {
        const generator = new KeyGenerator(options.keysDir);
        return await generator.loadKeyPair(password, options.library);
    },

    // List available keys
    listKeys(options = {}) {
        const generator = new KeyGenerator(options.keysDir);
        return generator.listKeys();
    }
};