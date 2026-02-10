import winston from 'winston';

export function createLogger(serviceName: string, jsonLogs = true): winston.Logger {
  const format = jsonLogs
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
      );

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format,
    defaultMeta: { service: serviceName },
    transports: [new winston.transports.Console()],
  });
}

