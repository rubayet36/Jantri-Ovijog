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
    private final AiAnalysisService aiAnalysisService; // 1. Add AI Service here

    // 2. Update Constructor to include AI Service
    public ComplaintController(SupabaseService supabaseService, JwtUtil jwtUtil, AiAnalysisService aiAnalysisService) {
        this.supabaseService = supabaseService;
        this.jwtUtil = jwtUtil;
        this.aiAnalysisService = aiAnalysisService;
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

        String description = (String) payload.get("description");
        fixed.put("description", description);

        // --- START AI INTEGRATION ---
        boolean isFake = false;
        
        if (description != null && !description.isEmpty()) {
            try {
                System.out.println("🤖 Sending to AI: " + description);
                Map<String, String> analysis = aiAnalysisService.analyzeComplaint(description);
                
                System.out.println("✅ AI Result: " + analysis);

                // 1. Check Fake Status
                isFake = Boolean.parseBoolean(analysis.get("is_fake"));

                if (isFake) {
                    // ⛔ IF FAKE: Force status to 'fake' and priority to 'Low'
                    fixed.put("status", "fake");
                    fixed.put("priority", "Low");
                    fixed.put("category", "Spam/Irrelevant"); // Optional: Mark category as Spam
                } else {
                    // ✅ IF REAL: Use AI priority and user status
                    fixed.put("priority", analysis.get("priority"));
                    fixed.put("status", payload.getOrDefault("status", "new")); // Default behavior
                    
                    // Auto-category if missing
                    if (payload.get("category") == null || payload.get("category").toString().isEmpty()) {
                        fixed.put("category", analysis.get("category"));
                    } else {
                        fixed.put("category", payload.get("category"));
                    }
                }

            } catch (Exception e) {
                System.err.println("❌ AI Failed: " + e.getMessage());
                fixed.put("priority", "Low");
                fixed.put("status", payload.getOrDefault("status", "new"));
                fixed.put("category", payload.getOrDefault("category", "General"));
            }
        } else {
            // No description = potentially low quality, but we keep basic logic
            fixed.put("category", payload.get("category"));
            fixed.put("status", payload.getOrDefault("status", "new"));
        }
        // --- END AI INTEGRATION ---

        // ----------------------------
        // Standard Fields
        // ----------------------------
        // Note: If 'status' wasn't set by AI (because no description), set it here
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
}