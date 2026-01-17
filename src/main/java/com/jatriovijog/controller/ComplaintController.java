package com.jatriovijog.controller;

import com.jatriovijog.service.AiAnalysisService;
import com.jatriovijog.service.SupabaseService;
import com.jatriovijog.util.JwtUtil;
import io.jsonwebtoken.Claims;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/complaints")
public class ComplaintController {

    private final SupabaseService supabaseService;
    private final JwtUtil jwtUtil;
    private final AiAnalysisService aiAnalysisService;

    // ✅ CONSTRUCTOR WITH DEBUG LOG
    public ComplaintController(SupabaseService supabaseService, JwtUtil jwtUtil, AiAnalysisService aiAnalysisService) {
        this.supabaseService = supabaseService;
        this.jwtUtil = jwtUtil;
        this.aiAnalysisService = aiAnalysisService;
        
        // 👇 THIS PROVES THE NEW CODE IS RUNNING
        System.out.println("🔥 COMPLAINT CONTROLLER LOADED WITH AI SERVICE! 🔥");
    }

    @GetMapping
    public Mono<List<Map<String, Object>>> getAllComplaints() {
        return supabaseService.getComplaints();
    }

    @PostMapping
    public Mono<Map<String, Object>> createComplaint(
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {

        Map<String, Object> fixed = new HashMap<>();

        // 1. Get Description
        String description = (String) payload.get("description");
        fixed.put("description", description);

        // --- START AI INTEGRATION ---
        boolean isFake = false;

        // Only call AI if description exists
        if (description != null && !description.isEmpty()) {
            try {
                // LOGGING INPUT
                System.out.println("🤖 Sending to AI: " + description);
                
                // CALL SERVICE
                Map<String, String> analysis = aiAnalysisService.analyzeComplaint(description);
                
                // LOGGING OUTPUT
                System.out.println("✅ AI Result: " + analysis);

                // 2. Check Fake Status
                // Boolean.parseBoolean returns false if null, so this is safe
                isFake = Boolean.parseBoolean(analysis.get("is_fake"));

                if (isFake) {
                    // ⛔ IF FAKE: Force status to 'fake', priority 'Low', category 'Spam'
                    System.out.println("⛔ Detected FAKE complaint. Marking as Spam.");
                    fixed.put("status", "fake");
                    fixed.put("priority", "Low");
                    fixed.put("category", "Other"); // Or "Spam" if your DB allows
                } else {
                    // ✅ IF REAL: Use AI priority
                    fixed.put("priority", analysis.get("priority"));
                    fixed.put("status", payload.getOrDefault("status", "new"));
                    
                    // Auto-fill category if user didn't select one
                    String userCategory = (String) payload.get("category");
                    if (userCategory == null || userCategory.trim().isEmpty()) {
                        fixed.put("category", analysis.get("category"));
                    } else {
                        fixed.put("category", userCategory);
                    }
                }

            } catch (Exception e) {
                // FALLBACK IF AI FAILS
                System.err.println("❌ AI Failed: " + e.getMessage());
                e.printStackTrace();
                fixed.put("priority", "Low");
                fixed.put("status", payload.getOrDefault("status", "new"));
                fixed.put("category", payload.getOrDefault("category", "General"));
            }
        } else {
            // No description provided
            fixed.put("category", payload.get("category"));
            fixed.put("status", payload.getOrDefault("status", "new"));
            fixed.put("priority", "Low");
        }
        // --- END AI INTEGRATION ---

        // ----------------------------
        // Standard Fields
        // ----------------------------
        if (!fixed.containsKey("status")) {
            fixed.put("status", payload.getOrDefault("status", "new"));
        }
        
        fixed.put("thana", payload.get("thana"));
        fixed.put("route", payload.get("route"));
        fixed.put("bus_name", payload.get("busName"));
        fixed.put("bus_number", payload.get("busNumber"));
        fixed.put("image_url", payload.get("imageUrl"));
        fixed.put("reporter_type", payload.get("reporterType"));
        fixed.put("created_at", payload.get("createdAt"));
        fixed.put("reporter_name", payload.get("reporterName"));
        fixed.put("reporter_email", payload.get("reporterEmail"));
        fixed.put("reporter_phone", payload.get("reporterPhone"));
        fixed.put("company_name", payload.get("companyName"));
        fixed.put("landmark", payload.get("landmark"));
        fixed.put("seat_info", payload.get("seatInfo"));

        // User ID Logic
        Object userId = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                String token = authHeader.substring("Bearer ".length()).trim();
                Claims claims = jwtUtil.validateToken(token);
                userId = claims.get("userId");
            } catch (Exception ignored) { }
        }
        if (userId == null) {
            userId = payload.getOrDefault("userId", 1);
        }
        fixed.put("user_id", userId);

        // Location fields
        if (payload.containsKey("latitude")) fixed.put("latitude", payload.get("latitude"));
        if (payload.containsKey("longitude")) fixed.put("longitude", payload.get("longitude"));
        if (payload.containsKey("accuracy")) fixed.put("accuracy", payload.get("accuracy"));

        return supabaseService.createComplaint(fixed);
    }
    
    @PatchMapping("/{id}/status")
    public Mono<Map<String, Object>> updateComplaintStatus(
            @PathVariable("id") long id,
            @RequestBody Map<String, Object> body
    ) {
        String status = String.valueOf(body.getOrDefault("status", "")).toLowerCase().trim();
        Set<String> allowed = Set.of("new", "working", "resolved", "fake");
        if (!allowed.contains(status)) {
            return Mono.error(new IllegalArgumentException("Invalid status. Allowed: new, working, resolved, fake"));
        }
        String note = body.get("note") == null ? null : String.valueOf(body.get("note"));
        return supabaseService.updateComplaintStatus(id, status, note);
    }

    // ✅ NEW ENDPOINT: CHAT-TO-FORM PARSER
    // This receives the raw text from your frontend Chat Box and asks AI to extract details.
    @PostMapping("/parse-chat")
    public Mono<Map<String, Object>> parseChat(@RequestBody Map<String, String> payload) {
        String chatText = payload.get("text");
        if (chatText == null || chatText.isEmpty()) {
            return Mono.just(Map.of("error", "No text provided"));
        }
        
        // Wrap the blocking Service call in Mono so it works with WebFlux
        return Mono.fromCallable(() -> aiAnalysisService.parseComplaintFromChat(chatText));
    }
}