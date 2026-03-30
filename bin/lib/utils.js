const util = require('util');
const readline = require('readline');
const { execSync } = require('child_process');

const exec = util.promisify(require('child_process').exec);

async function runCmd(command) {
    try {
        const { stdout, stderr } = await exec(command);
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
    } catch (error) {
        console.log(error);
    }
}

function hasYarn() {
    try {
        execSync('yarnpkg --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) =>
        rl.question(query, (ans) => {
            rl.close();
            resolve(ans);
        })
    );
}

module.exports = { runCmd, hasYarn, askQuestion };