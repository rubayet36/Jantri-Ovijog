package com.jatriovijog.controller;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.jatriovijog.service.SupabaseService;
import com.jatriovijog.util.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@Validated
public class AuthController {

    private final SupabaseService supabaseService;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    @Value("${google.client.id}")
    private String googleClientId;

    public AuthController(SupabaseService supabaseService,
                          PasswordEncoder passwordEncoder,
                          JwtUtil jwtUtil) {
        this.supabaseService = supabaseService;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/signup")
    public Mono<ResponseEntity<?>> signUp(@RequestBody Map<String, String> request) {
        String name = request.getOrDefault("name", "").trim();
        String email = request.getOrDefault("email", "").trim();
        String password = request.getOrDefault("password", "");
        String role = "user";

        if (name.isEmpty() || email.isEmpty() || password.isEmpty()) {
            return Mono.just(ResponseEntity.badRequest()
                    .body(Map.of("error", "Name, email and password are required")));
        }

        return supabaseService.getUserByEmail(email)
                .flatMap(users -> {
                    if (!users.isEmpty()) {
                        return Mono.just(ResponseEntity.badRequest()
                                .body(Map.of("error", "Email already in use")));
                    }

                    Map<String, Object> payload = new HashMap<>();
                    payload.put("name", name);
                    payload.put("email", email);
                    payload.put("password", passwordEncoder.encode(password));
                    payload.put("role", role);

                    return supabaseService.createUser(payload)
                            .map(user -> {
                                user.remove("password");
                                return ResponseEntity.ok().body(user);
                            });
                });
    }

    @PostMapping("/login")
    public Mono<ResponseEntity<?>> login(@RequestBody Map<String, String> request) {
        String email = request.getOrDefault("email", "").trim();
        String password = request.getOrDefault("password", "");

        if (email.isEmpty() || password.isEmpty()) {
            return Mono.just(ResponseEntity.badRequest()
                    .body(Map.of("error", "Email and password are required")));
        }

        return supabaseService.getUserByEmail(email)
                .flatMap(users -> {
                    if (users.isEmpty()) {
                        return Mono.just(ResponseEntity.status(401)
                                .body(Map.of("error", "Invalid credentials")));
                    }

                    @SuppressWarnings("unchecked")
                    Map<String, Object> user = (Map<String, Object>) users.get(0);
                    String hashed = (String) user.get("password");

                    if (hashed == null || !passwordEncoder.matches(password, hashed)) {
                        return Mono.just(ResponseEntity.status(401)
                                .body(Map.of("error", "Invalid credentials")));
                    }

                    return generateResponse(user, email);
                });
    }

    @PostMapping("/google")
    public Mono<ResponseEntity<?>> googleLogin(@RequestBody Map<String, String> request) {
        String idTokenString = request.get("credential");
        String role = request.getOrDefault("role", "user");

        return Mono.fromCallable(() -> {
            // 1. Verify Google Token
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            GoogleIdToken idToken = verifier.verify(idTokenString);
            if (idToken == null) {
                throw new RuntimeException("Invalid Google Token");
            }
            return idToken.getPayload();
        })
        .flatMap(payload -> {
            String email = payload.getEmail();
            String name = (String) payload.get("name");

            // 2. Check if user exists in YOUR database (public.users)
            return supabaseService.getUserByEmail(email)
                    .flatMap(users -> {
                        if (!users.isEmpty()) {
                            // --- User Exists: Log them in ---
                            @SuppressWarnings("unchecked")
                            Map<String, Object> user = (Map<String, Object>) users.get(0);
                            return generateResponse(user, email);
                        } else {
                            // --- User New: Create Account ---
                            Map<String, Object> newPayload = new HashMap<>();
                            newPayload.put("name", name);
                            newPayload.put("email", email);
                            // Generate random password so DB doesn't complain
                            newPayload.put("password", passwordEncoder.encode(UUID.randomUUID().toString()));
                            newPayload.put("role", role);

                            return supabaseService.createUser(newPayload)
                                    .flatMap(createdUser -> generateResponse(createdUser, email));
                        }
                    });
        })
        .onErrorResume(e -> {
            e.printStackTrace();
            return Mono.just(ResponseEntity.status(401).body(Map.of("error", "Google Auth Failed: " + e.getMessage())));
        });
    }

    private Mono<ResponseEntity<?>> generateResponse(Map<String, Object> user, String email) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", user.get("id"));
        claims.put("role", user.get("role"));

        String token = jwtUtil.generateToken(claims, email);
        user.remove("password"); // Security: Remove hash

        Map<String, Object> response = new HashMap<>();
        response.put("token", token);
        response.put("user", user);

        return Mono.just(ResponseEntity.ok(response));
    }
}