// signingSystem.js
const nacl = require('tweetnacl');
const { ed25519 } = require('@noble/ed25519');
const { base64 } = require('@scure/base');
const crypto = require('crypto');

class SigningSystem {
    constructor() {
        this.keyPairs = new Map(); // keyId -> { privateKey, publicKey, createdAt, expiresAt }
        this.currentKeyId = null;
        this.rotationHistory = [];
    }

    /**
     * Generate a new key pair
     */
    generateKeyPair(keyId = null, expiresInDays = 365) {
        const keyPair = nacl.sign.keyPair();

        const id = keyId || this._generateKeyId();
        const now = Date.now();

        const keyInfo = {
            id,
            privateKey: Buffer.from(keyPair.secretKey).toString('hex'),
            publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
            createdAt: now,
            expiresAt: now + (expiresInDays * 24 * 60 * 60 * 1000),
            isActive: true
        };

        this.keyPairs.set(id, keyInfo);

        return keyInfo;
    }

    /**
     * Initialize with first key
     */
    initialize() {
        const keyPair = this.generateKeyPair('primary', 365);
        this.currentKeyId = keyPair.id;
        this.rotationHistory.push({
            keyId: keyPair.id,
            action: 'create',
            timestamp: Date.now()
        });
        return keyPair;
    }

    /**
     * Rotate to a new key
     */
    rotateKey(reason = 'scheduled') {
        const newKeyId = `key_${Date.now()}`;
        const newKey = this.generateKeyPair(newKeyId, 365);

        // Keep old key active for verification of existing credentials
        const oldKey = this.keyPairs.get(this.currentKeyId);

        this.currentKeyId = newKeyId;
        this.rotationHistory.push({
            keyId: newKeyId,
            action: 'rotate',
            fromKey: oldKey.id,
            reason,
            timestamp: Date.now()
        });

        return {
            newKey,
            oldKey,
            rotationInfo: this.rotationHistory[this.rotationHistory.length - 1]
        };
    }

    /**
     * Deactivate an old key (after grace period)
     */
    deactivateKey(keyId, reason = 'expired') {
        const key = this.keyPairs.get(keyId);
        if (key) {
            key.isActive = false;
            key.deactivatedAt = Date.now();
            key.deactivationReason = reason;

            this.rotationHistory.push({
                keyId,
                action: 'deactivate',
                reason,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Sign a message with current key
     */
    sign(message, keyId = null) {
        const targetKeyId = keyId || this.currentKeyId;
        const keyInfo = this.keyPairs.get(targetKeyId);

        if (!keyInfo) {
            throw new Error(`Key ${targetKeyId} not found`);
        }

        if (!keyInfo.isActive) {
            throw new Error(`Key ${targetKeyId} is inactive`);
        }

        const privateKey = Buffer.from(keyInfo.privateKey, 'hex');
        const messageBuffer = typeof message === 'string'
            ? Buffer.from(message)
            : message;

        // Sign with Ed25519
        const signature = nacl.sign.detached(messageBuffer, privateKey);

        // Format for Circom compatibility
        return {
            r8x: this._toFieldElement(signature.slice(0, 32)),
            r8y: this._toFieldElement(signature.slice(32, 64)),
            s: this._toFieldElement(signature.slice(0, 32)), // S is first 32 bytes
            publicKeyX: this._toFieldElement(keyInfo.publicKey.slice(0, 64)),
            publicKeyY: this._toFieldElement(keyInfo.publicKey.slice(64, 128)),
            keyId: targetKeyId,
            timestamp: Date.now()
        };
    }

    /**
     * Verify a signature (supports multiple keys)
     */
    verify(message, signature, publicKeyHex) {
        const publicKey = Buffer.from(publicKeyHex, 'hex');
        const messageBuffer = typeof message === 'string'
            ? Buffer.from(message)
            : message;

        // Reconstruct signature from components
        const r8x = this._fromFieldElement(signature.r8x);
        const r8y = this._fromFieldElement(signature.r8y);
        const sigS = this._fromFieldElement(signature.s);

        // Combine to full signature
        const fullSignature = Buffer.concat([r8x, r8y, sigS]);

        try {
            return nacl.sign.detached.verify(messageBuffer, fullSignature, publicKey);
        } catch (error) {
            return false;
        }
    }

    /**
     * Verify with key rotation support (checks all active keys)
     */
    verifyWithRotation(message, signature, allowedKeyIds = null) {
        const keysToCheck = allowedKeyIds
            ? allowedKeyIds.map(id => this.keyPairs.get(id)).filter(k => k)
            : Array.from(this.keyPairs.values()).filter(k => k.isActive);

        for (const keyInfo of keysToCheck) {
            if (this.verify(message, signature, keyInfo.publicKey)) {
                return {
                    valid: true,
                    keyId: keyInfo.id,
                    publicKey: keyInfo.publicKey
                };
            }
        }

        return { valid: false, keyId: null, publicKey: null };
    }

    /**
     * Create credential hash for the circuit
     */
    async createCredentialHash(userId, issuerId) {
        const { poseidon } = await import('circomlibjs');
        const poseidonHash = await poseidon();

        const hash = poseidonHash([BigInt(userId), BigInt(issuerId)]);
        return hash.toString();
    }

    /**
     * Create a complete credential proof package
     */
    async createCredential(userId, issuerId, claimValue, requiredValue, operator) {
        // Create credential hash
        const credentialHash = await this.createCredentialHash(userId, issuerId);

        // Sign the credential hash with current key
        const signature = this.sign(credentialHash);

        return {
            credential: {
                userId,
                issuerId,
                credentialHash,
                claimValue,
                requiredValue,
                operator
            },
            proof: {
                signatureR8x: signature.r8x,
                signatureR8y: signature.r8y,
                signatureS: signature.s,
                issuerPublicKeyX: signature.publicKeyX,
                issuerPublicKeyY: signature.publicKeyY,
                keyId: signature.keyId,
                timestamp: signature.timestamp
            },
            metadata: {
                version: '1.0',
                keyRotationInfo: this.rotationHistory[this.rotationHistory.length - 1]
            }
        };
    }

    /**
     * Helper: Convert to field element (0..<2^253)
     */
    _toFieldElement(buffer) {
        // Ensure it fits in the field
        let value = BigInt('0x' + buffer.toString('hex'));
        const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
        value = value % FIELD_MODULUS;
        return value.toString();
    }

    /**
     * Helper: Convert from field element to buffer
     */
    _fromFieldElement(value) {
        const bigIntValue = BigInt(value);
        const hex = bigIntValue.toString(16).padStart(64, '0');
        return Buffer.from(hex, 'hex');
    }

    /**
     * Generate unique key ID
     */
    _generateKeyId() {
        return `key_${crypto.randomBytes(16).toString('hex')}`;
    }

    /**
     * Export key rotation history
     */
    exportRotationHistory() {
        return {
            currentKeyId: this.currentKeyId,
            keys: Array.from(this.keyPairs.entries()).map(([id, info]) => ({
                id,
                ...info,
                privateKey: undefined // Don't export private keys
            })),
            rotationHistory: this.rotationHistory
        };
    }

    /**
     * Import keys (for multi-node setups)
     */
    importKeys(keyData) {
        for (const key of keyData.keys) {
            if (key.privateKey) {
                this.keyPairs.set(key.id, key);
            }
        }
        if (keyData.currentKeyId) {
            this.currentKeyId = keyData.currentKeyId;
        }
        if (keyData.rotationHistory) {
            this.rotationHistory = keyData.rotationHistory;
        }
    }
}

// Example usage with key rotation
async function example() {
    const system = new SigningSystem();

    // Initialize with first key
    const initialKey = system.initialize();
    console.log('Initial key created:', initialKey.id);

    // Create a credential
    const credential = await system.createCredential(
        'user123',
        'issuer456',
        100,  // claimValue
        50,   // requiredValue
        1     // operator: 1 = greater than
    );

    console.log('Credential created:', credential);

    // Verify with current key
    const verification = system.verifyWithRotation(
        credential.credential.credentialHash,
        credential.proof,
        null // checks all active keys
    );

    console.log('Verification result:', verification);

    // Simulate key rotation
    console.log('\n--- Rotating Keys ---');
    const rotation = system.rotateKey('security_upgrade');
    console.log('Rotated to new key:', rotation.newKey.id);

    // Old credential should still verify with old key
    const oldVerification = system.verifyWithRotation(
        credential.credential.credentialHash,
        credential.proof,
        [rotation.oldKey.id] // explicitly allow old key
    );

    console.log('Old credential verification:', oldVerification);

    // Create new credential with new key
    const newCredential = await system.createCredential(
        'user456',
        'issuer456',
        200,
        100,
        1
    );

    console.log('New credential created with rotated key');

    // Export rotation history for audit
    const history = system.exportRotationHistory();
    console.log('\nKey rotation history:', JSON.stringify(history, null, 2));

    // Deactivate old key after grace period
    setTimeout(() => {
        system.deactivateKey(rotation.oldKey.id, 'grace_period_expired');
        console.log('Old key deactivated');

        // Old credential should now fail if old key is deactivated
        const finalVerification = system.verifyWithRotation(
            credential.credential.credentialHash,
            credential.proof
        );
        console.log('Old credential after deactivation:', finalVerification);
    }, 30000); // 30 second grace period
}

// Export for use in other modules
module.exports = { SigningSystem };

// Run example if executed directly
if (require.main === module) {
    example().catch(console.error);
}