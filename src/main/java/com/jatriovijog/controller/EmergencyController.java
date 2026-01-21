package com.jatriovijog.controller;

import com.jatriovijog.service.SupabaseService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/emergencies")
public class EmergencyController {

    private final SupabaseService supabaseService;

    public EmergencyController(SupabaseService supabaseService) {
        this.supabaseService = supabaseService;
    }

    @GetMapping
    public Mono<List<Map<String, Object>>> getAllEmergencies() {
        return supabaseService.getEmergencies();
    }

    @GetMapping("/summary")
    public Mono<List<Map<String, Object>>> getEmergenciesSummary() {
        return supabaseService.getEmergenciesSummary();
    }

    @PostMapping
    public Mono<Map<String, Object>> createEmergency(@Valid @RequestBody Map<String, Object> payload) {
        // ✅ whitelist fields to prevent mass-assignment
        Map<String, Object> fixed = new HashMap<>();

        // map known camelCase keys to snake_case (only if present)
        if (payload.containsKey("audioUrl"))
            fixed.put("audio_url", payload.get("audioUrl"));
        // FIX: Frontend sends 'audio' (Base64), map it to 'audio_url' column
        if (payload.containsKey("audio"))
            fixed.put("audio_url", payload.get("audio"));

        // Image support
        if (payload.containsKey("imageUrl"))
            fixed.put("image_url", payload.get("imageUrl"));
        if (payload.containsKey("image"))
            fixed.put("image_url", payload.get("image"));

        if (payload.containsKey("userId"))
            fixed.put("user_id", payload.get("userId"));

        // allow common geo fields if present
        if (payload.containsKey("latitude"))
            fixed.put("latitude", payload.get("latitude"));
        if (payload.containsKey("longitude"))
            fixed.put("longitude", payload.get("longitude"));
        if (payload.containsKey("accuracy"))
            fixed.put("accuracy", payload.get("accuracy"));

        // optional metadata fields (only include if you actually have these columns)
        if (payload.containsKey("label"))
            fixed.put("label", payload.get("label"));
        if (payload.containsKey("notes"))
            fixed.put("notes", payload.get("notes"));

        return supabaseService.createEmergency(fixed);
    }
}
