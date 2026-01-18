import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.util.Map;
import java.util.HashMap;

/**
 * Rate Limiter API - Java Client Example
 * Demonstrates how to use the Rate Limiter API from Java applications
 * 
 * Dependencies (Maven):
 * <dependency>
 *     <groupId>com.google.code.gson</groupId>
 *     <artifactId>gson</artifactId>
 *     <version>2.10.1</version>
 * </dependency>
 */
public class RateLimiterClient {
    
    private final String baseUrl;
    private final HttpClient httpClient;
    private final Gson gson;
    
    /**
     * Initialize the Rate Limiter client
     * 
     * @param baseUrl Base URL of the Rate Limiter API server
     */
    public RateLimiterClient(String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.gson = new Gson();
    }
    
    /**
     * Check API health
     */
    public JsonObject healthCheck() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/health"))
                .GET()
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Get system metrics
     */
    public JsonObject getMetrics() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/metrics"))
                .GET()
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Check if request is allowed by rate limiter
     * 
     * @param key Unique identifier for the limiter
     * @param capacity Maximum number of tokens
     * @param refillRate Tokens refilled per second
     */
    public JsonObject checkRateLimit(String key, int capacity, int refillRate) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("key", key);
        body.put("capacity", capacity);
        body.put("refillRate", refillRate);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/check"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Apply penalty to a limiter (remove tokens)
     * 
     * @param key Unique identifier for the limiter
     * @param points Number of tokens to remove
     */
    public JsonObject applyPenalty(String key, int points) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("key", key);
        body.put("points", points);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/penalty"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Apply reward to a limiter (add tokens)
     * 
     * @param key Unique identifier for the limiter
     * @param points Number of tokens to add
     */
    public JsonObject applyReward(String key, int points) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("key", key);
        body.put("points", points);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/reward"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Block a key for specified duration
     * 
     * @param key Unique identifier to block
     * @param duration Block duration in milliseconds
     */
    public JsonObject blockKey(String key, long duration) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("key", key);
        body.put("duration", duration);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/block"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Unblock a previously blocked key
     * 
     * @param key Unique identifier to unblock
     */
    public JsonObject unblockKey(String key) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("key", key);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/unblock"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Get current status of a limiter
     * 
     * @param key Unique identifier for the limiter
     */
    public JsonObject getStatus(String key) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/status/" + key))
                .GET()
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Reset a limiter to full capacity
     * 
     * @param key Unique identifier for the limiter
     */
    public JsonObject resetLimiter(String key) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/reset/" + key))
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Delete a limiter
     * 
     * @param key Unique identifier for the limiter
     */
    public JsonObject deleteLimiter(String key) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiter/" + key))
                .DELETE()
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * List all active limiters
     */
    public JsonObject listLimiters() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/v1/limiters"))
                .GET()
                .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return gson.fromJson(response.body(), JsonObject.class);
    }
    
    /**
     * Example usage
     */
    public static void main(String[] args) {
        try {
            // Initialize client
            RateLimiterClient client = new RateLimiterClient("http://localhost:8080");
            
            System.out.println("============================================================");
            System.out.println("Rate Limiter API - Java Client Demo");
            System.out.println("============================================================");
            System.out.println();
            
            // 1. Health check
            System.out.println("1. Health Check");
            JsonObject health = client.healthCheck();
            System.out.println("Status: " + health.get("status").getAsString());
            System.out.println("Active Limiters: " + health.get("activeLimiters").getAsInt());
            System.out.println();
            
            // 2. Check rate limit
            System.out.println("2. Check Rate Limit for user-java-123");
            JsonObject result = client.checkRateLimit("user-java-123", 10, 2);
            System.out.println("Allowed: " + result.get("allowed").getAsBoolean());
            System.out.println("Tokens: " + result.get("tokens").getAsDouble() + "/" + result.get("capacity").getAsInt());
            System.out.println();
            
            // 3. Get status
            System.out.println("3. Get Limiter Status");
            JsonObject status = client.getStatus("user-java-123");
            System.out.println("Key: " + status.get("key").getAsString());
            System.out.println("Tokens: " + status.get("tokens").getAsDouble());
            System.out.println("Blocked: " + status.get("isBlocked").getAsBoolean());
            System.out.println();
            
            // 4. Apply penalty
            System.out.println("4. Apply Penalty (Bad Behavior)");
            JsonObject penalty = client.applyPenalty("user-java-123", 3);
            System.out.println("Penalty Applied: " + penalty.get("penaltyApplied").getAsInt());
            System.out.println("Remaining Tokens: " + penalty.get("remainingTokens").getAsDouble());
            System.out.println();
            
            // 5. Apply reward
            System.out.println("5. Apply Reward (Good Behavior)");
            JsonObject reward = client.applyReward("user-java-123", 2);
            System.out.println("Reward Applied: " + reward.get("rewardApplied").getAsInt());
            System.out.println("Remaining Tokens: " + reward.get("remainingTokens").getAsDouble());
            System.out.println();
            
            // 6. Block a key
            System.out.println("6. Block Spammer");
            JsonObject block = client.blockKey("spammer-java-456", 30000);
            System.out.println("Blocked: " + block.get("blocked").getAsBoolean());
            System.out.println("Blocked Until: " + block.get("blockedUntil").getAsLong());
            System.out.println();
            
            // 7. Try to use blocked key
            System.out.println("7. Try to Use Blocked Key");
            JsonObject blockedResult = client.checkRateLimit("spammer-java-456", 10, 1);
            System.out.println("Allowed: " + blockedResult.get("allowed").getAsBoolean());
            System.out.println("Reason: " + blockedResult.get("reason").getAsString());
            System.out.println();
            
            // 8. Unblock the key
            System.out.println("8. Unblock Key");
            JsonObject unblock = client.unblockKey("spammer-java-456");
            System.out.println("Unblocked: " + unblock.get("unblocked").getAsBoolean());
            System.out.println();
            
            // 9. Rate limit exhaustion demo
            System.out.println("9. Rate Limit Exhaustion Demo");
            System.out.println("Making 12 requests with capacity=5...");
            for (int i = 1; i <= 12; i++) {
                JsonObject demoResult = client.checkRateLimit("demo-java-user", 5, 1);
                boolean allowed = demoResult.get("allowed").getAsBoolean();
                double tokens = demoResult.has("tokens") ? demoResult.get("tokens").getAsDouble() : 0;
                String emoji = allowed ? "✓" : "✗";
                System.out.println("  Request #" + i + ": " + emoji + " Allowed=" + allowed + ", Tokens=" + tokens);
                Thread.sleep(100);  // Small delay
            }
            System.out.println();
            
            // 10. Reset limiter
            System.out.println("10. Reset Limiter");
            JsonObject reset = client.resetLimiter("demo-java-user");
            System.out.println("Reset: " + reset.get("reset").getAsBoolean());
            System.out.println();
            
            // 11. List all limiters
            System.out.println("11. List All Limiters");
            JsonObject limiters = client.listLimiters();
            System.out.println("Total Limiters: " + limiters.get("count").getAsInt());
            System.out.println();
            
            // 12. Get metrics
            System.out.println("12. System Metrics");
            JsonObject metrics = client.getMetrics();
            System.out.println("Total Requests: " + metrics.get("totalRequests").getAsInt());
            System.out.println("Allowed: " + metrics.get("allowedRequests").getAsInt());
            System.out.println("Blocked: " + metrics.get("blockedRequests").getAsInt());
            System.out.println("Success Rate: " + String.format("%.1f", metrics.get("successRate").getAsDouble()) + "%");
            System.out.println();
            
            // 13. Cleanup
            System.out.println("13. Cleanup - Delete Test Limiters");
            String[] keys = {"user-java-123", "demo-java-user", "spammer-java-456"};
            for (String key : keys) {
                client.deleteLimiter(key);
                System.out.println("  Deleted: " + key);
            }
            System.out.println();
            
            System.out.println("============================================================");
            System.out.println("Demo completed successfully!");
            System.out.println("============================================================");
            
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
