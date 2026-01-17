package com.jatriovijog.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiAnalysisService {

    @Value("${groq.api.key}")
    private String apiKey;

    // ✅ Groq API Endpoint
    private static final String GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

    public Map<String, String> analyzeComplaint(String description) {
        RestTemplate restTemplate = new RestTemplate();
        Map<String, String> result = new HashMap<>();

        try {
            // 1. Prepare Headers (Groq uses Bearer Token)
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + apiKey);

            // 2. Define the System Prompt (The Rules)
            String systemPrompt = 
                "You are a complaint analysis AI. Analyze the user's passenger complaint.\n" +
                "Return a strict JSON object with these 3 fields:\n" +
                "1. \"category\": Choose the BEST fit from this list:\n" +
                "   - \"Fare Dispute / Overcharging\"\n" +
                "   - \"Harassment (verbal/physical)\"\n" +
                "   - \"Women/Reserved Seat Violation\"\n" +
                "   - \"Reckless / Speeding / Racing\"\n" +
                "   - \"Driving Under Influence (suspected)\"\n" +
                "   - \"Overcrowding / Door Hanging\"\n" +
                "   - \"Skipping Stops / Not Stopping at Stand\"\n" +
                "   - \"Illegal / Random Stoppage\"\n" +
                "   - \"Unsafe Bus Condition (no fitness)\"\n" +
                "   - \"Pickpocketing / Theft\"\n" +
                "   - \"Staff Misbehaviour / Abuse\"\n" +
                "   - \"Corrupt Ticketing / Fake Receipts\"\n" +
                "   - \"Other\"\n" +
                "2. \"priority\": \"High\" (dangerous/violence), \"Medium\", \"Low\".\n" +
                "3. \"is_fake\": true (if spam/gibberish) or false.\n" +
                "Return JSON ONLY.";

            // 3. Build Request Body (OpenAI Format)
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", "llama-3.3-70b-versatile"); // Use Llama 3 for speed/intelligence
            
            // Enable JSON Mode (Crucial for Groq reliability)
            requestBody.put("response_format", Map.of("type", "json_object"));

            requestBody.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", description)
            ));

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            // 4. Send Request
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_URL, entity, String.class);

            // 5. Parse Response
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response.getBody());
            
            // Groq Path: choices[0].message.content
            String aiText = root.path("choices").get(0).path("message").path("content").asText();

            // 6. Final JSON Parsing
            JsonNode jsonResult = mapper.readTree(aiText);
            
            result.put("category", jsonResult.path("category").asText("Other"));
            result.put("priority", jsonResult.path("priority").asText("Low"));
            result.put("is_fake", String.valueOf(jsonResult.path("is_fake").asBoolean(false)));

        } catch (Exception e) {
            System.err.println("❌ Groq AI Service Error: " + e.getMessage());
            e.printStackTrace();
            // Fallback
            result.put("category", "Other");
            result.put("priority", "Low");
            result.put("is_fake", "false");
        }

        return result;
    }
}