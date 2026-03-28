// cli/index.js
const Commands = require('./commands');

async function main() {
    const args = process.argv.slice(2);
    const commands = new Commands();

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🔐 Ed25519 Key Generation Tool (with crypto-js encryption)

Usage:
  node keyGenerator.js                    # Interactive mode
  node keyGenerator.js --generate noble   # Generate noble key (non-interactive)
  node keyGenerator.js --generate nacl    # Generate nacl key (non-interactive)
  node keyGenerator.js --list             # List all keys
  node keyGenerator.js --active <keyId>   # Set active key
  node keyGenerator.js --export <keyId>   # Export public key
  node keyGenerator.js --load             # Load and verify a key (interactive)

Environment variables:
  KEY_PASSWORD - Password for encryption (for non-interactive mode)

Encryption Details:
  - Algorithm: AES-256-CBC
  - Authentication: HMAC-SHA256
  - Key Derivation: PBKDF2 with 100,000 iterations
  - Salt: 32 bytes random
  - IV: 16 bytes random

Security Notes:
  - Store your password securely (password manager recommended)
  - Keys are encrypted at rest
  - Use environment variables for CI/CD pipelines
  - Never commit encrypted keys without proper access controls
        `);
        return;
    }

    try {
        if (args.includes('--generate')) {
            const library = args[args.indexOf('--generate') + 1] || 'noble';
            const password = process.env.KEY_PASSWORD;

            if (!password) {
                console.error('Error: KEY_PASSWORD environment variable is required for non-interactive mode');
                console.error('Usage: KEY_PASSWORD=your-password node keyGenerator.js --generate noble');
                process.exit(1);
            }

            await commands.generateNonInteractive(library, password);
        } else if (args.includes('--list')) {
            await commands.listKeys();
        } else if (args.includes('--active')) {
            const keyId = args[args.indexOf('--active') + 1];
            if (!keyId) {
                console.error('Error: keyId is required');
                process.exit(1);
            }
            await commands.setActiveKey(keyId);
        } else if (args.includes('--export')) {
            const keyId = args[args.indexOf('--export') + 1];
            await commands.exportKey(keyId);
        } else if (args.includes('--load')) {
            const password = process.env.KEY_PASSWORD;
            if (!password) {
                console.error('Error: KEY_PASSWORD environment variable is required');
                process.exit(1);
            }
            await commands.loadAndVerify(password);
        } else {
            await commands.generateInteractive();
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };