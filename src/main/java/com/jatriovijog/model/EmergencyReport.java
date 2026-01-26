package com.jatriovijog.model;

public class EmergencyReport {
    private Long id;
    private Double latitude;
    private Double longitude;
    private Double accuracy;
    private String audioUrl;
    private String createdAt;
    private Long userId;

    public EmergencyReport() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public Double getAccuracy() { return accuracy; }
    public void setAccuracy(Double accuracy) { this.accuracy = accuracy; }

    public String getAudioUrl() { return audioUrl; }
    public void setAudioUrl(String audioUrl) { this.audioUrl = audioUrl; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
}
