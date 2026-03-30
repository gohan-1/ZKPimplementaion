const fs = require('fs');
const path = require('path');

function validateArgs() {
    if (process.argv.length < 3) {
        console.log('Please specify the target project directory.');
        process.exit(1);
    }
}

function setupBaseDirectory(appPath, folderName) {
    console.log(`Checking if directory ${appPath} exists...`);

    if (fs.existsSync(appPath)) {
        console.log(`Directory ${folderName} already exists.`);
    } else {
        fs.mkdirSync(appPath);
        console.log(`Created directory: ${appPath}`);
    }
}

function ensureDir(dirPath, label) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created ${label}`);
    } else {
        console.log(`${label} already exists`);
    }
}

async function setupProject(appPath) {
    const dirs = [
        { name: 'ZKPFiles', label: 'ZKPFiles directory' },
        { name: 'tau_files', label: 'TAU Files directory' },
        { name: 'VerifierData', label: 'Verifier Data directory' },
        { name: 'keys', label: 'keys directory' },
    ];

    dirs.forEach((d) =>
        ensureDir(path.join(appPath, d.name), d.label)
    );
}

module.exports = {
    validateArgs,
    setupBaseDirectory,
    setupProject,
};