// cli/prompts.js
const readline = require('readline');

require('dotenv').config();


class Prompts {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    question(query) {
        return new Promise((resolve) => this.rl.question(query, resolve));
    }

    async selectLibrary() {
        console.log('\nSelect signing library:');
        console.log('  1. @noble/ed25519 (recommended - pure JS, audited)');
        console.log('  2. tweetnacl (battle-tested, widely used)');

        const choice = await this.question('Enter choice (1 or 2): ');
        return choice === '2' ? 'nacl' : 'noble';
    }

    async getPassword(requireConfirm = true) {
        // First, check if password exists in .env
        let password = process.env.KEY_PASSWORD || 'vishnusks';

        // If password is already set in .env, use it without prompting
        if (password && password.length >= 8) {
            console.log('✅ Using KEY_PASSWORD from environment');
            return password;
        } else {
            console.log('✅invalid password');

            return null;
        }



    }

    async confirm(message, defaultValue = true) {
        const defaultStr = defaultValue ? 'Y/n' : 'y/N';
        const answer = await this.question(`${message} (${defaultStr}): `);

        if (answer === '') return defaultValue;
        return answer.toLowerCase() === 'y';
    }

    async selectKeyFromList(keys) {
        if (keys.length === 0) {
            return null;
        }

        console.log('\nAvailable keys:');
        keys.forEach((key, index) => {
            const active = key.isActive ? ' (active)' : '';
            console.log(`  ${index + 1}. ${key.name}${active} (${Math.round(key.size / 1024)} KB)`);
        });

        const choice = await this.question('\nSelect key number: ');
        const index = parseInt(choice) - 1;

        if (index >= 0 && index < keys.length) {
            return keys[index];
        }

        return null;
    }

    close() {
        this.rl.close();
    }
}

module.exports = { Prompts, getPassword };