package com.jatriovijog.controller;

import com.jatriovijog.service.SupabaseService;
import com.jatriovijog.util.JwtUtil;
import io.jsonwebtoken.Claims;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * Personal dashboard endpoints. These are USER-SCOPED (filtered by user_id).
 *
 * Community feed endpoints remain unchanged and continue to return global data.
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final SupabaseService supabaseService;
    private final JwtUtil jwtUtil;

    public DashboardController(SupabaseService supabaseService, JwtUtil jwtUtil) {
        this.supabaseService = supabaseService;
        this.jwtUtil = jwtUtil;
    }

    private Long extractUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        String token = authHeader.substring("Bearer ".length()).trim();
        try {
            Claims claims = jwtUtil.validateToken(token);
            Object userId = claims.get("userId");
            return userId == null ? null : Long.valueOf(String.valueOf(userId));
        } catch (Exception e) {
            return null;
        }
    }

    @GetMapping("/my-complaints")
    public Mono<ResponseEntity<List<Map<String, Object>>>> getMyComplaints(
            @RequestHeader(name = "Authorization", required = false) String authHeader
    ) {
        Long userId = extractUserId(authHeader);
        if (userId == null) return Mono.just(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
        return supabaseService.getComplaintsByUser(userId).map(ResponseEntity::ok);
    }

    @GetMapping("/my-emergencies")
    public Mono<ResponseEntity<List<Map<String, Object>>>> getMyEmergencies(
            @RequestHeader(name = "Authorization", required = false) String authHeader
    ) {
        Long userId = extractUserId(authHeader);
        if (userId == null) return Mono.just(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
        return supabaseService.getEmergenciesByUser(userId).map(ResponseEntity::ok);
    }

    @GetMapping("/my-comments")
    public Mono<ResponseEntity<List<Map<String, Object>>>> getMyComments(
            @RequestHeader(name = "Authorization", required = false) String authHeader
    ) {
        Long userId = extractUserId(authHeader);
        if (userId == null) return Mono.just(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
        return supabaseService.getCommentsByUser(userId).map(ResponseEntity::ok);
    }

    @GetMapping("/my-reactions")
    public Mono<ResponseEntity<List<Map<String, Object>>>> getMyReactions(
            @RequestHeader(name = "Authorization", required = false) String authHeader
    ) {
        Long userId = extractUserId(authHeader);
        if (userId == null) return Mono.just(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
        return supabaseService.getReactionsByUser(userId).map(ResponseEntity::ok);
    }
}
