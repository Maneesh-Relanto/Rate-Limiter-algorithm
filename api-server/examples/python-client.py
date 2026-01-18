"""
Rate Limiter API - Python Client Example
Demonstrates how to use the Rate Limiter API from Python applications
"""

import requests
import time
from typing import Dict, Optional

class RateLimiterClient:
    """Python client for Rate Limiter API"""
    
    def __init__(self, base_url: str = "http://localhost:8080"):
        """
        Initialize the Rate Limiter client
        
        Args:
            base_url: Base URL of the Rate Limiter API server
        """
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
    
    def health_check(self) -> Dict:
        """Check API health"""
        response = self.session.get(f"{self.base_url}/api/health")
        return response.json()
    
    def get_metrics(self) -> Dict:
        """Get system metrics"""
        response = self.session.get(f"{self.base_url}/api/metrics")
        return response.json()
    
    def check_rate_limit(self, key: str, capacity: int = 100, refill_rate: int = 10) -> Dict:
        """
        Check if request is allowed by rate limiter
        
        Args:
            key: Unique identifier for the limiter (user ID, API key, etc.)
            capacity: Maximum number of tokens
            refill_rate: Tokens refilled per second
            
        Returns:
            Response with allowed status and remaining tokens
        """
        response = self.session.post(
            f"{self.base_url}/api/v1/limiter/check",
            json={
                "key": key,
                "capacity": capacity,
                "refillRate": refill_rate
            }
        )
        return response.json()
    
    def apply_penalty(self, key: str, points: int) -> Dict:
        """
        Apply penalty to a limiter (remove tokens)
        
        Args:
            key: Unique identifier for the limiter
            points: Number of tokens to remove
            
        Returns:
            Response with penalty details
        """
        response = self.session.post(
            f"{self.base_url}/api/v1/limiter/penalty",
            json={"key": key, "points": points}
        )
        return response.json()
    
    def apply_reward(self, key: str, points: int) -> Dict:
        """
        Apply reward to a limiter (add tokens)
        
        Args:
            key: Unique identifier for the limiter
            points: Number of tokens to add
            
        Returns:
            Response with reward details
        """
        response = self.session.post(
            f"{self.base_url}/api/v1/limiter/reward",
            json={"key": key, "points": points}
        )
        return response.json()
    
    def block_key(self, key: str, duration: int) -> Dict:
        """
        Block a key for specified duration
        
        Args:
            key: Unique identifier to block
            duration: Block duration in milliseconds
            
        Returns:
            Response with block details
        """
        response = self.session.post(
            f"{self.base_url}/api/v1/limiter/block",
            json={"key": key, "duration": duration}
        )
        return response.json()
    
    def unblock_key(self, key: str) -> Dict:
        """
        Unblock a previously blocked key
        
        Args:
            key: Unique identifier to unblock
            
        Returns:
            Response with unblock status
        """
        response = self.session.post(
            f"{self.base_url}/api/v1/limiter/unblock",
            json={"key": key}
        )
        return response.json()
    
    def get_status(self, key: str) -> Dict:
        """
        Get current status of a limiter
        
        Args:
            key: Unique identifier for the limiter
            
        Returns:
            Response with limiter status
        """
        response = self.session.get(f"{self.base_url}/api/v1/limiter/status/{key}")
        return response.json()
    
    def reset_limiter(self, key: str) -> Dict:
        """
        Reset a limiter to full capacity
        
        Args:
            key: Unique identifier for the limiter
            
        Returns:
            Response with reset status
        """
        response = self.session.post(f"{self.base_url}/api/v1/limiter/reset/{key}")
        return response.json()
    
    def delete_limiter(self, key: str) -> Dict:
        """
        Delete a limiter
        
        Args:
            key: Unique identifier for the limiter
            
        Returns:
            Response with deletion status
        """
        response = self.session.delete(f"{self.base_url}/api/v1/limiter/{key}")
        return response.json()
    
    def list_limiters(self) -> Dict:
        """
        List all active limiters
        
        Returns:
            Response with list of limiters
        """
        response = self.session.get(f"{self.base_url}/api/v1/limiters")
        return response.json()


# Example Usage
if __name__ == "__main__":
    # Initialize client
    client = RateLimiterClient("http://localhost:8080")
    
    print("=" * 60)
    print("Rate Limiter API - Python Client Demo")
    print("=" * 60)
    print()
    
    # 1. Health check
    print("1. Health Check")
    health = client.health_check()
    print(f"Status: {health['status']}")
    print(f"Active Limiters: {health['activeLimiters']}")
    print()
    
    # 2. Check rate limit
    print("2. Check Rate Limit for user-python-123")
    result = client.check_rate_limit("user-python-123", capacity=10, refill_rate=2)
    print(f"Allowed: {result['allowed']}")
    print(f"Tokens: {result['tokens']}/{result['capacity']}")
    print()
    
    # 3. Get status
    print("3. Get Limiter Status")
    status = client.get_status("user-python-123")
    print(f"Key: {status['key']}")
    print(f"Tokens: {status['tokens']}")
    print(f"Blocked: {status['isBlocked']}")
    print()
    
    # 4. Apply penalty
    print("4. Apply Penalty (Bad Behavior)")
    penalty = client.apply_penalty("user-python-123", points=3)
    print(f"Penalty Applied: {penalty['penaltyApplied']}")
    print(f"Remaining Tokens: {penalty['remainingTokens']}")
    print()
    
    # 5. Apply reward
    print("5. Apply Reward (Good Behavior)")
    reward = client.apply_reward("user-python-123", points=2)
    print(f"Reward Applied: {reward['rewardApplied']}")
    print(f"Remaining Tokens: {reward['remainingTokens']}")
    print()
    
    # 6. Block a key
    print("6. Block Spammer")
    block = client.block_key("spammer-python-456", duration=30000)
    print(f"Blocked: {block['blocked']}")
    print(f"Blocked Until: {block['blockedUntil']}")
    print()
    
    # 7. Try to use blocked key
    print("7. Try to Use Blocked Key")
    blocked_result = client.check_rate_limit("spammer-python-456")
    print(f"Allowed: {blocked_result['allowed']}")
    print(f"Reason: {blocked_result.get('reason', 'N/A')}")
    print()
    
    # 8. Unblock the key
    print("8. Unblock Key")
    unblock = client.unblock_key("spammer-python-456")
    print(f"Unblocked: {unblock['unblocked']}")
    print()
    
    # 9. Rate limit exhaustion demo
    print("9. Rate Limit Exhaustion Demo")
    print("Making 12 requests with capacity=5...")
    for i in range(1, 13):
        result = client.check_rate_limit("demo-python-user", capacity=5, refill_rate=1)
        status_emoji = "✓" if result['allowed'] else "✗"
        print(f"  Request #{i}: {status_emoji} Allowed={result['allowed']}, Tokens={result.get('tokens', 0)}")
        time.sleep(0.1)  # Small delay between requests
    print()
    
    # 10. Reset limiter
    print("10. Reset Limiter")
    reset = client.reset_limiter("demo-python-user")
    print(f"Reset: {reset['reset']}")
    print()
    
    # 11. List all limiters
    print("11. List All Limiters")
    limiters = client.list_limiters()
    print(f"Total Limiters: {limiters['count']}")
    for limiter in limiters['limiters'][:5]:  # Show first 5
        print(f"  - {limiter['key']}: {limiter['tokens']}/{limiter['capacity']} tokens")
    print()
    
    # 12. Get metrics
    print("12. System Metrics")
    metrics = client.get_metrics()
    print(f"Total Requests: {metrics['totalRequests']}")
    print(f"Allowed: {metrics['allowedRequests']}")
    print(f"Blocked: {metrics['blockedRequests']}")
    print(f"Success Rate: {metrics['successRate']:.1f}%")
    print()
    
    # 13. Cleanup
    print("13. Cleanup - Delete Test Limiters")
    for key in ["user-python-123", "demo-python-user", "spammer-python-456"]:
        client.delete_limiter(key)
        print(f"  Deleted: {key}")
    print()
    
    print("=" * 60)
    print("Demo completed successfully!")
    print("=" * 60)
