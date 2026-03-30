// KeyStorage.js
const fs = require('fs');
const path = require('path');
const config = require('./config');

class KeyStorage {
    constructor(keysDir = null) {
        // Use provided keysDir or default to 'keys' in current working directory

        this.baseDir = keysDir || path.join(process.cwd(), './Project_v1/keys');


        // Ensure directory exists
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    getFilePath(filename) {

        return path.join(this.baseDir, filename);
    }

    save(filename, data) {
        const filePath = this.getFilePath(filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return filePath;
    }

    load(filename) {
        const filePath = this.getFilePath(filename);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    }

    exists(filename) {
        return fs.existsSync(this.getFilePath(filename));
    }

    delete(filename) {
        const filePath = this.getFilePath(filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }

    listFiles(extension = '.enc') {
        if (!fs.existsSync(this.baseDir)) {
            return [];
        }

        const files = fs.readdirSync(this.baseDir);
        return files.filter(f => f.endsWith(extension));
    }

    getFileInfo(filename) {
        const filePath = this.getFilePath(filename);
        if (!fs.existsSync(filePath)) {
            return null;
        }

        const stats = fs.statSync(filePath);
        return {
            name: filename,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
        };
    }

    saveActiveKey(keyId, filename) {
        const activeKey = {
            keyId,
            file: path.basename(filename),
            activatedAt: new Date().toISOString()
        };
        return this.save(config.keyFiles.active, activeKey);
    }

    loadActiveKey() {
        return this.load(config.keyFiles.active);
    }

    getKeyFileForLibrary(library) {
        return config.keyFiles[library];
    }
}

module.exports = KeyStorage;