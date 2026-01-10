/**
 * Configuration Manager for Rate Limiting
 * 
 * Loads and manages rate limit configurations from multiple sources:
 * - JSON configuration files
 * - Environment variables
 * - Runtime overrides
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '..', '..', 'config', 'rate-limits.json');
    this.config = this._loadConfig();
    this.environment = process.env.NODE_ENV || 'production';
  }

  /**
   * Load configuration from file
   * @private
   */
  _loadConfig() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(`Warning: Could not load config from ${this.configPath}, using defaults`);
      return this._getDefaultConfig();
    }
  }

  /**
   * Get default configuration if file not found
   * @private
   */
  _getDefaultConfig() {
    return {
      rateLimits: {
        default: {
          capacity: 100,
          refillRate: 10,
          description: 'Default rate limit'
        }
      },
      environment: {
        development: { multiplier: 2.0 },
        staging: { multiplier: 1.5 },
        production: { multiplier: 1.0 }
      }
    };
  }

  /**
   * Get rate limit configuration by name/path
   * 
   * @param {string} name - Configuration name (e.g., 'api.free', 'authentication.login')
   * @returns {Object} Rate limit configuration
   * 
   * @example
   * const config = manager.getRateLimit('api.free');
   * // Returns: { capacity: 100, refillRate: 1.67, description: '...' }
   */
  getRateLimit(name) {
    // Support dot notation (e.g., 'api.free')
    const parts = name.split('.');
    let config = this.config.rateLimits;

    for (const part of parts) {
      if (!config[part]) {
        console.warn(`Rate limit config '${name}' not found, using default`);
        return this.getRateLimit('default');
      }
      config = config[part];
    }

    // Apply environment multiplier
    const envMultiplier = this._getEnvironmentMultiplier();
    
    return {
      capacity: Math.ceil(config.capacity * envMultiplier),
      refillRate: config.refillRate * envMultiplier,
      cost: config.cost || 1,
      description: config.description
    };
  }

  /**
   * Get environment-specific multiplier
   * @private
   */
  _getEnvironmentMultiplier() {
    const envConfig = this.config.environment[this.environment];
    return envConfig ? envConfig.multiplier : 1.0;
  }

  /**
   * Get rate limit from environment variable
   * 
   * @param {string} envVar - Environment variable name
   * @param {string} fallbackConfig - Fallback config name if env var not set
   * @returns {Object} Rate limit configuration
   * 
   * @example
   * // Set: RATE_LIMIT_CAPACITY=200 RATE_LIMIT_REFILL=20
   * const config = manager.getRateLimitFromEnv('RATE_LIMIT');
   */
  getRateLimitFromEnv(envVar, fallbackConfig = 'default') {
    const capacityVar = `${envVar}_CAPACITY`;
    const refillVar = `${envVar}_REFILL`;
    const costVar = `${envVar}_COST`;

    if (process.env[capacityVar] && process.env[refillVar]) {
      return {
        capacity: parseInt(process.env[capacityVar], 10),
        refillRate: parseFloat(process.env[refillVar]),
        cost: parseInt(process.env[costVar] || '1', 10),
        description: `Environment variable: ${envVar}`
      };
    }

    return this.getRateLimit(fallbackConfig);
  }

  /**
   * List all available configurations
   * 
   * @returns {Array} List of configuration names and descriptions
   */
  listConfigurations() {
    const configs = [];
    
    const traverse = (obj, prefix = '') => {
      for (const key in obj) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        
        if (obj[key].capacity !== undefined) {
          configs.push({
            name: fullPath,
            capacity: obj[key].capacity,
            refillRate: obj[key].refillRate,
            cost: obj[key].cost || 1,
            description: obj[key].description
          });
        } else if (typeof obj[key] === 'object') {
          traverse(obj[key], fullPath);
        }
      }
    };

    traverse(this.config.rateLimits);
    return configs;
  }

  /**
   * Set environment (for testing purposes)
   * 
   * @param {string} env - Environment name ('development', 'staging', 'production')
   */
  setEnvironment(env) {
    this.environment = env;
  }

  /**
   * Reload configuration from file
   */
  reload() {
    this.config = this._loadConfig();
  }

  /**
   * Get raw configuration object
   * @returns {Object} Full configuration
   */
  getRawConfig() {
    return { ...this.config };
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create ConfigManager instance
 * 
 * @param {string} configPath - Optional custom config path
 * @returns {ConfigManager} ConfigManager instance
 */
function getConfigManager(configPath = null) {
  if (!instance || configPath) {
    instance = new ConfigManager(configPath);
  }
  return instance;
}

module.exports = {
  ConfigManager,
  getConfigManager
};
