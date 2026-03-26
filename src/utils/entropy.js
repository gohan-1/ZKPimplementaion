
const crypto = require("crypto");

/**
 * Create a random Entropys
 * @returns string
 */

const entropy = async () => {
    return crypto.randomBytes(32).toString('hex');
};

module.exports = entropy;
