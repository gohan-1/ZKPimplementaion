// utils/hash.util.js
const keccak256 = require('keccak256');
const { buildPoseidon } = require('circomlibjs');

let poseidonInstance = null;

/**
 * Initialize Poseidon hash (singleton)
 */
async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
    return poseidonInstance;
}

/**
 * Compute Poseidon hash (for credentialHash)
 * @param {number[]} inputs - Array of numbers to hash
 * @returns {Promise<string>} Hex string hash
 */
async function poseidonHash(inputs) {
    const poseidon = await getPoseidon();
    const hash = poseidon.F.toString(poseidon(inputs));
    return '0x' + BigInt(hash).toString(16);
}

/**
 * Compute Keccak256 hash (for Merkle leaf)
 * @param {number} userID - User ID
 * @param {number} issuerID - Issuer ID
 * @param {string} credentialHash - Credential hash
 * @returns {string} Hex string leaf
 */
function computeMerkleLeaf(userID, issuerID, credentialHash) {
    // Convert to 32-byte buffers (Solidity-compatible)
    const userIDBuf = Buffer.from(userID.toString(16).padStart(64, '0'), 'hex');
    const issuerIDBuf = Buffer.from(issuerID.toString(16).padStart(64, '0'), 'hex');
    const hashBuf = Buffer.from(credentialHash.replace('0x', ''), 'hex');

    const leaf = keccak256(Buffer.concat([userIDBuf, issuerIDBuf, hashBuf]));
    return '0x' + leaf.toString('hex');
}

/**
 * Compute Merkle leaf from object
 * @param {Object} credential - Credential object
 * @returns {string} Hex string leaf
 */
function computeMerkleLeafFromCredential(credential) {
    return computeMerkleLeaf(
        credential.userID,
        credential.issuerID,
        credential.credentialHash
    );
}

/**
 * Validate hex string
 * @param {string} hex - Hex string
 * @returns {boolean}
 */
function isValidHex(hex) {
    return /^0x[0-9a-fA-F]+$/.test(hex);
}

module.exports = {
    poseidonHash,
    computeMerkleLeaf,
    computeMerkleLeafFromCredential,
    isValidHex,
};