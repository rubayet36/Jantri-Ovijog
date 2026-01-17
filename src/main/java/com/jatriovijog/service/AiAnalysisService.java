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
import java.util.Map;

@Service
public class AiAnalysisService {

    @Value("${gemini.api.key}")
    private String apiKey;

    private static final String GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=";

    public Map<String, String> analyzeComplaint(String description) {
        RestTemplate restTemplate = new RestTemplate();
        Map<String, String> result = new HashMap<>();

        try {
            // ✅ UPDATED PROMPT: Matches your Frontend Categories exactly
            String prompt =
                "You are a complaint analysis AI. Analyze this passenger complaint: \"" + description + "\"\n\n" +
                "Return a strict JSON object with 3 fields:\n" +
                "1. \"category\": Choose the BEST fit from this exact list:\n" +
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
                "   - \"Other\"\n\n" +
                "2. \"priority\": \"High\" (if dangerous, violence, harassment, theft), \"Medium\" (if money/service issue), \"Low\" (minor).\n" +
                "3. \"is_fake\": true/false (true if spam/gibberish).\n\n" +
                "JSON ONLY. No markdown.";

            // Safety: Escape the prompt to prevent JSON breakage
            String safePrompt = new ObjectMapper().writeValueAsString(prompt);
            String requestBody = "{ \"contents\": [{ \"parts\": [{ \"text\": " + safePrompt + " }] }] }";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(requestBody, headers);

            ResponseEntity<String> response = restTemplate.postForEntity(GEMINI_URL + apiKey, entity, String.class);

            // Parsing
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response.getBody());
            String aiText = root.path("candidates").get(0).path("content").path("parts").get(0).path("text").asText();

            // Cleaner
            int firstBracket = aiText.indexOf("{");
            int lastBracket = aiText.lastIndexOf("}");
            if (firstBracket != -1 && lastBracket != -1) {
                aiText = aiText.substring(firstBracket, lastBracket + 1);
            }

            JsonNode jsonResult = mapper.readTree(aiText);
            
            result.put("category", jsonResult.get("category").asText());
            result.put("priority", jsonResult.get("priority").asText());
            result.put("is_fake", String.valueOf(jsonResult.get("is_fake").asBoolean()));

        } catch (Exception e) {
            System.err.println("❌ AI Service Error: " + e.getMessage());
            e.printStackTrace(); // Keep this to see the error in console
            result.put("category", "Other");
            result.put("priority", "Low");
            result.put("is_fake", "false");
        }

        return result;
    }
}