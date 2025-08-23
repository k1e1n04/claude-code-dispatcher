// Test setup file
import { logger } from '../src/utils/logger';

// Silence logger during tests
beforeAll(() => {
  logger.silent = true;
});

afterAll(() => {
  logger.silent = false;
});