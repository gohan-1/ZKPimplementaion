const fs = require('fs');
const path = require('path');
const { runCmd } = require('./utils');

async function installDependencies(srcPath, useYarn) {
    console.log('Installing dependencies...');
    await runCmd(useYarn ? 'yarn install' : 'npm install');

    fs.copyFileSync(
        path.join(srcPath, '.env.example'),
        path.join(srcPath, '.env')
    );
}

function cleanupFiles(srcPath, useYarn) {
    const files = [
        'CHANGELOG.md',
        'CODE_OF_CONDUCT.md',
        'CONTRIBUTING.md',
    ];

    files.forEach((f) => {
        const full = path.join(srcPath, f);
        if (fs.existsSync(full)) fs.unlinkSync(full);
    });

    if (!useYarn) {
        const lock = path.join(srcPath, 'yarn.lock');
        if (fs.existsSync(lock)) fs.unlinkSync(lock);
    }
}

module.exports = { installDependencies, cleanupFiles };