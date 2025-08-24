import winston from 'winston';
import { RateLimitError } from '../clients';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'claude-code-dispatcher' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
          }
          return msg;
        })
      ),
    }),
  ],
});

function isNonRetryableError(err: unknown): err is { nonRetryable: true } {
  return (
    !!err &&
    typeof err === 'object' &&
    'nonRetryable' in err &&
    (err as { nonRetryable?: unknown }).nonRetryable === true
  );
}

export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(
          `Attempting ${operationName} (attempt ${attempt}/${maxRetries})`
        );
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // If it's a rate limit error, don't retry - let it bubble up
        if (error instanceof RateLimitError) {
          logger.info(`${operationName} hit rate limit, bubbling up to dispatcher...`);
          throw error;
        }
        
        // If the operation provided a nonRetryable flag, stop retrying immediately
        if (isNonRetryableError(lastError)) {
          logger.error(
            `${operationName} failed with non-retryable error: ${lastError}`
          );
          throw lastError;
        }
        logger.warn(`${operationName} failed on attempt ${attempt}: ${error}`);

        if (attempt === maxRetries) {
          logger.error(`${operationName} failed after ${maxRetries} attempts`);
          throw lastError;
        }

        const delay = delayMs * Math.pow(2, attempt - 1);
        logger.info(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}
