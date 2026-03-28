// KeyGenerator.js
const config = require('./config');
const KeyEncryption = require('./KeyEncryption');
const KeyStorage = require('./KeyStorage');

class KeyGenerator {
    constructor(keysDir = null) {
        this.storage = new KeyStorage(keysDir);
        this.encryption = new KeyEncryption();
    }

    /**
     * Generate key pair using specified library
     */
    async generateKeyPair(library = config.defaultLibrary, keyId = null) {
        if (!config.supportedLibraries.includes(library)) {
            throw new Error(`Unsupported library: ${library}. Supported: ${config.supportedLibraries.join(', ')}`);
        }

        let keyPair;

        if (library === 'noble') {
            keyPair = await this._generateNobleKey(keyId);
        } else if (library === 'nacl') {
            keyPair = this._generateNaclKey(keyId);
        }

        return keyPair;
    }

    async _generateNobleKey(keyId) {
        const { ed25519 } = require('@noble/ed25519');
        const privateKey = ed25519.utils.randomPrivateKey();
        const publicKey = await ed25519.getPublicKey(privateKey);

        return {
            id: keyId || `noble_${Date.now()}`,
            library: 'noble',
            privateKey: Buffer.from(privateKey).toString('hex'),
            publicKey: Buffer.from(publicKey).toString('hex'),
            createdAt: new Date().toISOString(),
            version: config.keyVersion
        };
    }

    _generateNaclKey(keyId) {
        const nacl = require('tweetnacl');
        const keyPairRaw = nacl.sign.keyPair();

        return {
            id: keyId || `nacl_${Date.now()}`,
            library: 'nacl',
            privateKey: Buffer.from(keyPairRaw.secretKey).toString('hex'),
            publicKey: Buffer.from(keyPairRaw.publicKey).toString('hex'),
            createdAt: new Date().toISOString(),
            version: config.keyVersion
        };
    }

    /**
     * Save encrypted key pair
     */
    async saveKeyPair(keyPair, password, customFilename = null) {
        if (!password || password.length < config.minPasswordLength) {
            throw new Error(`Password must be at least ${config.minPasswordLength} characters`);
        }

        const encryptedPackage = this.encryption.createEncryptedPackage(keyPair, password);
        const filename = customFilename || this.storage.getKeyFileForLibrary(keyPair.library);

        const filePath = this.storage.save(filename, encryptedPackage);
        return filePath;
    }

    /**
     * Load and decrypt key pair
     */
    async loadKeyPair(password, library = null) {
        if (!password) {
            throw new Error('Password is required for decryption');
        }

        // Determine which file to load
        let filename = null;

        // Try active key first
        const activeKey = this.storage.loadActiveKey();
        if (activeKey && activeKey.file) {
            filename = activeKey.file;
        }

        // If no active key or library specified, try library-specific
        if (!filename && library) {
            filename = this.storage.getKeyFileForLibrary(library);
        }

        // If still no filename, try to find any key file
        if (!filename) {
            const files = this.storage.listFiles('.enc');
            if (files.length === 0) {
                throw new Error('No key files found');
            }
            filename = files[0];
        }

        // Load encrypted package
        const encryptedPackage = this.storage.load(filename);
        if (!encryptedPackage) {
            throw new Error(`Key file not found: ${filename}`);
        }

        // Decrypt and return
        const keyPair = this.encryption.extractKeyPair(encryptedPackage, password);
        return keyPair;
    }

    /**
     * Set active key
     */
    setActiveKey(keyId, filePath) {
        return this.storage.saveActiveKey(keyId, filePath);
    }

    /**
     * Get active key info
     */
    getActiveKey() {
        return this.storage.loadActiveKey();
    }

    /**
     * List all keys
     */
    listKeys() {
        const files = this.storage.listFiles('.enc');
        return files.map(filename => ({
            ...this.storage.getFileInfo(filename),
            isActive: this.isActiveKey(filename)
        }));
    }

    isActiveKey(filename) {
        const activeKey = this.storage.loadActiveKey();
        return activeKey && activeKey.file === filename;
    }

    /**
     * Export public key
     */
    exportPublicKey(keyPair, outputPath = null) {
        const publicKeyData = {
            id: keyPair.id,
            library: keyPair.library,
            publicKey: keyPair.publicKey,
            createdAt: keyPair.createdAt
        };

        const filename = outputPath || `${keyPair.id}_public.json`;
        const filePath = this.storage.save(filename, publicKeyData);
        return filePath;
    }

    /**
     * Delete a key file
     */
    deleteKey(filename) {
        if (this.isActiveKey(filename)) {
            throw new Error('Cannot delete active key. Set another key as active first.');
        }
        return this.storage.delete(filename);
    }
}

module.exports = KeyGenerator;