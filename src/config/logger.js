const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for error stack traces
const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack });
  }
  return info;
});

// Format for file logs (JSON format - good for analysis)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Format for console logs (human-readable)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  enumerateErrorFormat(),
  config.env === 'development' ? winston.format.colorize() : winston.format.uncolorize(),
  winston.format.splat(),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

// Create logger
const logger = winston.createLogger({
  level: config.env === 'development' ? 'debug' : 'info',
  format: fileFormat, // Default format for transports that don't specify their own
  transports: [
    // Console transport (always active)
    new winston.transports.Console({
      format: consoleFormat,
      stderrLevels: ['error'],
    }),
    
    // File transport - Combined logs (all levels)
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: fileFormat,
    }),
    
    // File transport - Error logs only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: fileFormat,
    }),
  ],
});

// Optional: Add a stream for Morgan integration
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;