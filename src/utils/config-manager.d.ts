/// <reference types="node" />

/**
 * Rate limit configuration for a specific tier/endpoint
 */
export interface RateLimitConfigItem {
  /** Maximum number of tokens */
  capacity: number;
  /** Tokens added per second */
  refillRate: number;
  /** Cost per request (default: 1) */
  cost?: number;
  /** Optional description */
  description?: string;
}

/**
 * Environment-specific multipliers
 */
export interface EnvironmentConfig {
  /** Rate limit multiplier for this environment */
  multiplier: number;
}

/**
 * Complete rate limiting configuration structure
 */
export interface RateLimitConfig {
  /** Nested rate limit configurations */
  rateLimits: {
    [key: string]: RateLimitConfigItem | { [key: string]: RateLimitConfigItem };
  };
  /** Environment-specific settings */
  environment: {
    development?: EnvironmentConfig;
    staging?: EnvironmentConfig;
    production?: EnvironmentConfig;
    [key: string]: EnvironmentConfig | undefined;
  };
}

/**
 * Options for ConfigManager constructor
 */
export interface ConfigManagerOptions {
  /** Path to configuration file */
  configPath?: string;
}

/**
 * Configuration manager for loading and managing rate limit configs
 * 
 * @example
 * ```typescript
 * import { ConfigManager, getConfigManager } from '@rate-limiter/core';
 * 
 * const manager = new ConfigManager('./config/rate-limits.json');
 * const config = manager.getRateLimit('api.free');
 * ```
 */
export class ConfigManager {
  /** Path to configuration file */
  configPath: string;
  /** Loaded configuration */
  config: RateLimitConfig;
  /** Current environment */
  environment: string;

  /**
   * Create a new ConfigManager instance
   * @param configPath - Optional path to configuration file
   */
  constructor(configPath?: string);

  /**
   * Get rate limit configuration by name/path
   * @param name - Configuration name (e.g., 'api.free', 'authentication.login')
   * @returns Rate limit configuration
   */
  getRateLimit(name: string): RateLimitConfigItem;

  /**
   * Get rate limit from environment variable
   * @param envVar - Environment variable prefix
   * @param fallbackConfig - Fallback config name if env var not set
   * @returns Rate limit configuration
   */
  getRateLimitFromEnv(envVar: string, fallbackConfig?: string): RateLimitConfigItem;

  /**
   * List all available configurations
   * @returns List of configuration names and descriptions
   */
  listConfigurations(): Array<{
    name: string;
    capacity: number;
    refillRate: number;
    cost: number;
    description?: string;
  }>;

  /**
   * Set environment (for testing purposes)
   * @param env - Environment name ('development', 'staging', 'production')
   */
  setEnvironment(env: string): void;

  /**
   * Reload configuration from file
   */
  reload(): void;

  /**
   * Get raw configuration object
   * @returns Full configuration
   */
  getRawConfig(): RateLimitConfig;
}

/**
 * Get or create ConfigManager singleton instance
 * @param configPath - Optional custom config path
 * @returns ConfigManager instance
 */
export function getConfigManager(configPath?: string): ConfigManager;
