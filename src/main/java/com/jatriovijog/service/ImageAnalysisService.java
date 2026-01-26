package com.jatriovijog.service;



import com.fasterxml.jackson.databind.JsonNode;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Value;

import org.springframework.http.*;

import org.springframework.stereotype.Service;

import org.springframework.web.client.RestTemplate;



import java.util.*;



@Service

public class ImageAnalysisService {



        @Value("${gemini.api.key}")

        private String apiKey;



        private static final String GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";



        // ---------------------------------------------------------

        // IMAGE ANALYSIS ONLY

        // ---------------------------------------------------------

        public String analyzeImage(String imageUrl) {



                try {

                        RestTemplate restTemplate = new RestTemplate();



                        HttpHeaders headers = new HttpHeaders();

                        headers.setContentType(MediaType.APPLICATION_JSON);



                        String prompt = "Analyze the image carefully and describe what is happening. " +

                                        "Focus only on visible details. Do not assume or guess.";



                        Map<String, Object> requestBody = Map.of(

                                        "contents", List.of(

                                                        Map.of(

                                                                        "role", "user",

                                                                        "parts", List.of(

                                                                                        Map.of("text", prompt),

                                                                                        (imageUrl.startsWith(

                                                                                                        "http") ? Map.of(

                                                                                                                        "file_data",

                                                                                                                        Map.of(

                                                                                                                                        "mime_type",

                                                                                                                                        "image/jpeg",

                                                                                                                                        "file_uri",

                                                                                                                                        imageUrl))

                                                                                                                        : Map.of(

                                                                                                                                        "inline_data",

                                                                                                                                        Map.of(

                                                                                                                                                        "mime_type",

                                                                                                                                                        "image/jpeg",

                                                                                                                                                        "data",

                                                                                                                                                        imageUrl.contains(

                                                                                                                                                                        ",") ? imageUrl.split(",")[1]

                                                                                                                                                                                        : imageUrl)))))));



                        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);



                        ResponseEntity<String> response = restTemplate.postForEntity(

                                        GEMINI_URL + "?key=" + apiKey,

                                        entity,

                                        String.class);



                        ObjectMapper mapper = new ObjectMapper();

                        JsonNode root = mapper.readTree(response.getBody());



                        JsonNode candidates = root.path("candidates");

                        if (candidates.isArray() && candidates.size() > 0) {

                                JsonNode content = candidates.get(0).path("content");

                                JsonNode parts = content.path("parts");



                                if (parts.isArray() && parts.size() > 0) {

                                        return parts.get(0).path("text").asText();

                                }

                        }



                        // Return a safe error message if no valid content is found

                        return "⚠️ Image analysis could not be generated (Safety filter or empty response).";



                } catch (Exception e) {

                        e.printStackTrace();

                        return "❌ Image analysis failed: " + e.getMessage();

                }

        }

}