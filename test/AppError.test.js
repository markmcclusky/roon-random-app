/**
 * Tests for AppError classes
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  ConnectionError,
  ApiError,
  NotFoundError,
  PersistenceError,
} from '../errors/AppError.js';

describe('AppError', () => {
  describe('Base AppError class', () => {
    it('should create error with message and code', () => {
      const error = new AppError('Test error', 'TEST_CODE');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('AppError');
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const error = new AppError('Test', 'CODE');
      const after = Date.now();

      expect(error.timestamp).toBeGreaterThanOrEqual(before);
      expect(error.timestamp).toBeLessThanOrEqual(after);
    });

    it('should support optional details', () => {
      const details = { field: 'username', value: 'invalid' };
      const error = new AppError('Test', 'CODE', details);

      expect(error.details).toEqual(details);
    });

    it('should default to empty object for details', () => {
      const error = new AppError('Test', 'CODE');

      expect(error.details).toEqual({});
    });

    it('should be instance of Error', () => {
      const error = new AppError('Test', 'CODE');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should serialize to JSON', () => {
      const error = new AppError('Test message', 'TEST_CODE', { key: 'value' });
      const json = error.toJSON();

      expect(json.name).toBe('AppError');
      expect(json.message).toBe('Test message');
      expect(json.code).toBe('TEST_CODE');
      expect(json.details).toEqual({ key: 'value' });
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create with VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should extend AppError', () => {
      const error = new ValidationError('Test');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should support details', () => {
      const error = new ValidationError('Invalid', { field: 'email' });

      expect(error.details.field).toBe('email');
    });
  });

  describe('ConnectionError', () => {
    it('should create with CONNECTION_ERROR code', () => {
      const error = new ConnectionError('Connection failed');

      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.name).toBe('ConnectionError');
    });

    it('should extend AppError', () => {
      const error = new ConnectionError('Test');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConnectionError);
    });
  });

  describe('ApiError', () => {
    it('should create with API_ERROR code', () => {
      const error = new ApiError('API request failed');

      expect(error.message).toBe('API request failed');
      expect(error.code).toBe('API_ERROR');
      expect(error.name).toBe('ApiError');
    });

    it('should extend AppError', () => {
      const error = new ApiError('Test');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ApiError);
    });
  });

  describe('NotFoundError', () => {
    it('should create with NOT_FOUND code', () => {
      const error = new NotFoundError('Resource not found');

      expect(error.message).toBe('Resource not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
    });

    it('should extend AppError', () => {
      const error = new NotFoundError('Test');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('PersistenceError', () => {
    it('should create with PERSISTENCE_ERROR code', () => {
      const error = new PersistenceError('Storage failed');

      expect(error.message).toBe('Storage failed');
      expect(error.code).toBe('PERSISTENCE_ERROR');
      expect(error.name).toBe('PersistenceError');
    });

    it('should extend AppError', () => {
      const error = new PersistenceError('Test');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(PersistenceError);
    });
  });

  describe('Error code consistency', () => {
    it('should have unique error codes', () => {
      const errors = [
        new ValidationError('Test'),
        new ConnectionError('Test'),
        new ApiError('Test'),
        new NotFoundError('Test'),
        new PersistenceError('Test'),
      ];

      const codes = errors.map(e => e.code);
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
});
