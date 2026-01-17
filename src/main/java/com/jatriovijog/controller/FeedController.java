package com.jatriovijog.controller;

import com.jatriovijog.service.SupabaseService;
import com.jatriovijog.util.JwtUtil;
import io.jsonwebtoken.Claims;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class FeedController {

    private final SupabaseService supabase;
    private final JwtUtil jwtUtil;

    public FeedController(SupabaseService supabase, JwtUtil jwtUtil) {
        this.supabase = supabase;
        this.jwtUtil = jwtUtil;
    }

    @GetMapping("/complaints/{id}/comments")
    public Mono<List<Map<String, Object>>> getComments(@PathVariable Long id) {
        return supabase.listComments(id);
    }

    @PostMapping("/complaints/{id}/comments")
    public Mono<Map<String, Object>> addComment(
            @PathVariable Long id,
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        // ✅ whitelist fields to prevent mass-assignment
        Map<String, Object> fixed = new HashMap<>();
        fixed.put("complaint_id", id);

        String authorName = payload.get("author_name") != null
                ? String.valueOf(payload.get("author_name")).trim()
                : "Anonymous";
        fixed.put("author_name", authorName.isEmpty() ? "Anonymous" : authorName);

        String body = payload.get("body") != null ? String.valueOf(payload.get("body")) : "";
        fixed.put("body", body);

        Long userId = extractUserId(authHeader);
        if (userId != null) {
            fixed.put("user_id", userId);
        }

        return supabase.createComment(fixed);
    }

    @GetMapping("/complaints/{id}/reactions")
    public Mono<Map<String, Object>> getReactionCounts(
            @PathVariable Long id,
            @RequestParam(required = false) String clientId
    ) {
        return supabase.getReactionCounts(id, clientId);
    }

    @PostMapping("/complaints/{id}/reactions")
    public Mono<Map<String, Object>> toggleReaction(
            @PathVariable Long id,
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        // ✅ whitelist fields (and enforce clientId)
        Map<String, Object> fixed = new HashMap<>();
        fixed.put("complaint_id", id);

        Object reactionType = payload.get("reactionType");
        if (reactionType == null) {
            return Mono.error(new RuntimeException("reactionType is required"));
        }
        fixed.put("reactionType", String.valueOf(reactionType));

        Object clientId = payload.get("clientId");
        if (clientId == null || String.valueOf(clientId).isBlank()) {
            return Mono.error(new RuntimeException("clientId is required"));
        }
        fixed.put("clientId", String.valueOf(clientId));

        Long userId = extractUserId(authHeader);
        if (userId != null) {
            fixed.put("user_id", userId);
        }

        return supabase.toggleReaction(fixed);
    }

    private Long extractUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        try {
            Claims claims = jwtUtil.validateToken(authHeader.substring("Bearer ".length()).trim());
            Object uid = claims.get("userId");
            return uid == null ? null : Long.valueOf(String.valueOf(uid));
        } catch (Exception e) {
            return null;
        }
    }
}
