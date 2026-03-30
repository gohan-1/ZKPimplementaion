const path = require('path');

module.exports = {
    // Default directories
    defaultKeysDir: './Project_v1/keys',  // This is relative to project root

    // Or use absolute path
    // defaultKeysDir: path.join(__dirname, '../keys'),

    // Encryption settings
    encryptionAlgorithm: 'aes-256-cbc',
    pbkdf2Iterations: 100000,
    keySize: 256,
    hmacAlgorithm: 'sha256',

    // File names
    keyFiles: {
        noble: 'noble_keys.enc',
        nacl: 'nacl_keys.enc',
        active: 'active_key.json'
    },

    // Supported libraries
    supportedLibraries: ['noble', 'nacl'],

    // Default library
    defaultLibrary: 'noble',

    // Password requirements
    minPasswordLength: 8,

    // Key version
    keyVersion: '1.0'
};