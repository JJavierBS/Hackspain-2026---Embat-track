package com.xray;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication
@ConfigurationPropertiesScan
public class XRayApplication {

    private static String[] args = new String[0];
    private static ConfigurableApplicationContext context;

    public static void main(String[] args) {
        XRayApplication.args = args;
        context = SpringApplication.run(XRayApplication.class, args);
        if (context.getEnvironment().getProperty("xray.suggestions.prepare", Boolean.class, false)) {
            context.close();
        }
    }

    /**
     * Closes the context and boots a new one, so every bean binds the new scoring config.
     * Runs on its own non-daemon thread: the JVM stays up between the two contexts.
     */
    public static void restart() {
        Thread t = new Thread(() -> {
            try {
                Thread.sleep(500); // lets the request that asked for the restart send its answer first
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (context != null) {
                context.close();
            }
            context = SpringApplication.run(XRayApplication.class, args);
        }, "restart");
        t.setDaemon(false);
        t.start();
    }
}
