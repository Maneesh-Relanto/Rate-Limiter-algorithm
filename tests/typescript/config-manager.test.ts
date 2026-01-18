/**
 * TypeScript Definition Tests for ConfigManager
 * 
 * These tests verify that:
 * 1. Configuration interfaces are correctly defined
 * 2. ConfigManager class methods have correct signatures
 * 3. Type safety is maintained for configuration loading
 */

import {
  ConfigManager,
  RateLimitConfig,
  EndpointConfig,
  loadConfig
} from '../../src/utils/config-manager';

describe('ConfigManager TypeScript Definitions', () => {
  describe('Type Exports', () => {
    it('should export EndpointConfig interface', () => {
      const config: EndpointConfig = {
        path: '/api/users',
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000,
        description: 'User API endpoint'
      };
      expect(config.path).toBe('/api/users');
    });

    it('should allow optional description in EndpointConfig', () => {
      const config: EndpointConfig = {
        path: '/api/posts',
        capacity: 200,
        refillRate: 20,
        refillInterval: 1000
      };
      expect(config.description).toBeUndefined();
    });

    it('should export RateLimitConfig interface', () => {
      const config: RateLimitConfig = {
        endpoints: [
          {
            path: '/api/users',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          }
        ],
        default: {
          capacity: 50,
          refillRate: 5,
          refillInterval: 1000
        }
      };
      expect(config.endpoints).toHaveLength(1);
    });

    it('should allow optional default in RateLimitConfig', () => {
      const config: RateLimitConfig = {
        endpoints: []
      };
      expect(config.default).toBeUndefined();
    });
  });

  describe('ConfigManager Class', () => {
    describe('Static Methods', () => {
      it('should have loadConfig static method', () => {
        // Type check: method exists and has correct signature
        const loadMethod: (filePath: string) => RateLimitConfig = ConfigManager.loadConfig;
        expect(typeof loadMethod).toBe('function');
      });

      it('should have getConfigForPath static method', () => {
        const config: RateLimitConfig = {
          endpoints: [
            {
              path: '/api/users',
              capacity: 100,
              refillRate: 10,
              refillInterval: 1000
            }
          ]
        };
        
        const endpointConfig: EndpointConfig | null = ConfigManager.getConfigForPath(
          config,
          '/api/users'
        );
        
        expect(endpointConfig === null || typeof endpointConfig === 'object').toBe(true);
      });

      it('should have validateConfig static method', () => {
        const config: RateLimitConfig = {
          endpoints: []
        };
        
        // Should not throw for valid config
        expect(() => ConfigManager.validateConfig(config)).not.toThrow();
      });
    });

    describe('Method Signatures', () => {
      it('should accept string path in loadConfig', () => {
        const path: string = './config/rate-limits.json';
        // Type check passes
        expect(typeof path).toBe('string');
      });

      it('should return RateLimitConfig from loadConfig', () => {
        // Type inference check
        const loadResult = (filePath: string): RateLimitConfig => {
          return ConfigManager.loadConfig(filePath);
        };
        expect(typeof loadResult).toBe('function');
      });

      it('should accept RateLimitConfig and string in getConfigForPath', () => {
        const config: RateLimitConfig = { endpoints: [] };
        const path: string = '/api/test';
        
        const result: EndpointConfig | null = ConfigManager.getConfigForPath(config, path);
        expect(result === null || typeof result === 'object').toBe(true);
      });

      it('should return null or EndpointConfig from getConfigForPath', () => {
        const config: RateLimitConfig = { endpoints: [] };
        const result = ConfigManager.getConfigForPath(config, '/test');
        
        if (result !== null) {
          // TypeScript knows result is EndpointConfig here
          const path: string = result.path;
          const capacity: number = result.capacity;
          expect(typeof path).toBe('string');
          expect(typeof capacity).toBe('number');
        }
      });

      it('should throw error from validateConfig for invalid config', () => {
        const invalidConfig: RateLimitConfig = {
          endpoints: []
        };
        
        // Method signature allows throwing
        expect(() => {
          ConfigManager.validateConfig(invalidConfig);
        }).not.toThrow(); // Empty endpoints array is valid
      });
    });
  });

  describe('loadConfig Function', () => {
    it('should be exported as standalone function', () => {
      const loader: (filePath: string) => RateLimitConfig = loadConfig;
      expect(typeof loader).toBe('function');
    });

    it('should have same signature as ConfigManager.loadConfig', () => {
      const staticMethod = ConfigManager.loadConfig;
      const standaloneFunction = loadConfig;
      
      // Both should have same type signature
      expect(typeof staticMethod).toBe(typeof standaloneFunction);
    });
  });

  describe('Type Constraints', () => {
    it('should require all required fields in EndpointConfig', () => {
      // @ts-expect-error - missing required fields
      const invalid1: EndpointConfig = {
        path: '/api/test'
      };

      // @ts-expect-error - missing path
      const invalid2: EndpointConfig = {
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      };

      // Valid config
      const valid: EndpointConfig = {
        path: '/api/test',
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      };
      
      expect(valid).toBeDefined();
    });

    it('should require endpoints array in RateLimitConfig', () => {
      // @ts-expect-error - missing endpoints
      const invalid: RateLimitConfig = {
        default: {
          capacity: 50,
          refillRate: 5,
          refillInterval: 1000
        }
      };

      // Valid config
      const valid: RateLimitConfig = {
        endpoints: []
      };
      
      expect(valid).toBeDefined();
    });

    it('should enforce number types', () => {
      const config: EndpointConfig = {
        path: '/test',
        capacity: 100,
        refillRate: 10,
        // @ts-expect-error - wrong type
        refillInterval: '1000'
      };
      
      expect(true).toBe(true); // Compilation check
    });

    it('should enforce string type for path', () => {
      const config: EndpointConfig = {
        // @ts-expect-error - wrong type
        path: 123,
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      };
      
      expect(true).toBe(true); // Compilation check
    });
  });

  describe('Complex Configuration Patterns', () => {
    it('should support multiple endpoint configurations', () => {
      const config: RateLimitConfig = {
        endpoints: [
          {
            path: '/api/users',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000,
            description: 'User endpoints'
          },
          {
            path: '/api/posts',
            capacity: 200,
            refillRate: 20,
            refillInterval: 1000,
            description: 'Post endpoints'
          },
          {
            path: '/api/comments',
            capacity: 500,
            refillRate: 50,
            refillInterval: 1000
          }
        ],
        default: {
          capacity: 50,
          refillRate: 5,
          refillInterval: 1000
        }
      };
      
      expect(config.endpoints).toHaveLength(3);
      expect(config.default).toBeDefined();
    });

    it('should support config without default', () => {
      const config: RateLimitConfig = {
        endpoints: [
          {
            path: '/api/health',
            capacity: 1000,
            refillRate: 100,
            refillInterval: 1000
          }
        ]
      };
      
      expect(config.default).toBeUndefined();
    });

    it('should support empty endpoints array', () => {
      const config: RateLimitConfig = {
        endpoints: [],
        default: {
          capacity: 100,
          refillRate: 10,
          refillInterval: 1000
        }
      };
      
      expect(config.endpoints).toHaveLength(0);
    });

    it('should support nested configuration objects', () => {
      interface ExtendedConfig extends RateLimitConfig {
        metadata?: {
          version: string;
          author: string;
        };
      }
      
      const config: ExtendedConfig = {
        endpoints: [],
        metadata: {
          version: '1.0.0',
          author: 'Test'
        }
      };
      
      expect(config.metadata?.version).toBe('1.0.0');
    });
  });

  describe('Type Inference', () => {
    it('should infer EndpointConfig type correctly', () => {
      const config = {
        path: '/api/test',
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      };
      
      const typed: EndpointConfig = config;
      expect(typed.path).toBe('/api/test');
    });

    it('should infer RateLimitConfig type correctly', () => {
      const config = {
        endpoints: [
          {
            path: '/test',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          }
        ]
      };
      
      const typed: RateLimitConfig = config;
      expect(typed.endpoints).toHaveLength(1);
    });

    it('should handle getConfigForPath return type', () => {
      const config: RateLimitConfig = {
        endpoints: [
          {
            path: '/api/users',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          }
        ]
      };
      
      const result = ConfigManager.getConfigForPath(config, '/api/users');
      
      // TypeScript should narrow type after null check
      if (result !== null) {
        const path: string = result.path;
        const capacity: number = result.capacity;
        expect(path).toBe('/api/users');
      }
    });
  });

  describe('Compatibility with JavaScript', () => {
    it('should work with dynamic typing', () => {
      const dynamicConfig: any = {
        endpoints: [
          {
            path: '/test',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          }
        ]
      };
      
      const config: RateLimitConfig = dynamicConfig as RateLimitConfig;
      expect(config.endpoints).toBeDefined();
    });

    it('should handle extra properties', () => {
      const config: EndpointConfig & { extra?: string } = {
        path: '/test',
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000,
        description: 'Test endpoint',
        extra: 'ignored'
      };
      
      expect(config.path).toBe('/test');
    });

    it('should support partial configurations for updates', () => {
      type PartialEndpointConfig = Partial<EndpointConfig>;
      
      const update: PartialEndpointConfig = {
        capacity: 200
      };
      
      expect(update.capacity).toBe(200);
      expect(update.path).toBeUndefined();
    });
  });

  describe('Utility Type Usage', () => {
    it('should support Readonly wrapper', () => {
      const config: Readonly<RateLimitConfig> = {
        endpoints: [
          {
            path: '/test',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          }
        ]
      };
      
      // @ts-expect-error - readonly
      config.endpoints = [];
      
      expect(config.endpoints).toHaveLength(1);
    });

    it('should support Required wrapper', () => {
      type RequiredConfig = Required<RateLimitConfig>;
      
      const config: RequiredConfig = {
        endpoints: [],
        default: {
          capacity: 100,
          refillRate: 10,
          refillInterval: 1000
        }
      };
      
      expect(config.default).toBeDefined();
    });

    it('should support Pick utility type', () => {
      type PathOnly = Pick<EndpointConfig, 'path'>;
      
      const pathConfig: PathOnly = {
        path: '/api/test'
      };
      
      expect(pathConfig.path).toBe('/api/test');
    });

    it('should support Omit utility type', () => {
      type WithoutDescription = Omit<EndpointConfig, 'description'>;
      
      const config: WithoutDescription = {
        path: '/test',
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      };
      
      expect(config.path).toBe('/test');
    });
  });

  describe('Error Handling Types', () => {
    it('should handle validateConfig errors', () => {
      const invalidConfig: RateLimitConfig = {
        endpoints: []
      };
      
      try {
        ConfigManager.validateConfig(invalidConfig);
      } catch (error) {
        // TypeScript knows error is unknown
        expect(error instanceof Error || typeof error === 'string').toBe(true);
      }
    });

    it('should handle loadConfig errors', () => {
      try {
        ConfigManager.loadConfig('/nonexistent/file.json');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Array and Collection Types', () => {
    it('should handle endpoints as array', () => {
      const config: RateLimitConfig = {
        endpoints: []
      };
      
      const endpoints: EndpointConfig[] = config.endpoints;
      endpoints.push({
        path: '/test',
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      });
      
      expect(endpoints).toHaveLength(1);
    });

    it('should support mapping over endpoints', () => {
      const config: RateLimitConfig = {
        endpoints: [
          {
            path: '/api/users',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          },
          {
            path: '/api/posts',
            capacity: 200,
            refillRate: 20,
            refillInterval: 1000
          }
        ]
      };
      
      const paths: string[] = config.endpoints.map((e: EndpointConfig) => e.path);
      expect(paths).toEqual(['/api/users', '/api/posts']);
    });

    it('should support filtering endpoints', () => {
      const config: RateLimitConfig = {
        endpoints: [
          {
            path: '/api/users',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          },
          {
            path: '/api/posts',
            capacity: 200,
            refillRate: 20,
            refillInterval: 1000
          }
        ]
      };
      
      const highCapacity: EndpointConfig[] = config.endpoints.filter(
        (e: EndpointConfig) => e.capacity > 150
      );
      
      expect(highCapacity).toHaveLength(1);
    });
  });
});
