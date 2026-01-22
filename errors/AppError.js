/**
 * Application Error Classes
 * Typed error hierarchy for better error handling and debugging
 */

/**
 * Base application error class
 * All custom errors extend from this class
 */
export class AppError extends Error {
  /**
   * Creates an AppError instance
   * @param {string} message - Error message
   * @param {string} code - Error code for programmatic handling
   * @param {Object} [details] - Additional error details
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to JSON for serialization (e.g., over IPC)
   * @returns {Object} Serializable error object
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * ValidationError - Thrown when input validation fails
 * Used for invalid user input or malformed data
 */
export class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

/**
 * ConnectionError - Thrown when Roon Core connection fails
 * Used for network issues, Core unavailable, pairing problems
 */
export class ConnectionError extends AppError {
  constructor(message, details = {}) {
    super(message, 'CONNECTION_ERROR', details);
  }
}

/**
 * ApiError - Thrown when Roon API operations fail
 * Used for browse failures, transport errors, general API issues
 */
export class ApiError extends AppError {
  constructor(message, details = {}) {
    super(message, 'API_ERROR', details);
  }
}

/**
 * NotFoundError - Thrown when requested resource doesn't exist
 * Used for missing albums, artists, zones, etc.
 */
export class NotFoundError extends AppError {
  constructor(message, details = {}) {
    super(message, 'NOT_FOUND', details);
  }
}

/**
 * PersistenceError - Thrown when storage operations fail
 * Used for electron-store failures, data corruption
 */
export class PersistenceError extends AppError {
  constructor(message, details = {}) {
    super(message, 'PERSISTENCE_ERROR', details);
  }
}
