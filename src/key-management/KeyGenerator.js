// KeyGenerator.js
const config = require('./config');
const KeyEncryption = require('./KeyEncryption');
const KeyStorage = require('./KeyStorage');
const path = require('path')
const nacl = require('tweetnacl');

class KeyGenerator {
    constructor(keysDir = null) {
        const finalKeysDir = keysDir || path.join(process.cwd(), config.defaultKeysDir);
        this.storage = new KeyStorage(finalKeysDir);
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
        const ed = require('@noble/ed25519');
        const { secretKey, publicKey } = await ed.keygenAsync();

        return {
            id: keyId || `noble_${Date.now()}`,
            library: 'noble',
            privateKey: Buffer.from(secretKey).toString('hex'),
            publicKey: Buffer.from(publicKey).toString('hex'),
            createdAt: new Date().toISOString(),
            version: config.keyVersion
        };
    }

    _generateNaclKey(keyId) {

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
     * Sign a message using the active key
     */
    async sign(message, password, privateKeyBuffer) {

        console.log(privateKeyBuffer)
        if (!privateKeyBuffer) {
            throw new Error(`Keys and privateKey not present present`);

        }

        // Get private key as buffer
        const messageUint8 = typeof message === 'string'
            ? new Uint8Array(Buffer.from(message))
            : new Uint8Array(message);

        // ✅ Step 1: get seed (32 bytes)
        const seed = new Uint8Array(privateKeyBuffer.buffer);

        // ✅ Step 2: expand to 64-byte secret key
        const keyPair = nacl.sign.keyPair.fromSeed(seed);

        // ✅ Step 3: sign
        const signature = nacl.sign.detached(messageUint8, keyPair.secretKey);


        // Parse public key coordinates (Ed25519 public key is 32 bytes, not 64)
        // For Ed25519, the public key is a single 32-byte point (compressed)
        // We need to decompress to get x and y coordinates
        // const publicKeyBuffer = Buffer.from(keyInfo.publicKey, 'hex');

        // For Circom compatibility, we need to split into x and y
        // For Ed25519, the public key is compressed; we'll use a simple approach
        // Convert the entire public key to a field element
        const publicKeyField = privateKeyBuffer.publicKey;

        // For signature, r is the first 32 bytes, s is the next 32 bytes
        // In Ed25519 signatures, (R, S) where R is 32 bytes and S is 32 bytes
        const r = signature.slice(0, 32);
        const s = signature.slice(32, 64);

        return {
            r8x: Buffer.from(r).toString('hex'),
            r8y: '0',
            s: Buffer.from(s).toString('hex'),
            publicKeyX: publicKeyField,
            publicKeyY: '0', // For Ed25519, we only need one coordinate
            keyId: privateKeyBuffer.keyId,
            timestamp: Date.now(),
            signature: Buffer.from(signature).toString('hex')
        };
    }

    verify(message, signature, publicKeyHex) {
        try {
            // ✅ Convert message → Uint8Array (IMPORTANT: match signing format)
            const messageUint8 = typeof message === 'string'
                ? new Uint8Array(Buffer.from(message))
                : new Uint8Array(message);

            // ✅ Reconstruct signature (R + S)
            const r = Buffer.from(signature.r8x, 'hex');   // 32 bytes
            const s = Buffer.from(signature.s, 'hex');     // 32 bytes
            const fullSignature = new Uint8Array(Buffer.concat([r, s]));

            // ✅ Convert public key
            const publicKeyUint8 = new Uint8Array(Buffer.from(publicKeyHex, 'hex'));

            // ✅ Verify
            const isValid = nacl.sign.detached.verify(
                messageUint8,
                fullSignature,
                publicKeyUint8
            );

            return isValid;

        } catch (error) {
            console.error('Verification failed:', error);
            return false;
        }
    }
    // /**
    //  * Verify a signature
    //  */
    // verify(message, signature, publicKeyHex) {
    //     const messageBuffer = typeof message === 'string'
    //         ? Buffer.from(message)
    //         : message;

    //     const signatureBuffer = Buffer.from(signature.signature || signature, 'hex');
    //     const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');

    //     try {
    //         const isValid = nacl.sign.detached.verify(
    //             messageBuffer,
    //             signatureBuffer,
    //             publicKeyBuffer
    //         );
    //         return isValid;
    //     } catch (error) {
    //         console.error('Verification failed:', error);
    //         return false;
    //     }
    // }






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