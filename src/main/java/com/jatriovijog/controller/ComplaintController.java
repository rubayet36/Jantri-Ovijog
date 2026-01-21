package com.jatriovijog.controller;

import com.jatriovijog.service.AiAnalysisService;
import com.jatriovijog.service.EmailService;
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
    private final EmailService emailService;

    // ✅ CONSTRUCTOR WITH DEBUG LOG
    public ComplaintController(SupabaseService supabaseService, JwtUtil jwtUtil, AiAnalysisService aiAnalysisService,
            EmailService emailService) {
        this.supabaseService = supabaseService;
        this.jwtUtil = jwtUtil;
        this.aiAnalysisService = aiAnalysisService;
        this.emailService = emailService;

        // 👇 THIS PROVES THE NEW CODE IS RUNNING
        System.out.println("🔥 COMPLAINT CONTROLLER LOADED WITH AI SERVICE! 🔥");
    }

    @GetMapping
    public Mono<List<Map<String, Object>>> getAllComplaints() {
        return supabaseService.getComplaints();
    }

    @GetMapping("/summary")
    public Mono<List<Map<String, Object>>> getComplaintsSummary() {
        return supabaseService.getComplaintsSummary();
    }

    @PostMapping
    public Mono<Map<String, Object>> createComplaint(
            @RequestBody Map<String, Object> payload,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {

        Map<String, Object> fixed = new HashMap<>();

        // 1. Get Description
        String description = (String) payload.get("description");
        fixed.put("description", description);

        // Match bus details
        String busName = (String) payload.get("busName");
        String busNumber = (String) payload.get("busNumber");

        // ---------------------------------------------------------
        // DUPLICATE DETECTION AND MERGING
        // ---------------------------------------------------------
        if (busName != null && busNumber != null && description != null) {
            // A. Find open complaints for this bus
            return supabaseService.getOpenComplaintsByBus(busName, busNumber)
                    .flatMap(existingList -> {
                        // B. Check Duplicate via AI (Blocking call wrapped in Mono)
                        if (!existingList.isEmpty()) {
                            long matchId = aiAnalysisService.checkDuplicate(description, existingList);

                            if (matchId != -1) {
                                System.out.println("🔄 Duplicate Complaint Detected! Matching ID: " + matchId);

                                // Find the specific parent complaint
                                Map<String, Object> parent = existingList.stream()
                                        .filter(c -> ((Number) c.get("id")).longValue() == matchId)
                                        .findFirst()
                                        .orElse(null);

                                if (parent != null) {
                                    String oldDesc = (String) parent.get("description");
                                    // Append new info
                                    String newDesc = oldDesc + "\n\n[Duplicate Report " + java.time.LocalDateTime.now()
                                            + "]: " + description;

                                    Map<String, Object> updatePayload = new HashMap<>();
                                    updatePayload.put("description", newDesc);

                                    return supabaseService.updateComplaint(matchId, updatePayload);
                                }
                            }
                        }
                        // No duplicate found, proceed to create new
                        return finalizeAndCreateComplaint(fixed, payload, authHeader);
                    });
        }

        return finalizeAndCreateComplaint(fixed, payload, authHeader);
    }

    private Mono<Map<String, Object>> finalizeAndCreateComplaint(Map<String, Object> fixed, Map<String, Object> payload,
            String authHeader) {
        String description = (String) fixed.get("description");

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
            } catch (Exception ignored) {
            }
        }
        if (userId == null) {
            userId = payload.getOrDefault("userId", 1);
        }
        fixed.put("user_id", userId);

        // Location fields
        if (payload.containsKey("latitude"))
            fixed.put("latitude", payload.get("latitude"));
        if (payload.containsKey("longitude"))
            fixed.put("longitude", payload.get("longitude"));
        if (payload.containsKey("accuracy"))
            fixed.put("accuracy", payload.get("accuracy"));

        return supabaseService.createComplaint(fixed);
    }

    @PatchMapping("/{id}/status")
    public Mono<Map<String, Object>> updateComplaintStatus(
            @PathVariable("id") long id,
            @RequestBody Map<String, Object> body) {
        String status = String.valueOf(body.getOrDefault("status", "")).toLowerCase().trim();
        Set<String> allowed = Set.of("new", "working", "resolved", "fake");
        if (!allowed.contains(status)) {
            return Mono.error(new IllegalArgumentException("Invalid status. Allowed: new, working, resolved, fake"));
        }
        String note = body.get("note") == null ? null : String.valueOf(body.get("note"));
        return supabaseService.updateComplaintStatus(id, status, note);
    }

    @DeleteMapping("/{id}")
    public Mono<Void> deleteComplaint(@PathVariable("id") long id) {
        return supabaseService.deleteComplaint(id);
    }

    @PatchMapping("/{id}")
    public Mono<Map<String, Object>> updateComplaint(
            @PathVariable("id") long id,
            @RequestBody Map<String, Object> payload) {
        // Prevent editing protected fields
        payload.remove("id");
        payload.remove("user_id");
        payload.remove("created_at");
        // Status updates should go through /status endpoint if complex logic is needed,
        // but for now we allow simple updates here or frontend can filter.

        return supabaseService.updateComplaint(id, payload);
    }

    // ✅ NEW ENDPOINT: CHAT-TO-FORM PARSER
    @PostMapping("/parse-chat")
    public Mono<Map<String, Object>> parseChat(@RequestBody Map<String, String> payload) {
        String chatText = payload.get("text");
        if (chatText == null || chatText.isEmpty()) {
            return Mono.just(Map.of("error", "No text provided"));
        }

        // Wrap the blocking Service call in Mono so it works with WebFlux
        return Mono.fromCallable(() -> aiAnalysisService.parseComplaintFromChat(chatText));
    }

    // ✅ NEW ENDPOINT: RESOLVE COMPLAINT + AUTO EMAIL
    @PostMapping("/{id}/resolve")
    public Mono<Map<String, Object>> resolveComplaint(
            @PathVariable("id") long id,
            @RequestBody Map<String, String> body) {
        String actionTaken = body.get("actionTaken");
        String busName = body.get("busName");
        String category = body.get("category");

        // 1. Generate Professional Email Content via AI
        // (We do this eagerly, though ideally could be async too)
        String emailBody = aiAnalysisService.generateActionReport(category, busName, actionTaken);

        // 2. Update Status in Database & THEN Send Email using the returned data
        return supabaseService.updateComplaintStatus(id, "resolved", actionTaken)
                .flatMap(updatedComplaint -> {
                    // Extract email from the DB record
                    // field might be 'reporter_email' based on createComplaint logic
                    String dbEmail = (String) updatedComplaint.get("reporter_email");

                    if (dbEmail != null && !dbEmail.isEmpty()) {
                        System.out.println("📧 Found reporter email: " + dbEmail + ". Sending update...");
                        // Send Email asynchronously
                        new Thread(() -> {
                            emailService.sendResolutionEmail(
                                    dbEmail,
                                    "Complaint Resolved: Jatri Ovijog #" + id,
                                    emailBody);
                        }).start();
                    } else {
                        System.err.println("⚠️ No reporter_email found for complaint #" + id + ". Email not sent.");
                    }

                    return Mono.just(updatedComplaint);
                });
    }

    // ✅ NEW ENDPOINT: SEND PROJECT UPDATE (ANTIGRAVITY)
    @PostMapping("/send-update")
    public Mono<String> sendProjectUpdate(@RequestBody Map<String, String> payload) {
        String recipient = payload.get("email");
        String details = payload.get("details"); // e.g., "Initial simulation results"

        if (recipient == null || details == null) {
            return Mono.just("Error: 'email' and 'details' are required.");
        }

        // 1. Generate the content using AI (Blocking call wrapped in Mono)
        return Mono.fromCallable(() -> {
            String emailBody = aiAnalysisService.generateProjectEmail("Antigravity Research", details);

            // 2. Send the email using your configured EmailService
            emailService.sendResolutionEmail(
                    recipient,
                    "Project Update: Antigravity Research",
                    emailBody);
            return "Email sent successfully.";
        });
    }
}