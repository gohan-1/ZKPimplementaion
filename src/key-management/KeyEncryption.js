// KeyEncryption.js
const CryptoJS = require('crypto-js');
const config = require('./config');

class KeyEncryption {
    constructor() {
        this.algorithm = config.encryptionAlgorithm;
        this.iterations = config.pbkdf2Iterations;
        this.keySize = config.keySize;
    }

    /**
     * Generate random salt and IV using crypto-js
     */
    generateSaltAndIV() {
        return {
            salt: CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex),
            iv: CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex)
        };
    }

    /**
     * Derive encryption key from password using PBKDF2
     */
    deriveKey(password, salt) {
        const passwordWA = CryptoJS.enc.Utf8.parse(password);
        const saltWA = CryptoJS.enc.Hex.parse(salt);

        // Generate key using PBKDF2
        const key = CryptoJS.PBKDF2(passwordWA, saltWA, {
            keySize: this.keySize / 32, // Convert bits to words (256/32 = 8 words)
            iterations: this.iterations,
            hasher: CryptoJS.algo.SHA256
        });

        return key;
    }

    /**
     * Calculate HMAC for authentication
     */
    calculateHMAC(data, key) {
        return CryptoJS.HmacSHA256(data, key).toString();
    }

    /**
     * Verify HMAC
     */
    verifyHMAC(data, hmac, key) {
        const expectedHmac = this.calculateHMAC(data, key);
        return CryptoJS.enc.Hex.parse(hmac).toString() === CryptoJS.enc.Hex.parse(expectedHmac).toString();
    }

    /**
     * Encrypt data with password using AES-CBC + HMAC
     */
    encrypt(data, password) {
        const { salt, iv } = this.generateSaltAndIV();

        console.log('salt')
        console.log(salt)
        console.log(iv)

        // Derive encryption key
        const key = this.deriveKey(password, salt);
        console.log('pssword')
        console.log(password)

        // Prepare IV for encryption
        const ivWA = CryptoJS.enc.Hex.parse(iv);

        // Encrypt data
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            iv: ivWA,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        const encryptedString = encrypted.toString();

        // Calculate HMAC for authentication (encrypted data + iv + salt)
        const hmacData = encryptedString + iv + salt;
        const hmac = this.calculateHMAC(hmacData, key);

        console.log(hmacData)
        console.log(hmac)

        return {
            salt: salt,
            iv: iv,
            data: encryptedString,
            hmac: hmac
        };
    }

    /**
     * Decrypt data with password
     */
    decrypt(encryptedData, password) {
        console.log(encryptedData)
        const { salt, iv, data, hmac } = encryptedData;

        // Derive key from password and salt

        console.log(password)
        const key = this.deriveKey(password, salt);

        // Verify HMAC before decryption

        // console.log(key)
        const hmacData = data + iv + salt;

        console.log(hmacData)

        if (!this.verifyHMAC(hmacData, hmac, key)) {
            throw new Error('Authentication failed: Invalid password or corrupted data');
        }

        // Prepare IV
        const ivWA = CryptoJS.enc.Hex.parse(iv);

        // Decrypt
        const decrypted = CryptoJS.AES.decrypt(data, key, {
            iv: ivWA,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        // Convert to UTF-8 string
        return decrypted.toString(CryptoJS.enc.Utf8);
    }

    /**
     * Create encrypted package with metadata
     */
    createEncryptedPackage(keyPair, password) {
        const data = JSON.stringify(keyPair, null, 2);
        const encrypted = this.encrypt(data, password);

        return {
            version: config.keyVersion,
            algorithm: this.algorithm,
            ...encrypted,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Extract decrypted key pair from package
     */
    extractKeyPair(encryptedPackage, password) {
        const decrypted = this.decrypt(encryptedPackage, password);
        return JSON.parse(decrypted);
    }
}

module.exports = KeyEncryption;