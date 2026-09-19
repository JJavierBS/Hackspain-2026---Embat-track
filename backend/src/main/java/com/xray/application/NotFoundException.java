package com.xray.application;

/** An unknown entity. ApiExceptionHandler maps it to HTTP 404. */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
