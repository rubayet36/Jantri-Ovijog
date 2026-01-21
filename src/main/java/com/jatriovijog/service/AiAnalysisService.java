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
import java.util.ArrayList;

@Service
public class AiAnalysisService {

    @Value("${groq.api.key}")
    private String apiKey;

    // ✅ Groq API Endpoint
    private static final String GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
    private static final String MODEL_NAME = "llama-3.3-70b-versatile";

    // ---------------------------------------------------------
    // METHOD 1: ANALYZE COMPLAINT
    // ---------------------------------------------------------
    public Map<String, String> analyzeComplaint(String description) {
        RestTemplate restTemplate = new RestTemplate();
        Map<String, String> result = new HashMap<>();

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + apiKey);

            String systemPrompt = "You are an expert Complaint Analyzer and Translator for Dhaka, Bangladesh.\n" +
                    "1. TRANSLATION: If the user input is in Bangla (e.g. 'আমার টাকা ফেরত চাই') or Banglish (e.g. 'Bhai bus e dhakka dise'), translate it into clear English internally.\n"
                    +
                    "2. CLASSIFICATION: Analyze the (translated) text.\n" +
                    "3. OUTPUT: Return a strict JSON object with these 4 fields:\n" +
                    "   - \"translated_text\": String (The English translation. If input was already English, return it as is).\n"
                    +
                    "   - \"category\": Choose BEST fit from: ['Fare Dispute / Overcharging', 'Harassment (verbal/physical)', 'Women/Reserved Seat Violation', 'Reckless / Speeding / Racing', 'Driving Under Influence (suspected)', 'Overcrowding / Door Hanging', 'Skipping Stops', 'Illegal Stoppage', 'Unsafe Bus Condition', 'Pickpocketing / Theft', 'Staff Misbehaviour / Abuse', 'Corrupt Ticketing', 'Other'].\n"
                    +
                    "   - \"priority\": 'High' (danger/violence), 'Medium', 'Low'.\n" +
                    "   - \"is_fake\": boolean (true if spam/gibberish).\n" +
                    "Return JSON ONLY.";

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", MODEL_NAME);
            requestBody.put("response_format", Map.of("type", "json_object"));

            requestBody.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", description)));

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_URL, entity, String.class);

            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response.getBody());
            String aiText = root.path("choices").get(0).path("message").path("content").asText();

            JsonNode jsonResult = mapper.readTree(aiText);

            result.put("category", jsonResult.path("category").asText("Other"));
            result.put("priority", jsonResult.path("priority").asText("Low"));
            result.put("is_fake", String.valueOf(jsonResult.path("is_fake").asBoolean(false)));
            result.put("translated_text", jsonResult.path("translated_text").asText(description));

        } catch (Exception e) {
            System.err.println("❌ Groq Analysis Error: " + e.getMessage());
            e.printStackTrace();
            result.put("category", "Other");
            result.put("priority", "Low");
            result.put("is_fake", "false");
            result.put("translated_text", description);
        }

        return result;
    }

    // ---------------------------------------------------------
    // METHOD 2: CHAT PARSER
    // ---------------------------------------------------------
    public Map<String, Object> parseComplaintFromChat(String userText) {
        RestTemplate restTemplate = new RestTemplate();
        Map<String, Object> result = new HashMap<>();

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + apiKey);

            String systemPrompt = "You are a Complaint Parser. Extract details from the user's story.\n" +
                    "Return ONLY a JSON object with these keys (use null if not found):\n" +
                    "- \"incidentType\": String (Category)\n" +
                    "- \"busName\": String\n" +
                    "- \"busNumber\": String\n" +
                    "- \"location\": String\n" +
                    "- \"thana\": String\n" +
                    "- \"description\": String (Summary)\n\n" +
                    "JSON ONLY.";

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", MODEL_NAME);
            requestBody.put("response_format", Map.of("type", "json_object"));

            requestBody.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userText)));

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_URL, entity, String.class);

            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response.getBody());
            String aiText = root.path("choices").get(0).path("message").path("content").asText();

            result = mapper.readValue(aiText, Map.class);

        } catch (Exception e) {
            System.err.println("❌ Groq Chat Parser Error: " + e.getMessage());
            result.put("error", "Failed to parse");
        }
        return result;
    }

    // ---------------------------------------------------------
    // METHOD 3: GENERATE ACTION REPORT
    // ---------------------------------------------------------
    public String generateActionReport(String category, String busName, String actionTaken) {
        RestTemplate restTemplate = new RestTemplate();
        String report = "";

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + apiKey);

            String systemPrompt = "You are a professional Police Communications Officer. Write a polite, formal, and reassuring message to a citizen.";

            String userPrompt = String.format(
                    "Draft a short response to a complainant. " +
                            "Details: Complaint about '%s' on bus '%s' has been resolved. " +
                            "Action Taken: %s. " +
                            "The tone should be professional and encourage them to report again if needed.",
                    category, busName, actionTaken);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", MODEL_NAME);
            requestBody.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)));

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_URL, entity, String.class);

            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response.getBody());
            report = root.path("choices").get(0).path("message").path("content").asText();

        } catch (Exception e) {
            System.err.println("❌ Groq Action Report Error: " + e.getMessage());
            report = "Dear Citizen, your complaint regarding " + busName + " has been resolved. Action: " + actionTaken;
        }
        return report;
    }

    // ---------------------------------------------------------
    // METHOD 3.5: GENERATE PROJECT EMAIL (Antigravity)
    // ---------------------------------------------------------
    public String generateProjectEmail(String projectTopic, String updateDetails) {
        RestTemplate restTemplate = new RestTemplate();
        String emailBody = "";

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + apiKey);

            String systemPrompt = "You are a professional technical communication assistant. " +
                    "Your task is to draft a formal, clear, and concise email update based on the project details provided by the user. "
                    +
                    "Do not invent facts; only format the provided details into a professional email structure.";

            String userPrompt = String.format(
                    "Project Topic: %s\n" +
                            "Key Update/Details: %s\n\n" +
                            "Draft the email body.",
                    projectTopic, updateDetails);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", MODEL_NAME);
            requestBody.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)));

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_URL, entity, String.class);

            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response.getBody());
            emailBody = root.path("choices").get(0).path("message").path("content").asText();

        } catch (Exception e) {
            System.err.println("❌ Groq Project Email Error: " + e.getMessage());
            emailBody = "Project Update: " + projectTopic + "\n\nDetails: " + updateDetails;
        }
        return emailBody;
    }

    // ---------------------------------------------------------
    // METHOD 4: DUPLICATE CHECK (Returns ID of match, or -1 if none)
    // ---------------------------------------------------------
    public long checkDuplicate(String currentDescription, List<Map<String, Object>> recentComplaints) {
        if (recentComplaints == null || recentComplaints.isEmpty()) {
            return -1;
        }

        RestTemplate restTemplate = new RestTemplate();
        long matchId = -1;

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + apiKey);

            StringBuilder recentText = new StringBuilder();
            for (Map<String, Object> c : recentComplaints) {
                recentText.append(String.format("- [ID: %s] %s\n", c.get("id"), c.get("description")));
            }

            String systemPrompt = "You are an Incident Clustering AI. " +
                    "Compare the 'New Complaint' with the 'Recent Complaints'. " +
                    "Return a JSON object: {\"match_id\": 123} if the new complaint describes the SAME incident/event as complaint 123. If no match, return {\"match_id\": -1}.\n"
                    +
                    "If multiple match, choose the most recent ID.\n" +
                    "JSON ONLY.";

            String userPrompt = "New Complaint: \"" + currentDescription + "\"\n\n" +
                    "Recent Complaints on same bus:\n" + recentText.toString();

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", MODEL_NAME);
            requestBody.put("response_format", Map.of("type", "json_object"));
            requestBody.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)));

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GROQ_URL, entity, String.class);

            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response.getBody());
            String aiText = root.path("choices").get(0).path("message").path("content").asText();

            JsonNode jsonResult = mapper.readTree(aiText);
            matchId = jsonResult.path("match_id").asLong(-1);

        } catch (Exception e) {
            System.err.println("❌ Groq Duplicate Check Error: " + e.getMessage());
            matchId = -1;
        }
        return matchId;
    }
}