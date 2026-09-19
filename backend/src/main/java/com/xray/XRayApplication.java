package com.xray;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class XRayApplication {
    public static void main(String[] args) {
        SpringApplication.run(XRayApplication.class, args);
    }
}
