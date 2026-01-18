/// <reference types="node" />

/**
 * Rate limit configuration for an endpoint
 */
export interface EndpointConfig {
  /** Endpoint path or pattern */
  path: string;
  /** Maximum number of tokens */
  capacity: number;
  /** Tokens added per interval */
  refillRate: number;
  /** Refill interval in milliseconds */
  refillInterval: number;
  /** Optional description */
  description?: string;
}

/**
 * Complete rate limiting configuration
 */
export interface RateLimitConfig {
  /** List of endpoint configurations */
  endpoints: EndpointConfig[];
  /** Default configuration for unlisted endpoints */
  default?: {
    capacity: number;
    refillRate: number;
    refillInterval: number;
  };
}

/**
 * Configuration manager for loading and validating rate limit configs
 * 
 * @example
 * ```typescript
 * import { ConfigManager } from '@rate-limiter/core';
 * 
 * const config = ConfigManager.loadConfig('./config/rate-limits.json');
 * const endpointConfig = config.getConfigForPath('/api/users');
 * ```
 */
export class ConfigManager {
  /**
   * Load configuration from a JSON file
   * @param filePath - Path to configuration file
   * @returns Parsed and validated configuration
   */
  static loadConfig(filePath: string): RateLimitConfig;

  /**
   * Get configuration for a specific path
   * @param config - Complete configuration
   * @param path - Request path
   * @returns Matching endpoint configuration or default
   */
  static getConfigForPath(config: RateLimitConfig, path: string): EndpointConfig | null;

  /**
   * Validate configuration format
   * @param config - Configuration to validate
   * @throws Error if configuration is invalid
   */
  static validateConfig(config: RateLimitConfig): void;
}

/**
 * Load configuration from file
 * @param filePath - Path to configuration file
 * @returns Parsed configuration
 */
export function loadConfig(filePath: string): RateLimitConfig;
