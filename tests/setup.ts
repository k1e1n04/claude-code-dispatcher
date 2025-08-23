// Test setup file
import { logger } from '../src/logger';

// Silence logger during tests
beforeAll(() => {
  logger.silent = true;
});

afterAll(() => {
  logger.silent = false;
});