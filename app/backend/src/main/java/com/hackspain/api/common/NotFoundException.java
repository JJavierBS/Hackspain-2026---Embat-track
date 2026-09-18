package com.hackspain.api.common;

/**
 * Thrown by a service when a lookup by id finds nothing.
 * {@link ApiExceptionHandler} turns this into a 404 ProblemDetail.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    public static NotFoundException forId(String entity, Object id) {
        return new NotFoundException(entity + " " + id + " not found");
    }
}
