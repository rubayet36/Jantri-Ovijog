package com.jatriovijog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the Spring Boot backend. This class simply boots the
 * application. All components, controllers and configuration classes are
 * automatically picked up thanks to component scanning.
 */
@SpringBootApplication
public class JatriOvijogApplication {

    public static void main(String[] args) {
        SpringApplication.run(JatriOvijogApplication.class, args);
    }
}