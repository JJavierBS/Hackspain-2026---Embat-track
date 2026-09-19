package com.xray.application;

/** A bad query parameter. ApiExceptionHandler maps it to HTTP 400. */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) {
        super(message);
    }
}
