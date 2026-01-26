package com.jatriovijog.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SupabaseService {

    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST_OF_MAP = new ParameterizedTypeReference<>() {
    };

    private final WebClient webClient;
    private final String anonKey;
    private final String serviceRoleKey;

    public SupabaseService(@Value("${supabase.url}") String baseUrl,
            @Value("${supabase.apikey}") String anonKey,
            @Value("${supabase.serviceRoleKey:}") String serviceRoleKey) {

        String trimmed = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        String restUrl = trimmed + "/rest/v1";

        this.anonKey = anonKey;
        this.serviceRoleKey = serviceRoleKey;

        // NOTE: no default Authorization header here.
        // We'll attach the correct one per request using auth(...)
        // ✅ FIXED: Increased buffer size to 10MB to handle base64-encoded images in
        // emergency_reports
        this.webClient = WebClient.builder()
                .baseUrl(restUrl)
                .defaultHeader("apikey", anonKey)
                .defaultHeader(HttpHeaders.ACCEPT, "application/json")
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        .maxInMemorySize(10 * 1024 * 1024)) // 10 MB buffer
                .build();
    }

    private Mono<? extends Throwable> mapSupabaseError(ClientResponse res) {
        return res.bodyToMono(String.class)
                .defaultIfEmpty("")
                .map(body -> new RuntimeException("Supabase error (" + res.statusCode() + "): " + body));
    }

    /**
     * Attach auth header:
     * - If service role key exists: use it (prevents RLS 401/42501 for backend
     * writes).
     * - Otherwise fallback to anon key (may fail for writes when RLS is enabled).
     */
    private WebClient.RequestHeadersSpec<?> auth(WebClient.RequestHeadersSpec<?> spec) {
        String bearer = (serviceRoleKey != null && !serviceRoleKey.isBlank()) ? serviceRoleKey : anonKey;
        return spec.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
    }

    // ---------- Complaints ----------

    public Mono<List<Map<String, Object>>> getComplaints() {
        return auth(webClient.get()
                .uri("/complaints?select=*"))
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getComplaintsSummary() {
        // Exclude image_url to reduce payload size
        String columns = "id,status,priority,category,description,thana,route,latitude,longitude,created_at,bus_name,bus_number,reporter_type,accuracy";
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaints")
                        .queryParam("select", columns)
                        .build()))
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getComplaintsByUser(long userId) {
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaints")
                        .queryParam("user_id", "eq." + userId)
                        .queryParam("select", "*")
                        .build()))
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getOpenComplaintsByBus(String busName, String busNumber) {
        // Build filter: status is NOT resolved/fake AND match bus details
        // Note: PostgREST syntax for OR logic or complex text search can be tricky via
        // simple queryParams.
        // Simplified approach: Get all 'new'/'working' complaints for this bus.

        // Construct filter: bus_name=eq.X & bus_number=eq.Y & status=in.(new,working)
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaints")
                        .queryParam("bus_name", "eq." + busName)
                        .queryParam("bus_number", "eq." + busNumber)
                        .queryParam("status", "in.(new,working)")
                        .queryParam("select", "*")
                        .build()))
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getHistoryByBus(String busNumber) {
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaints")
                        .queryParam("bus_number", "eq." + busNumber)
                        .queryParam("select", "*")
                        .build()))
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<Map<String, Object>> createComplaint(Map<String, Object> payload) {

        var req = webClient.post()
                .uri("/complaints")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload);

        return auth(req)
                .header("Prefer", "return=representation")
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .flatMap(list -> {
                    if (list == null || list.isEmpty()) {
                        return Mono.error(new RuntimeException("Supabase createComplaint returned 0 rows"));
                    }
                    return Mono.just(list.get(0));
                });
    }

    public Mono<Map<String, Object>> updateComplaintStatus(long id, String status, String note) {

        Map<String, Object> payload = new HashMap<>();
        payload.put("status", status);
        if (note != null && !note.trim().isEmpty())
            payload.put("verification_note", note.trim());

        // ✅ AUTO-LOWER PRIORITY ON RESOLUTION
        if ("resolved".equalsIgnoreCase(status)) {
            payload.put("priority", "Low");
        }

        var req = webClient.patch()
                .uri("/complaints?id=eq." + id)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload);

        return auth(req)
                .header("Prefer", "return=representation")
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .flatMap(list -> {
                    if (list == null || list.isEmpty()) {
                        return Mono.error(new RuntimeException(
                                "Supabase updated 0 rows (wrong id or RLS blocked)"));
                    }
                    return Mono.just(list.get(0));
                });
    }

    // ---------- Emergency Reports ----------

    public Mono<List<Map<String, Object>>> getEmergencies() {
        return auth(webClient.get()
                .uri("/emergency_reports?select=*"))
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getEmergenciesSummary() {
        // Exclude audio_url and image_url to reduce payload size
        // REMOVED 'status' and 'label' as they do not exist in emergency_reports table
        String columns = "id,latitude,longitude,created_at,user_id,accuracy,image_url,description";
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/emergency_reports")
                        .queryParam("select", columns)
                        .build()))
                .retrieve()
                .onStatus(status -> status.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getEmergenciesByUser(long userId) {
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/emergency_reports")
                        .queryParam("user_id", "eq." + userId)
                        .queryParam("select", "*")
                        .build()))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getCommentsByUser(long userId) {
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaint_comments")
                        .queryParam("user_id", "eq." + userId)
                        .queryParam("select", "*")
                        .build()))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getReactionsByUser(long userId) {
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaint_reactions")
                        .queryParam("user_id", "eq." + userId)
                        .queryParam("select", "*")
                        .build()))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<Map<String, Object>> createEmergency(Map<String, Object> payload) {

        var req = webClient.post()
                .uri("/emergency_reports")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload);

        return auth(req)
                .header("Prefer", "return=representation")
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .flatMap(list -> {
                    if (list == null || list.isEmpty()) {
                        return Mono.error(new RuntimeException("Supabase createEmergency returned 0 rows"));
                    }
                    return Mono.just(list.get(0));
                });
    }

    // ---------- Users ----------

    public Mono<Map<String, Object>> createUser(Map<String, Object> payload) {

        var req = webClient.post()
                .uri("/users")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload);

        return auth(req)
                .header("Prefer", "return=representation")
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .flatMap(list -> {
                    if (list == null || list.isEmpty()) {
                        return Mono.error(new RuntimeException("Supabase createUser returned 0 rows"));
                    }
                    return Mono.just(list.get(0));
                });
    }

    public Mono<List<Map<String, Object>>> getUserByEmail(String email) {
        String filter = "?select=*&email=eq." + email;
        return auth(webClient.get()
                .uri("/users" + filter))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<List<Map<String, Object>>> getUserById(long id) {
        String filter = "?select=*&id=eq." + id;
        return auth(webClient.get()
                .uri("/users" + filter))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    // ================================
    // FEED: COMMENTS
    // ================================
    public Mono<List<Map<String, Object>>> listComments(Long complaintId) {
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaint_comments")
                        .queryParam("complaint_id", "eq." + complaintId)
                        .queryParam("order", "created_at.desc")
                        .build()))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP);
    }

    public Mono<Map<String, Object>> createComment(Map<String, Object> payload) {

        var req = webClient.post()
                .uri("/complaint_comments")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload);

        return auth(req)
                .header("Prefer", "return=representation")
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .flatMap(list -> {
                    if (list == null || list.isEmpty()) {
                        return Mono.error(new RuntimeException("Supabase createComment returned 0 rows"));
                    }
                    return Mono.just(list.get(0));
                });
    }

    // ================================
    // FEED: REACTIONS
    // ================================
    public Mono<Map<String, Object>> getReactionCounts(Long complaintId, String clientId) {
        return auth(webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaint_reactions")
                        .queryParam("complaint_id", "eq." + complaintId)
                        .queryParam("select", "reaction_type,client_id")
                        .build()))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .map(list -> {
                    long support = 0, angry = 0, watch = 0;
                    String my = null;

                    for (Map<String, Object> row : list) {
                        String t = String.valueOf(row.get("reaction_type"));
                        if ("support".equals(t))
                            support++;
                        else if ("angry".equals(t))
                            angry++;
                        else if ("watch".equals(t))
                            watch++;

                        if (clientId != null && clientId.equals(String.valueOf(row.get("client_id")))) {
                            my = t;
                        }
                    }

                    Map<String, Object> out = new HashMap<>();
                    out.put("support", support);
                    out.put("angry", angry);
                    out.put("watch", watch);
                    out.put("myReaction", my);
                    return out;
                });
    }

    public Mono<Map<String, Object>> toggleReaction(Map<String, Object> payload) {

        Long complaintId = Long.valueOf(String.valueOf(payload.get("complaint_id")));
        String reactionType = String.valueOf(payload.get("reactionType"));
        String clientId = payload.get("clientId") != null ? String.valueOf(payload.get("clientId")) : null;
        Object userIdObj = payload.get("user_id");

        if (clientId == null || clientId.isBlank()) {
            return Mono.error(new RuntimeException("clientId is required for reactions"));
        }

        Map<String, Object> insert = new HashMap<>();
        insert.put("complaint_id", complaintId);
        insert.put("reaction_type", reactionType);
        insert.put("client_id", clientId);
        if (userIdObj != null)
            insert.put("user_id", userIdObj);

        var req = webClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/complaint_reactions")
                        .queryParam("on_conflict", "complaint_id,client_id")
                        .build())
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(insert);

        return auth(req)
                .header("Prefer", "return=representation,resolution=merge-duplicates")
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .map(list -> Map.of(
                        "ok", true,
                        "reaction", (list == null || list.isEmpty() ? Map.of() : list.get(0))));
    }

    public Mono<Void> deleteComplaint(long id) {
        return auth(webClient.delete()
                .uri("/complaints?id=eq." + id))
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .toBodilessEntity()
                .then();
    }

    public Mono<Map<String, Object>> updateComplaint(long id, Map<String, Object> payload) {
        return auth(webClient.patch()
                .uri("/complaints?id=eq." + id)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(payload))
                .header("Prefer", "return=representation")
                .retrieve()
                .onStatus(s -> s.isError(), this::mapSupabaseError)
                .bodyToMono(LIST_OF_MAP)
                .flatMap(list -> {
                    if (list == null || list.isEmpty()) {
                        return Mono.error(new RuntimeException("Supabase updateComplaint returned 0 rows"));
                    }
                    return Mono.just(list.get(0));
                });
    }
}
